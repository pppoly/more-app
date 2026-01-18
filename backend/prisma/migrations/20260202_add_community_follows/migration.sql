-- CreateTable
CREATE TABLE "CommunityFollow" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityFollow_communityId_userId_key" ON "CommunityFollow"("communityId", "userId");

-- CreateIndex
CREATE INDEX "CommunityFollow_communityId_idx" ON "CommunityFollow"("communityId");

-- CreateIndex
CREATE INDEX "CommunityFollow_userId_idx" ON "CommunityFollow"("userId");

-- AddForeignKey
ALTER TABLE "CommunityFollow" ADD CONSTRAINT "CommunityFollow_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityFollow" ADD CONSTRAINT "CommunityFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill from legacy follower memberships
INSERT INTO "CommunityFollow" ("id", "communityId", "userId", "createdAt")
SELECT
  'cf_' || md5("communityId" || ':' || "userId"),
  "communityId",
  "userId",
  COALESCE("joinedAt", CURRENT_TIMESTAMP)
FROM "CommunityMember"
WHERE "role" = 'follower'
  AND "status" = 'active'
ON CONFLICT ("communityId", "userId") DO NOTHING;
