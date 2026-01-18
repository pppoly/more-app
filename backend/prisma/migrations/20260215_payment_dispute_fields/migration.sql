-- Track Stripe dispute linkage for settlement blocking + admin diagnostics.
ALTER TABLE "Payment" ADD COLUMN "stripeDisputeId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "stripeDisputeStatus" TEXT;
ALTER TABLE "Payment" ADD COLUMN "stripeDisputedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "stripeDisputeResolvedAt" TIMESTAMP(3);

CREATE INDEX "Payment_stripeDisputeId_idx" ON "Payment"("stripeDisputeId");
