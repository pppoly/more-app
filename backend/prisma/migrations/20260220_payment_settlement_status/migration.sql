-- Add settlement status tracking to payments.
CREATE TYPE "SettlementStatus" AS ENUM ('unsettled', 'settled');

ALTER TABLE "Payment"
ADD COLUMN "settlementStatus" "SettlementStatus" NOT NULL DEFAULT 'unsettled',
ADD COLUMN "settlementAmount" INTEGER,
ADD COLUMN "settledAt" TIMESTAMP(3);

CREATE INDEX "Payment_settlementStatus_idx" ON "Payment"("settlementStatus");
