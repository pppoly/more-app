import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe | null;
  readonly successUrlBase: string;
  readonly cancelUrlBase: string;
  readonly frontendBaseUrl: string;
  readonly publishableKey: string | null;
  readonly enabled: boolean;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    this.publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || null;
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
    const sanitizedFrontend = this.sanitizeBaseUrl(process.env.FRONTEND_BASE_URL);
    this.frontendBaseUrl = sanitizedFrontend;
    this.logger.log(`Stripe frontend base URL: ${this.frontendBaseUrl}`);
    this.successUrlBase =
      process.env.STRIPE_SUCCESS_URL_BASE || `${sanitizedFrontend}/payments/success`;
    this.cancelUrlBase = process.env.STRIPE_CANCEL_URL_BASE || `${sanitizedFrontend}/payments/cancel`;
  }

  get client() {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }
    return this.stripe;
  }

  private sanitizeBaseUrl(base?: string | null) {
    const fallback = 'https://localhost:5173';
    const trimmed = (base || '').trim().replace(/\/$/, '');
    if (!trimmed) return fallback;
    try {
      const parsed = new URL(trimmed);
      return parsed.toString().replace(/\/$/, '');
    } catch {
      try {
        const withProtocol = `http://${trimmed}`;
        const parsed = new URL(withProtocol);
        return parsed.toString().replace(/\/$/, '');
      } catch {
        this.logger.warn(`Invalid FRONTEND_BASE_URL provided: ${base}. Falling back to ${fallback}`);
        return fallback;
      }
    }
  }
}
