-- Settlement rule fields and audit tables

ALTER TABLE "Event" ADD COLUMN "eventEndAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "refundDeadlineAt" TIMESTAMP(3);

ALTER TABLE "Lesson" ADD COLUMN "eventEndAt" TIMESTAMP(3);
ALTER TABLE "Lesson" ADD COLUMN "refundDeadlineAt" TIMESTAMP(3);

ALTER TABLE "Payment" ADD COLUMN "eligibleAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "payoutMode" TEXT;
ALTER TABLE "Payment" ADD COLUMN "eligibilityStatus" TEXT;
ALTER TABLE "Payment" ADD COLUMN "payoutStatus" TEXT;
ALTER TABLE "Payment" ADD COLUMN "reasonCode" TEXT;
ALTER TABLE "Payment" ADD COLUMN "ruleVersionId" TEXT;

CREATE TABLE "SettlementRuleVersion" (
  "id" TEXT NOT NULL,
  "name" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SettlementRuleVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SettlementAuditEvent" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "operator" TEXT NOT NULL,
  "reasonCode" TEXT,
  "note" TEXT,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ruleVersionId" TEXT,
  CONSTRAINT "SettlementAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Payment_eligibleAt_idx" ON "Payment"("eligibleAt");
CREATE INDEX "Payment_eligibilityStatus_eligibleAt_idx" ON "Payment"("eligibilityStatus", "eligibleAt");
CREATE INDEX "Payment_payoutStatus_idx" ON "Payment"("payoutStatus");
CREATE INDEX "Payment_reasonCode_idx" ON "Payment"("reasonCode");

CREATE INDEX "SettlementRuleVersion_status_idx" ON "SettlementRuleVersion"("status");
CREATE INDEX "SettlementAuditEvent_entityType_entityId_idx" ON "SettlementAuditEvent"("entityType", "entityId");
CREATE INDEX "SettlementAuditEvent_reasonCode_idx" ON "SettlementAuditEvent"("reasonCode");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_ruleVersionId_fkey"
  FOREIGN KEY ("ruleVersionId") REFERENCES "SettlementRuleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SettlementAuditEvent" ADD CONSTRAINT "SettlementAuditEvent_ruleVersionId_fkey"
  FOREIGN KEY ("ruleVersionId") REFERENCES "SettlementRuleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
