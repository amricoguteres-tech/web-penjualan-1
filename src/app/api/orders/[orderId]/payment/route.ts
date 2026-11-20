import { NextResponse } from "next/server";
import { ReconciliationSource } from "@prisma/client";
import { requireUser } from "@/lib/auth-guards";
import { errorResponse, HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { enforceRateLimit } from "@/lib/rate-limit";
import { reconcilePayment } from "@/lib/payment-reconciliation";

type RouteContext = { params: Promise<{ orderId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { orderId } = await params;
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: user.id },
      select: {
        id: true,
        status: true,
        totalInIdr: true,
        payment: {
          select: {
            status: true,
            paymentType: true,
            transactionToken: true,
            expiresAt: true,
            updatedAt: true,
          },
        },
        invoice: { select: { invoiceNumber: true } },
      },
    });
    if (!order?.payment) throw new HttpError(404, "Payment was not found", "PAYMENT_NOT_FOUND");
    return NextResponse.json({
      payment: {
        orderId: order.id,
        orderStatus: order.status,
        amountInIdr: order.totalInIdr,
        status: order.payment.status,
        paymentType: order.payment.paymentType,
        transactionToken: order.payment.status === "PENDING" && order.status === "PENDING"
          ? order.payment.transactionToken
          : null,
        expiresAt: order.payment.expiresAt,
        updatedAt: order.payment.updatedAt,
        invoiceNumber: order.invoice?.invoiceNumber ?? null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, { namespace: "customer-payment-check", limit: 6, windowMs: 5 * 60_000 });
    const user = await requireUser();
    const { orderId } = await params;
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: user.id },
      select: { payment: { select: { id: true } } },
    });
    if (!order?.payment) throw new HttpError(404, "Payment was not found", "PAYMENT_NOT_FOUND");
    const result = await reconcilePayment({
      paymentId: order.payment.id,
      initiatedById: user.id,
      source: ReconciliationSource.CUSTOMER,
      reason: "Customer requested a QRIS payment status check",
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
