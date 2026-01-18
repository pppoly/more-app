-- Prevent duplicate settlement batches for the same period window.
-- Keep the newest batch if duplicates exist (dev/staging cleanup).

DELETE FROM "SettlementBatch" AS older
USING "SettlementBatch" AS newer
WHERE older."periodFrom" = newer."periodFrom"
  AND older."periodTo" = newer."periodTo"
  AND older."currency" = newer."currency"
  AND older."createdAt" < newer."createdAt";

CREATE UNIQUE INDEX "SettlementBatch_periodFrom_periodTo_currency_key"
  ON "SettlementBatch"("periodFrom", "periodTo", "currency");

