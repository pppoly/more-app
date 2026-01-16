-- Add ChargeModel enum and Payment.chargeModel (default to platform_charge)
CREATE TYPE "ChargeModel" AS ENUM ('platform_charge', 'destination_charge');

ALTER TABLE "Payment"
  ADD COLUMN "chargeModel" "ChargeModel" NOT NULL DEFAULT 'platform_charge';

-- Event inbox for webhook idempotency
CREATE TABLE "EventInbox" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "payloadHash" TEXT,
  "processedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "nextAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventInbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventInbox_type_eventId_key" ON "EventInbox"("type", "eventId");
CREATE INDEX "EventInbox_processedAt_idx" ON "EventInbox"("processedAt");
CREATE INDEX "EventInbox_nextAttemptAt_idx" ON "EventInbox"("nextAttemptAt");

-- Settlement batching (delayed transfer to connected accounts)
CREATE TABLE "SettlementBatch" (
  "id" TEXT NOT NULL,
  "periodFrom" TIMESTAMP(3) NOT NULL,
  "periodTo" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'jpy',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SettlementBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SettlementBatch_periodFrom_idx" ON "SettlementBatch"("periodFrom");
CREATE INDEX "SettlementBatch_periodTo_idx" ON "SettlementBatch"("periodTo");
CREATE INDEX "SettlementBatch_status_idx" ON "SettlementBatch"("status");

CREATE TABLE "SettlementItem" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "hostId" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'jpy',
  "hostBalance" INTEGER NOT NULL,
  "settleAmount" INTEGER NOT NULL,
  "carryReceivable" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "counts" JSONB,
  "stripeTransferId" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SettlementItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SettlementItem_batchId_hostId_key" ON "SettlementItem"("batchId", "hostId");
CREATE INDEX "SettlementItem_batchId_idx" ON "SettlementItem"("batchId");
CREATE INDEX "SettlementItem_hostId_idx" ON "SettlementItem"("hostId");
CREATE INDEX "SettlementItem_status_idx" ON "SettlementItem"("status");

ALTER TABLE "SettlementItem"
  ADD CONSTRAINT "SettlementItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SettlementBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SettlementItem"
  ADD CONSTRAINT "SettlementItem_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

