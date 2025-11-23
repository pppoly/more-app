-- AlterTable
ALTER TABLE "AiEventDraftLog" ADD COLUMN     "language" TEXT,
ADD COLUMN     "meta" JSONB,
ADD COLUMN     "promptVersion" TEXT DEFAULT 'coach-v1',
ADD COLUMN     "status" TEXT DEFAULT 'collecting',
ADD COLUMN     "turnCount" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferredLocale" TEXT DEFAULT 'ja';

-- CreateTable
CREATE TABLE "PromptAuditLog" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "version" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT,
    "system" TEXT NOT NULL,
    "instructions" TEXT,
    "params" JSONB,
    "tags" JSONB,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "PromptDefinition_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PromptAuditLog" ADD CONSTRAINT "PromptAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptDefinition" ADD CONSTRAINT "PromptDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptDefinition" ADD CONSTRAINT "PromptDefinition_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptDefinition" ADD CONSTRAINT "PromptDefinition_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
