/*
  Warnings:

  - You are about to drop the column `uploaderId` on the `EventGallery` table. All the data in the column will be lost.
  - You are about to drop the column `visibility` on the `EventGallery` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "EventGallery" DROP CONSTRAINT "EventGallery_uploaderId_fkey";

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "category" TEXT,
ADD COLUMN     "config" JSONB,
ADD COLUMN     "coverType" TEXT,
ADD COLUMN     "descriptionHtml" TEXT,
ADD COLUMN     "minParticipants" INTEGER,
ADD COLUMN     "regEndTime" TIMESTAMP(3),
ADD COLUMN     "regStartTime" TIMESTAMP(3),
ADD COLUMN     "registrationFormSchema" JSONB,
ALTER COLUMN "originalLanguage" SET DEFAULT 'ja';

-- AlterTable
ALTER TABLE "EventGallery" DROP COLUMN "uploaderId",
DROP COLUMN "visibility",
ADD COLUMN     "isCover" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;
