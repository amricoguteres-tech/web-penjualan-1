import { OrderStatus, PaymentStatus, ReconciliationOutcome, ReconciliationSource } from "@prisma/client";
import { z } from "zod";
import { HttpError } from "@/lib/http";
import { midtransApiBaseUrl } from "@/lib/midtrans-config";
import { createMidtransEventKey, mapMidtransPaymentStatus, midtransAmountMatches } from "@/lib/midtrans-webhook";
import { applyPaymentTransition } from "@/lib/payment-transitions";
import { prisma } from "@/lib/prisma";

const providerStatusSchema = z.object({
  order_id: z.string().min(1).max(100),
  status_code: z.string().regex(/^\d{3}$/),
  gross_amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
  transaction_status: z.string().min(1).max(32),
  transaction_id: z.string().min(1).max(100),
  payment_type: z.string().max(64).nullable().optional(),
  fraud_status: z.string().max(32).nullable().optional(),
}).passthrough();

function outcomeFromTransition(outcome: string): ReconciliationOutcome {
  if (outcome === "applied") return ReconciliationOutcome.APPLIED;
  if (outcome === "review_required") return ReconciliationOutcome.REVIEW_REQUIRED;
  return ReconciliationOutcome.NO_CHANGE;
}

async function recordFailedReconciliation(input: {
  paymentId: string;
  initiatedById?: string;
  source: ReconciliationSource;
  reason: string;
  providerStatus: string;
}) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: input.paymentId },
      include: { order: { select: { status: true } } },
    });
    const record = await tx.paymentReconciliation.create({
      data: {
        paymentId: payment.id,
        initiatedById: input.initiatedById,
        source: input.source,
        previousPaymentStatus: payment.status,
        providerStatus: input.providerStatus,
        resultingPaymentStatus: payment.status,
        resultingOrderStatus: payment.order.status,
        outcome: ReconciliationOutcome.FAILED,
        reason: input.reason.slice(0, 500),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.initiatedById,
        action: "payment.reconciliation.failed",
        entityType: "Payment",
        entityId: payment.id,
        metadata: { source: input.source, providerStatus: input.providerStatus, reconciliationId: record.id },
      },
    });
    return record;
  });
}

export async function reconcilePayment(input: {
  paymentId: string;
  initiatedById?: string;
  source: ReconciliationSource;
  reason: string;
}) {
  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    select: {
      id: true,
      provider: true,
      providerOrderId: true,
      amountInIdr: true,
      order: { select: { totalInIdr: true } },
    },
  });
  if (!payment || payment.provider !== "midtrans") {
    throw new HttpError(404, "Midtrans payment was not found", "PAYMENT_NOT_FOUND");
  }
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    await recordFailedReconciliation({ ...input, providerStatus: "NOT_CONFIGURED", reason: "Midtrans Server Key is not configured" });
    throw new HttpError(503, "Payment reconciliation is not configured", "PAYMENTS_NOT_CONFIGURED");
  }

  let response: Response;
  let status: z.infer<typeof providerStatusSchema>;
  try {
    response = await fetch(
      `${midtransApiBaseUrl()}/v2/${encodeURIComponent(payment.providerOrderId)}/status`,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    const raw = await response.json();
    status = providerStatusSchema.parse(raw);
    if (!response.ok) throw new Error("Status API returned an unsuccessful response");
  } catch {
    await recordFailedReconciliation({
      ...input,
      providerStatus: "API_UNAVAILABLE",
      reason: "Midtrans status API request failed or returned an invalid response",
    });
    throw new HttpError(502, "Midtrans status could not be verified", "MIDTRANS_STATUS_UNAVAILABLE");
  }

  if (
    status.order_id !== payment.providerOrderId ||
    !midtransAmountMatches(status.gross_amount, payment.amountInIdr) ||
    !midtransAmountMatches(status.gross_amount, payment.order.totalInIdr)
  ) {
    await recordFailedReconciliation({
      ...input,
      providerStatus: status.transaction_status,
      reason: "Midtrans status response order reference or amount did not match",
    });
    throw new HttpError(502, "Midtrans status response did not match the stored payment", "MIDTRANS_STATUS_MISMATCH");
  }

  const nextStatus = mapMidtransPaymentStatus(status.transaction_status, status.fraud_status ?? undefined);
  const eventKey = createMidtransEventKey(
    status.order_id,
    status.transaction_status,
    status.transaction_id,
    status.status_code,
  );
  return prisma.$transaction(async (tx) => {
    const before = await tx.payment.findUniqueOrThrow({
      where: { id: payment.id },
      include: { order: { select: { status: true } } },
    });
    const applied = await applyPaymentTransition(tx, {
      paymentId: payment.id,
      nextStatus,
      paymentType: status.payment_type,
      transactionId: status.transaction_id,
      eventKey,
    });
    const record = await tx.paymentReconciliation.create({
      data: {
        paymentId: payment.id,
        initiatedById: input.initiatedById,
        source: input.source,
        previousPaymentStatus: before.status,
        providerStatus: status.transaction_status,
        resultingPaymentStatus: applied.paymentStatus,
        resultingOrderStatus: applied.orderStatus,
        outcome: outcomeFromTransition(applied.outcome),
        reason: input.reason.slice(0, 500),
        providerTransactionId: status.transaction_id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.initiatedById,
        action: "payment.reconciliation.completed",
        entityType: "Payment",
        entityId: payment.id,
        metadata: {
          source: input.source,
          providerStatus: status.transaction_status,
          outcome: outcomeFromTransition(applied.outcome),
          reconciliationId: record.id,
        },
      },
    });
    return {
      reconciliationId: record.id,
      paymentStatus: applied.paymentStatus,
      orderStatus: applied.orderStatus,
      providerStatus: status.transaction_status,
      outcome: record.outcome,
    };
  });
}

export async function reconcileStaleMidtransPayments(limit = 25) {
  const now = new Date();
  const stalePendingBefore = new Date(now.getTime() - 15 * 60 * 1000);
  const recentWindow = new Date(now.getTime() - 15 * 60 * 1000);
  const lookback = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  const candidates = await prisma.payment.findMany({
    where: {
      provider: "midtrans",
      createdAt: { gte: lookback },
      OR: [
        {
          status: PaymentStatus.PENDING,
          updatedAt: { lte: stalePendingBefore },
        },
        {
          status: { in: [PaymentStatus.FAILED, PaymentStatus.EXPIRED] },
          updatedAt: { lte: stalePendingBefore },
          order: { status: { in: [OrderStatus.CANCELLED, OrderStatus.PENDING] } },
        },
      ],
      reconciliations: { none: { createdAt: { gte: recentWindow } } },
    },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: Math.min(50, Math.max(1, limit)),
  });
  const results = [];
  for (const candidate of candidates) {
    try {
      results.push(await reconcilePayment({
        paymentId: candidate.id,
        source: ReconciliationSource.SCHEDULED,
        reason: "Scheduled stale-payment reconciliation",
      }));
    } catch (error) {
      results.push({
        paymentId: candidate.id,
        outcome: "failed",
        error: error instanceof HttpError ? error.code : "RECONCILIATION_FAILED",
      });
    }
  }
  return { examined: candidates.length, results };
}
