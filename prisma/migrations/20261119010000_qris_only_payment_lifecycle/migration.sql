ALTER TYPE "ReconciliationSource" ADD VALUE 'CUSTOMER';

ALTER TABLE "Payment"
ADD COLUMN "expiresAt" TIMESTAMP(3);
