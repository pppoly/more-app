-- Add ChargeModel enum and Payment.chargeModel (default to platform_charge)
DO $$ BEGIN
  CREATE TYPE "ChargeModel" AS ENUM ('platform_charge', 'destination_charge');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "chargeModel" "ChargeModel" NOT NULL DEFAULT 'platform_charge';

-- Event inbox for webhook idempotency
CREATE TABLE IF NOT EXISTS "EventInbox" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "payloadHash" TEXT,
  "processedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "nextAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventInbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventInbox_type_eventId_key" ON "EventInbox"("type", "eventId");
CREATE INDEX IF NOT EXISTS "EventInbox_processedAt_idx" ON "EventInbox"("processedAt");
CREATE INDEX IF NOT EXISTS "EventInbox_nextAttemptAt_idx" ON "EventInbox"("nextAttemptAt");

-- Settlement batching (delayed transfer to connected accounts)
CREATE TABLE IF NOT EXISTS "SettlementBatch" (
  "id" TEXT NOT NULL,
  "periodFrom" TIMESTAMP(3) NOT NULL,
  "periodTo" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'jpy',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SettlementBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SettlementBatch_periodFrom_idx" ON "SettlementBatch"("periodFrom");
CREATE INDEX IF NOT EXISTS "SettlementBatch_periodTo_idx" ON "SettlementBatch"("periodTo");
CREATE INDEX IF NOT EXISTS "SettlementBatch_status_idx" ON "SettlementBatch"("status");

CREATE TABLE IF NOT EXISTS "SettlementItem" (
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SettlementItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SettlementItem_batchId_hostId_key" ON "SettlementItem"("batchId", "hostId");
CREATE INDEX IF NOT EXISTS "SettlementItem_batchId_idx" ON "SettlementItem"("batchId");
CREATE INDEX IF NOT EXISTS "SettlementItem_hostId_idx" ON "SettlementItem"("hostId");
CREATE INDEX IF NOT EXISTS "SettlementItem_status_idx" ON "SettlementItem"("status");

-- FKs might already exist; add them only if missing
DO $$ BEGIN
  ALTER TABLE "SettlementItem"
    ADD CONSTRAINT "SettlementItem_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "SettlementBatch"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SettlementItem"
    ADD CONSTRAINT "SettlementItem_hostId_fkey"
    FOREIGN KEY ("hostId") REFERENCES "Community"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

