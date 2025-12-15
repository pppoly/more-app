-- AlterTable
ALTER TABLE "CommunityMember" ADD COLUMN     "totalNoShow" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalRegistered" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "EventRegistration" ADD COLUMN     "attended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "noShow" BOOLEAN NOT NULL DEFAULT false;
