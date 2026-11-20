import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  createMidtransEventKey,
  mapMidtransPaymentStatus,
  midtransAmountMatches,
  verifyMidtransSignature,
} from "@/lib/midtrans-webhook";
import { applyPaymentTransition } from "@/lib/payment-transitions";

const webhookSchema = z.object({
  order_id: z.string().min(1).max(100),
  status_code: z.string().regex(/^\d{3}$/),
  gross_amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
  signature_key: z.string().length(128).regex(/^[a-f0-9]+$/i),
  transaction_status: z.string().min(1).max(32),
  transaction_id: z.string().min(1).max(100),
  payment_type: z.string().max(64).optional(),
  fraud_status: z.string().max(32).optional(),
}).passthrough();

export async function POST(request: Request) {
  try {
    await enforceRateLimit(request, { namespace: "midtrans-webhook", limit: 600, windowMs: 60_000 });
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) throw new HttpError(503, "Payment webhook is not configured", "PAYMENTS_NOT_CONFIGURED");
    const notification = webhookSchema.parse(await readJson(request, 16_384));
    if (!verifyMidtransSignature(
      notification.signature_key,
      notification.order_id,
      notification.status_code,
      notification.gross_amount,
      serverKey,
    )) {
      throw new HttpError(401, "Invalid payment notification signature", "INVALID_SIGNATURE");
    }

    const payment = await prisma.payment.findUnique({
      where: { providerOrderId: notification.order_id },
      include: { order: true },
    });
    if (!payment || payment.provider !== "midtrans" ||
        !midtransAmountMatches(notification.gross_amount, payment.amountInIdr) ||
        !midtransAmountMatches(notification.gross_amount, payment.order.totalInIdr)) {
      throw new HttpError(400, "Payment reference or amount does not match", "PAYMENT_MISMATCH");
    }

    const eventKey = createMidtransEventKey(
      notification.order_id,
      notification.transaction_status,
      notification.transaction_id,
      notification.status_code,
    );
    const nextStatus = mapMidtransPaymentStatus(notification.transaction_status, notification.fraud_status);
    await prisma.$transaction(async (tx) => {
      await tx.paymentWebhookEvent.create({
        data: {
          paymentId: payment.id,
          eventKey,
          payload: JSON.parse(JSON.stringify(notification)) as Prisma.InputJsonValue,
          processedAt: new Date(),
        },
      });
      return applyPaymentTransition(tx, {
        paymentId: payment.id,
        nextStatus,
        paymentType: notification.payment_type,
        transactionId: notification.transaction_id,
        eventKey,
      });
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    return errorResponse(error);
  }
}
