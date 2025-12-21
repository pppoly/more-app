-- Add unique constraint to enforce one registration per user per event
CREATE UNIQUE INDEX IF NOT EXISTS "EventRegistration_userId_eventId_key"
  ON "EventRegistration"("userId", "eventId");
