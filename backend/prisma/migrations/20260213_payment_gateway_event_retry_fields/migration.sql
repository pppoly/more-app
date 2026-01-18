-- PaymentGatewayEvent: add retry scheduling + updatedAt for durable webhook processing
ALTER TABLE "PaymentGatewayEvent" ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

ALTER TABLE "PaymentGatewayEvent"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill updatedAt for existing rows
UPDATE "PaymentGatewayEvent"
SET "updatedAt" = COALESCE("receivedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE "updatedAt" IS NULL;

-- Seed retry schedule for unprocessed Stripe webhook events already persisted
UPDATE "PaymentGatewayEvent"
SET "nextAttemptAt" = CURRENT_TIMESTAMP
WHERE "provider" = 'stripe'
  AND "providerEventId" IS NOT NULL
  AND "processedAt" IS NULL
  AND "nextAttemptAt" IS NULL;

-- Align with Prisma @updatedAt (Prisma writes the value; DB default not required)
ALTER TABLE "PaymentGatewayEvent" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE INDEX "PaymentGatewayEvent_nextAttemptAt_idx" ON "PaymentGatewayEvent"("nextAttemptAt");
CREATE INDEX "PaymentGatewayEvent_processedAt_idx" ON "PaymentGatewayEvent"("processedAt");

