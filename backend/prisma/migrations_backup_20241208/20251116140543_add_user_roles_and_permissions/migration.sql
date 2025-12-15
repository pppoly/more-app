-- AlterTable
ALTER TABLE "CommunityMember" ALTER COLUMN "role" SET DEFAULT 'member',
ALTER COLUMN "status" SET DEFAULT 'active';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;
