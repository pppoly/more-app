-- Settlement batch scheduling fields

ALTER TABLE "SettlementBatch" ADD COLUMN "triggerType" TEXT;
ALTER TABLE "SettlementBatch" ADD COLUMN "cutoffAt" TIMESTAMP(3);
ALTER TABLE "SettlementBatch" ADD COLUMN "scheduledAt" TIMESTAMP(3);
ALTER TABLE "SettlementBatch" ADD COLUMN "totalAmount" INTEGER;
ALTER TABLE "SettlementBatch" ADD COLUMN "successCount" INTEGER;
ALTER TABLE "SettlementBatch" ADD COLUMN "failedCount" INTEGER;
ALTER TABLE "SettlementBatch" ADD COLUMN "blockedCount" INTEGER;
ALTER TABLE "SettlementBatch" ADD COLUMN "reasonCodeSummary" JSONB;

CREATE INDEX "SettlementBatch_scheduledAt_idx" ON "SettlementBatch"("scheduledAt");
