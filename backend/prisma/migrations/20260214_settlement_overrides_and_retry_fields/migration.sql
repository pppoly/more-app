-- Community settlement rule overrides (optional, stricter-than-default).
ALTER TABLE "Community" ADD COLUMN "settlementDelayDaysOverride" INTEGER;
ALTER TABLE "Community" ADD COLUMN "settlementMinTransferAmountOverride" INTEGER;

-- SettlementItem retry scheduling for transfer failures.
ALTER TABLE "SettlementItem" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SettlementItem" ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

CREATE INDEX "SettlementItem_nextAttemptAt_idx" ON "SettlementItem"("nextAttemptAt");
