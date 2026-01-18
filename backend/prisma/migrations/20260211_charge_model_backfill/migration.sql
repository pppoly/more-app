-- Prevent mislabeling pre-existing destination charges as platform charges.
-- 1) Remove DB default (code must explicitly set chargeModel for new Payments).
-- 2) Backfill legacy payments that have destination-charge artifacts.

ALTER TABLE "Payment"
  ALTER COLUMN "chargeModel" DROP DEFAULT;

-- Backfill: mark destination_charge if we have reliable evidence (transfer ids or transfer ledger lines).
UPDATE "Payment" AS p
SET "chargeModel" = 'destination_charge'
WHERE p."chargeModel" = 'platform_charge'
  AND (
    p."stripeTransferId" IS NOT NULL
    OR p."stripeFeeReversalId" IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM "LedgerEntry" AS le
      WHERE le."businessPaymentId" = p."id"
        AND le."entryType" IN ('transfer', 'transfer_reversal')
    )
  );

