CREATE TYPE "EmailOutboxStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED');
CREATE TYPE "ReconciliationSource" AS ENUM ('ADMIN', 'SCHEDULED');
CREATE TYPE "ReconciliationOutcome" AS ENUM ('APPLIED', 'NO_CHANGE', 'REVIEW_REQUIRED', 'FAILED');

CREATE TABLE "PaymentReconciliation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "initiatedById" TEXT,
    "source" "ReconciliationSource" NOT NULL,
    "previousPaymentStatus" "PaymentStatus" NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "resultingPaymentStatus" "PaymentStatus" NOT NULL,
    "resultingOrderStatus" "OrderStatus" NOT NULL,
    "outcome" "ReconciliationOutcome" NOT NULL,
    "reason" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lockToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailOutbox_idempotencyKey_key" ON "EmailOutbox"("idempotencyKey");
CREATE INDEX "EmailOutbox_status_availableAt_createdAt_idx" ON "EmailOutbox"("status", "availableAt", "createdAt");
CREATE INDEX "EmailOutbox_status_updatedAt_idx" ON "EmailOutbox"("status", "updatedAt");
CREATE INDEX "PaymentReconciliation_paymentId_createdAt_idx" ON "PaymentReconciliation"("paymentId", "createdAt");
CREATE INDEX "PaymentReconciliation_source_outcome_createdAt_idx" ON "PaymentReconciliation"("source", "outcome", "createdAt");

ALTER TABLE "PaymentReconciliation"
ADD CONSTRAINT "PaymentReconciliation_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentReconciliation"
ADD CONSTRAINT "PaymentReconciliation_initiatedById_fkey"
FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
