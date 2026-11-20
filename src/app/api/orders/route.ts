import { randomUUID } from "node:crypto";
import { OrderStatus, PaymentStatus, ProductStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guards";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/request-security";
import { calculateCouponDiscount } from "@/lib/order-pricing";
import { getEnabledMidtransMethods, midtransBaseUrl } from "@/lib/midtrans-config";
import { createQrisSnapPayload, getQrisPaymentExpiry } from "@/lib/midtrans-qris";
import { enqueueEmail } from "@/lib/email-outbox";

const checkoutSchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1).max(64),
    quantity: z.number().int().min(1).max(10),
  }).strict()).min(1).max(20),
  couponCode: z.string().trim().min(1).max(40).optional(),
}).strict().superRefine(({ items }, context) => {
  const ids = items.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["items"], message: "Duplicate product IDs are not allowed" });
  }
});

const midtransResponseSchema = z.object({
  token: z.string().min(1),
  redirect_url: z.string().optional(),
  status_message: z.string().max(500).optional(),
}).passthrough();

export async function GET() {
  try {
    const user = await requireUser();
    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      include: {
        items: { include: { product: { select: { name: true, slug: true, imageUrl: true, digitalAsset: { select: { id: true } } } } } },
        payment: { select: { status: true, paymentType: true, expiresAt: true, updatedAt: true } },
        invoice: { select: { invoiceNumber: true, amountInIdr: true, issuedAt: true, paidAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ orders });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, { namespace: "checkout", limit: 8, windowMs: 60 * 60 * 1000 });
    const user = await requireUser();
    const body = checkoutSchema.parse(await readJson(request));
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey || !z.string().uuid().safeParse(idempotencyKey).success) {
      throw new HttpError(400, "A valid Idempotency-Key UUID header is required", "INVALID_IDEMPOTENCY_KEY");
    }

    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) throw new HttpError(503, "Payments are not configured", "PAYMENTS_NOT_CONFIGURED");
    if (!getEnabledMidtransMethods().includes("qris")) {
      throw new HttpError(503, "QRIS payments are not configured", "PAYMENTS_NOT_CONFIGURED");
    }

    const prior = await prisma.payment.findUnique({
      where: { idempotencyKey },
      include: { order: { select: { userId: true, id: true, totalInIdr: true, status: true } } },
    });
    if (prior) {
      if (prior.order.userId !== user.id) throw new HttpError(409, "Idempotency key already used", "IDEMPOTENCY_CONFLICT");
      if (prior.order.status === OrderStatus.PENDING &&
          prior.status === PaymentStatus.PENDING &&
          prior.transactionToken) {
        return NextResponse.json({ orderId: prior.orderId, paymentUrl: `/payments/${prior.orderId}`, reused: true });
      }
      if (prior.order.status === OrderStatus.PENDING && prior.status === PaymentStatus.PENDING) {
        throw new HttpError(409, "This checkout attempt is already being processed", "CHECKOUT_IN_PROGRESS");
      }
      throw new HttpError(409, "This checkout attempt is closed. Check order history and the merchant dashboard before starting another payment.", "CHECKOUT_ALREADY_CLOSED");
    }

    const created = await prisma.$transaction(async (tx) => {
          const products = await tx.product.findMany({
            where: { id: { in: body.items.map((item) => item.productId) }, status: ProductStatus.ACTIVE },
            select: { id: true, name: true, priceInIdr: true, stock: true },
          });
          if (products.length !== body.items.length) {
            throw new HttpError(400, "One or more products are unavailable", "PRODUCT_UNAVAILABLE");
          }

          let subtotal = 0;
          const lineItems = body.items.map((line) => {
            const product = products.find((candidate) => candidate.id === line.productId);
            if (!product) throw new HttpError(400, "Product is unavailable", "PRODUCT_UNAVAILABLE");
            subtotal += product.priceInIdr * line.quantity;
            if (!Number.isSafeInteger(subtotal) || subtotal > 1_000_000_000) {
              throw new HttpError(400, "Order total is outside the supported range", "INVALID_TOTAL");
            }
            return { product, quantity: line.quantity };
          });

          let discount = 0;
          let coupon: { id: string; discountType: "PERCENTAGE" | "FIXED"; discountValue: number; minimumOrderInIdr: number; maxUses: number | null; maxUsesPerUser: number | null; startsAt: Date; expiresAt: Date | null; active: boolean } | null = null;
          if (body.couponCode) {
            coupon = await tx.coupon.findUnique({
              where: { code: body.couponCode.toUpperCase() },
              select: { id: true, discountType: true, discountValue: true, minimumOrderInIdr: true, maxUses: true, maxUsesPerUser: true, startsAt: true, expiresAt: true, active: true },
            });
            const now = new Date();
            if (!coupon || !coupon.active || coupon.startsAt > now || (coupon.expiresAt && coupon.expiresAt <= now)) {
              throw new HttpError(400, "Coupon is invalid or expired", "INVALID_COUPON");
            }
            if (subtotal < coupon.minimumOrderInIdr) throw new HttpError(400, "Order does not meet the coupon minimum", "COUPON_MINIMUM_NOT_MET");
            const qualifyingOrders = { order: { status: { not: OrderStatus.CANCELLED } } } as const;
            const usageCount = await tx.couponUsage.count({ where: { couponId: coupon.id, ...qualifyingOrders } });
            const userUsageCount = await tx.couponUsage.count({ where: { couponId: coupon.id, userId: user.id, ...qualifyingOrders } });
            if ((coupon.maxUses !== null && usageCount >= coupon.maxUses) ||
                (coupon.maxUsesPerUser !== null && userUsageCount >= coupon.maxUsesPerUser)) {
              throw new HttpError(400, "Coupon usage limit reached", "COUPON_LIMIT_REACHED");
            }
            discount = calculateCouponDiscount(subtotal, coupon.discountType, coupon.discountValue);
          }

          const totalInIdr = subtotal - discount;
          if (totalInIdr < 1) {
            throw new HttpError(400, "The coupon must leave a payable balance of at least Rp1", "ZERO_TOTAL_ORDER");
          }
          for (const { product, quantity } of lineItems) {
            if (product.stock !== null) {
              const reservation = await tx.product.updateMany({
                where: { id: product.id, status: ProductStatus.ACTIVE, stock: { gte: quantity } },
                data: { stock: { decrement: quantity } },
              });
              if (reservation.count !== 1) throw new HttpError(409, `${product.name} is out of stock`, "OUT_OF_STOCK");
            }
          }

          const order = await tx.order.create({
            data: {
              userId: user.id,
              totalInIdr,
              items: { create: lineItems.map(({ product, quantity }) => ({
                productId: product.id,
                quantity,
                unitPriceInIdr: product.priceInIdr,
              })) },
              invoice: {
                create: {
                  invoiceNumber: `NX-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
                  amountInIdr: totalInIdr,
                  dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                },
              },
              ...(coupon ? { couponUsage: { create: { couponId: coupon.id, userId: user.id } } } : {}),
            },
          });
          const providerOrderId = `nebula-${order.id}`;
          await tx.payment.create({
            data: {
              orderId: order.id,
              provider: "midtrans",
              providerOrderId,
              idempotencyKey,
              amountInIdr: totalInIdr,
              paymentType: "qris",
            },
          });
          return { orderId: order.id, providerOrderId, totalInIdr };
        }, { isolationLevel: "Serializable" });

    const order = await prisma.order.findFirst({
      where: { id: created.orderId, userId: user.id },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    const customer = await prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true },
    });
    if (!order || !customer) throw new HttpError(404, "Checkout order could not be found", "ORDER_NOT_FOUND");

    let response: Response;
    let providerResult: z.infer<typeof midtransResponseSchema>;
    const snapRequestedAt = new Date();
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
      response = await fetch(`${midtransBaseUrl()}/snap/v1/transactions`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(createQrisSnapPayload({
          orderId: created.providerOrderId,
          amountInIdr: created.totalInIdr,
          customerName: customer.name ?? "Customer",
          customerEmail: customer.email,
          siteUrl,
          returnOrderId: created.orderId,
          startTime: snapRequestedAt,
        })),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      providerResult = midtransResponseSchema.parse(await response.json());
    } catch (error) {
      await cancelFailedCheckout(created.orderId);
      console.error("Could not reach Midtrans transaction API.", error);
      throw new HttpError(502, "The payment provider response is uncertain. Check order history and the merchant dashboard before starting another payment.", "PAYMENT_PROVIDER_UNAVAILABLE");
    }
    if (!response.ok) {
      await cancelFailedCheckout(created.orderId);
      console.error("Midtrans transaction creation failed:", response.status, providerResult.status_message);
      throw new HttpError(502, "The payment provider could not create a QRIS transaction. Check order history before starting another payment.", "PAYMENT_PROVIDER_ERROR");
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { orderId: created.orderId },
        data: {
          transactionToken: providerResult.token,
          redirectUrl: providerResult.redirect_url,
          expiresAt: getQrisPaymentExpiry(snapRequestedAt),
          paymentType: "qris",
        },
      });
      await tx.notification.create({
        data: {
          userId: user.id,
          title: "Order created",
          body: `Order ${created.orderId} is ready and awaiting payment.`,
        },
      });
      await enqueueEmail(tx, {
        to: customer.email,
        subject: "NEBULA X order created",
        text: `Hello ${customer.name ?? "customer"}, order ${created.orderId} has been created and is awaiting payment. Complete payment using the secure checkout link.`,
      }, `order-created:${created.orderId}`);
    });
    return NextResponse.json({ orderId: created.orderId, paymentUrl: `/payments/${created.orderId}` }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return errorResponse(new HttpError(409, "This checkout request was already processed", "IDEMPOTENCY_CONFLICT"));
    }
    return errorResponse(error);
  }
}

async function cancelFailedCheckout(orderId: string) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, payment: true },
    });
    if (!order || order.status !== OrderStatus.PENDING) return;
    if (!order.payment) return;
    const failed = await tx.payment.updateMany({
      where: { id: order.payment.id, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.FAILED },
    });
    if (failed.count !== 1) return;
    const cancelled = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.PENDING },
      data: { status: OrderStatus.CANCELLED },
    });
    if (cancelled.count !== 1) return;
    for (const item of order.items) {
      await tx.product.updateMany({
        where: { id: item.productId, stock: { not: null } },
        data: { stock: { increment: item.quantity } },
      });
    }
  });
}
