-- CreateTable
CREATE TABLE "EventFollow" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventFollow_eventId_userId_key" ON "EventFollow"("eventId", "userId");

-- CreateIndex
CREATE INDEX "EventFollow_eventId_idx" ON "EventFollow"("eventId");

-- CreateIndex
CREATE INDEX "EventFollow_userId_idx" ON "EventFollow"("userId");

-- AddForeignKey
ALTER TABLE "EventFollow" ADD CONSTRAINT "EventFollow_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFollow" ADD CONSTRAINT "EventFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
