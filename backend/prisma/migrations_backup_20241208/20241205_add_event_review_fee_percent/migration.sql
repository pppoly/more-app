-- Add review fields to events
ALTER TABLE "Event"
ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT DEFAULT 'pending_review',
ADD COLUMN IF NOT EXISTS "reviewReason" TEXT,
ADD COLUMN IF NOT EXISTS "reviewReviewedAt" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "reviewReviewerId" TEXT;

-- Add feePercent to payments
ALTER TABLE "Payment"
ADD COLUMN IF NOT EXISTS "feePercent" DOUBLE PRECISION;
