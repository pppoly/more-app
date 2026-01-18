/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-floating-promises, @typescript-eslint/unbound-method */
import { Controller, Get } from '@nestjs/common';
import { StripeOnboardingService } from '../stripe/stripe-onboarding.service';

@Controller('debug/stripe')
export class StripeDebugController {
  constructor(private readonly onboarding: StripeOnboardingService) {}

  @Get('onboarding')
  async debugOnboarding() {
    try {
      const { accountId } = await this.onboarding.createOrGetExpressAccount({
        email: 'debug-owner@example.com',
        name: 'Debug Community',
        productDescription: 'Debug onboarding flow',
        supportEmail: 'debug-owner@example.com',
        url: 'http://localhost:5173/console/stripe-return',
      });

      const url = await this.onboarding.createOnboardingLink(accountId);
      console.log('[DEBUG] link.url =', url);
      return { url };
    } catch (err: any) {
      console.error('[DEBUG] stripe error:', err);
      return {
        statusCode: err.statusCode || 500,
        message: err.message,
        stripeError: err.raw,
      };
    }
  }
}
