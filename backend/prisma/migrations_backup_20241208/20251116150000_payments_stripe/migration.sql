-- Add Stripe + pricing fields to communities
ALTER TABLE "Community"
    ADD COLUMN     "pricingPlanId" TEXT,
    ADD COLUMN     "stripeAccountId" TEXT,
    ADD COLUMN     "stripeSubscriptionId" TEXT,
    ADD COLUMN     "stripeCustomerId" TEXT;

-- Event refund policy config
ALTER TABLE "Event"
    ADD COLUMN     "refundPolicy" JSONB;

-- Extend payments table for Stripe Checkout support
DROP INDEX IF EXISTS "Payment_transactionId_key";

ALTER TABLE "Payment"
    DROP COLUMN IF EXISTS "transactionId",
    ADD COLUMN     "communityId" TEXT,
    ADD COLUMN     "registrationId" TEXT,
    ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'jpy',
    ADD COLUMN     "stripePaymentIntentId" TEXT,
    ADD COLUMN     "stripeChargeId" TEXT,
    ADD COLUMN     "stripeRefundId" TEXT,
    ADD COLUMN     "stripeCheckoutSessionId" TEXT,
    ALTER COLUMN    "method" SET DEFAULT 'stripe',
    ALTER COLUMN    "status" SET DEFAULT 'pending',
    ALTER COLUMN    "platformFee" SET DEFAULT 0;

-- Pricing plan + fee policy tables
CREATE TABLE "PricingPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyFee" INTEGER NOT NULL,
    "transactionFeePercent" DOUBLE PRECISION NOT NULL,
    "transactionFeeFixed" INTEGER NOT NULL,
    "payoutSchedule" TEXT NOT NULL,
    "features" JSONB,
    "stripePriceId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PricingPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeePolicy" (
    "id" TEXT NOT NULL,
    "pricingPlanId" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "fixed" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3),
    CONSTRAINT "FeePolicy_pkey" PRIMARY KEY ("id")
);

-- New indexes for payment relations
CREATE UNIQUE INDEX "Payment_registrationId_key" ON "Payment"("registrationId");
CREATE UNIQUE INDEX "Payment_stripeCheckoutSessionId_key" ON "Payment"("stripeCheckoutSessionId");

-- Foreign key constraints
ALTER TABLE "Community"
    ADD CONSTRAINT "Community_pricingPlanId_fkey" FOREIGN KEY ("pricingPlanId") REFERENCES "PricingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FeePolicy"
    ADD CONSTRAINT "FeePolicy_pricingPlanId_fkey" FOREIGN KEY ("pricingPlanId") REFERENCES "PricingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
