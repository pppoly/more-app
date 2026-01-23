-- Add settlement frozen flag for payouts

ALTER TABLE "Payment" ADD COLUMN "settlementFrozen" BOOLEAN NOT NULL DEFAULT false;
