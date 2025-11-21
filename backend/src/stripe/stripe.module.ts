import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { StripeOnboardingService } from './stripe-onboarding.service';

@Module({
  providers: [StripeService, StripeOnboardingService],
  exports: [StripeService, StripeOnboardingService],
})
export class StripeModule {}
