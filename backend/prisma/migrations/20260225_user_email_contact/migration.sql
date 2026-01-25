-- Create email contact records for participant/organizer notification emails.
CREATE TABLE "UserEmailContact" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "email" TEXT,
  "status" TEXT NOT NULL DEFAULT 'none',
  "verifiedAt" TIMESTAMP(3),
  "pendingEmail" TEXT,
  "pendingTokenHash" TEXT,
  "pendingExpiresAt" TIMESTAMP(3),
  "lastVerificationSentAt" TIMESTAMP(3),
  "lastPromptDismissedAt" TIMESTAMP(3),
  "bounceReason" TEXT,
  "bouncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "UserEmailContact_userId_role_key" ON "UserEmailContact"("userId", "role");
CREATE INDEX "UserEmailContact_userId_idx" ON "UserEmailContact"("userId");
CREATE INDEX "UserEmailContact_email_idx" ON "UserEmailContact"("email");

ALTER TABLE "UserEmailContact"
ADD CONSTRAINT "UserEmailContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
