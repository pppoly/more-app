import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe | null;
  readonly successUrlBase: string;
  readonly cancelUrlBase: string;
  readonly frontendBaseUrl: string;
  readonly enabled: boolean;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY is not set. Stripe features will not work.');
      this.stripe = null;
      this.enabled = false;
    } else {
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2025-02-24.acacia',
      });
      this.enabled = true;
    }
    this.successUrlBase = process.env.STRIPE_SUCCESS_URL_BASE || `${process.env.FRONTEND_BASE_URL || 'http://localhost:5173'}/payments/success`;
    this.cancelUrlBase = process.env.STRIPE_CANCEL_URL_BASE || `${process.env.FRONTEND_BASE_URL || 'http://localhost:5173'}/payments/cancel`;
    this.frontendBaseUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
  }

  get client() {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }
    return this.stripe;
  }
}
