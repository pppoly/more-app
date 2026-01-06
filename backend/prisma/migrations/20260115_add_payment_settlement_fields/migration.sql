-- Add settlement and refund tracking fields for Stripe Destination charges
ALTER TABLE "Payment"
  ADD COLUMN "stripeTransferId" TEXT,
  ADD COLUMN "stripeFeeAmountActual" INTEGER,
  ADD COLUMN "stripeFeeAmountEstimated" INTEGER,
  ADD COLUMN "merchantTransferAmount" INTEGER,
  ADD COLUMN "refundedGrossTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundedPlatformFeeTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reversedMerchantTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stripeFeeReversalId" TEXT;
