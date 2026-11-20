import { OrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { assertSameOrigin } from "@/lib/request-security";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { enqueueEmail } from "@/lib/email-outbox";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  status: z.nativeEnum(OrderStatus).optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const where = query.status ? { status: query.status } : {};
    const [orders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          items: { include: { product: { select: { name: true, slug: true } } } },
          payment: { select: { status: true, provider: true, paymentType: true, amountInIdr: true, updatedAt: true } },
          invoice: { select: { invoiceNumber: true, paidAt: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * 50,
        take: 50,
      }),
      prisma.order.count({ where }),
    ]);
    return NextResponse.json({ orders, page: query.page, total, pages: Math.ceil(total / 50) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const schema = z.object({
      orderId: z.string().min(1).max(64),
      status: z.enum(["PROCESSING", "COMPLETED"]),
    }).strict();
    const { orderId, status } = schema.parse(await readJson(request));
    const order = await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({ where: { id: orderId }, include: { payment: true, user: { select: { email: true, name: true } } } });
      if (!current) throw new HttpError(404, "Order not found", "ORDER_NOT_FOUND");
      if (!current.payment || current.payment.status !== "SETTLEMENT" ||
          (status === "COMPLETED" && current.status !== "PROCESSING") ||
          (status === "PROCESSING" && current.status !== "PAID")) {
        throw new HttpError(409, "Order status transition is not allowed", "INVALID_ORDER_TRANSITION");
      }
      const updated = await tx.order.update({ where: { id: orderId }, data: { status } });
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "order.status.update", entityType: "Order", entityId: orderId, metadata: { from: current.status, to: status } },
      });
      await tx.notification.create({
        data: { userId: current.userId, title: "Order updated", body: `Your order ${orderId} is now ${status.toLowerCase()}.` },
      });
      await enqueueEmail(tx, {
        to: current.user.email,
        subject: "NEBULA X order status updated",
        text: `Hello ${current.user.name ?? "customer"}, order ${orderId} is now ${status.toLowerCase()}. Check your dashboard for details.`,
      }, `order-status:${orderId}:${status}:${updated.updatedAt.toISOString()}`);
      return updated;
    });
    return NextResponse.json({ order });
  } catch (error) {
    return errorResponse(error);
  }
}
