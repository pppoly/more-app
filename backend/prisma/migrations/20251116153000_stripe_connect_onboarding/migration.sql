-- Add Stripe onboarding flag to communities
ALTER TABLE "Community"
    ADD COLUMN     "stripeAccountOnboarded" BOOLEAN NOT NULL DEFAULT false;
