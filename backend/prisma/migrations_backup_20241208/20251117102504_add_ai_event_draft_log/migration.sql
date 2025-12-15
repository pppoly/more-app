-- CreateTable
CREATE TABLE "AiEventDraftLog" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "summary" TEXT,
    "qaState" JSONB,
    "messages" JSONB NOT NULL,
    "aiResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEventDraftLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AiEventDraftLog" ADD CONSTRAINT "AiEventDraftLog_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEventDraftLog" ADD CONSTRAINT "AiEventDraftLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
