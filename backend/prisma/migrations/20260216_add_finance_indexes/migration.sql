-- Finance performance indexes (community balance / payments list)

-- Payment aggregates / list lookups (communityId + createdAt ordering, plus status filters)
CREATE INDEX IF NOT EXISTS "Payment_communityId_createdAt_idx"
ON "Payment"("communityId", "createdAt");

CREATE INDEX IF NOT EXISTS "Payment_communityId_status_createdAt_idx"
ON "Payment"("communityId", "status", "createdAt");

-- Ledger aggregation for community-level fee/balance queries
CREATE INDEX IF NOT EXISTS "LedgerEntry_businessCommunityId_entryType_occurredAt_idx"
ON "LedgerEntry"("businessCommunityId", "entryType", "occurredAt");

