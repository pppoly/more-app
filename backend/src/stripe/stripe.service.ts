import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe | null;
  readonly successUrlBase: string;
  readonly cancelUrlBase: string;
  readonly returnUrlBase: string;
  readonly frontendBaseUrl: string;
  readonly publishableKey: string | null;
  readonly enabled: boolean;

  constructor() {
    const envLabel = (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
    const isLive = ['production', 'prod', 'live'].includes(envLabel);
    const isUat = envLabel === 'uat' || envLabel === 'staging';
    // Single .env with both keys; APP_ENV toggles which set to use
    const secretKey = isLive ? process.env.STRIPE_SECRET_KEY_LIVE : process.env.STRIPE_SECRET_KEY_TEST;
    this.publishableKey = isLive
      ? process.env.STRIPE_PUBLISHABLE_KEY_LIVE || null
      : process.env.STRIPE_PUBLISHABLE_KEY_TEST || null;
    const webhookSecret = isLive
      ? process.env.STRIPE_WEBHOOK_SECRET_LIVE || null
      : process.env.STRIPE_WEBHOOK_SECRET_TEST || null;
    const frontendBaseUrlRaw = isLive ? process.env.FRONTEND_BASE_URL_LIVE : process.env.FRONTEND_BASE_URL_UAT;

    if (isLive || isUat) {
      const missing: string[] = [];
      if (!secretKey) missing.push('STRIPE_SECRET_KEY');
      if (!this.publishableKey) missing.push('STRIPE_PUBLISHABLE_KEY');
      if (!webhookSecret) missing.push('STRIPE_WEBHOOK_SECRET');
      if (!frontendBaseUrlRaw) missing.push('FRONTEND_BASE_URL');
      if (missing.length) {
        throw new Error(`Missing required Stripe environment variables (${envLabel}): ${missing.join(', ')}`);
      }
    }

    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY is not set. Stripe features will not work.');
      this.stripe = null;
      this.enabled = false;
    } else {
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2025-02-24.acacia',
      });
      this.enabled = true;
      if (isLive && secretKey.startsWith('sk_test_')) {
        this.logger.warn(`Live environment ${envLabel} is using Stripe test key`);
      }
    }
    const sanitizedFrontend = this.sanitizeBaseUrl(frontendBaseUrlRaw);
    if ((isLive || isUat) && !frontendBaseUrlRaw) {
      throw new Error('FRONTEND_BASE_URL is required for Stripe redirect URLs');
    }
    this.frontendBaseUrl = sanitizedFrontend;
    this.logger.log(`Stripe frontend base URL: ${this.frontendBaseUrl}`);
    this.successUrlBase =
      process.env.STRIPE_SUCCESS_URL_BASE || `${sanitizedFrontend}/payments/success`;
    this.cancelUrlBase = process.env.STRIPE_CANCEL_URL_BASE || `${sanitizedFrontend}/payments/cancel`;
    this.returnUrlBase = process.env.STRIPE_RETURN_URL_BASE || `${sanitizedFrontend}/payments/return`;
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
