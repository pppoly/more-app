import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { isIP } from 'net';

type OnboardingAccountParams = {
  // Inputs used to create or reuse an account
  existingAccountId?: string | null;
  email?: string | null;
  name?: string | null;
  productDescription?: string | null;
  supportEmail?: string | null;
  url?: string | null;
  metadata?: Record<string, string>;
  country?: string;
};

@Injectable()
export class StripeOnboardingService {
  private readonly logger = new Logger(StripeOnboardingService.name);
  private readonly stripe: Stripe | null;
  private readonly refreshUrl: string | null;
  private readonly returnUrl: string | null;
  private readonly enabled: boolean;

  constructor() {
    const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
    if (!secretKey) {
      this.logger.warn('[StripeOnboardingService] STRIPE_SECRET_KEY missing; onboarding disabled');
      this.stripe = null;
      this.enabled = false;
      this.refreshUrl = null;
      this.returnUrl = null;
      return;
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-02-24.acacia',
    });
    this.enabled = true;

    const refreshEnvRaw = process.env.STRIPE_ONBOARDING_REFRESH_URL;
    const returnEnvRaw = process.env.STRIPE_ONBOARDING_RETURN_URL;
    if (!refreshEnvRaw?.trim() || !returnEnvRaw?.trim()) {
      this.logger.warn(
        '[StripeOnboardingService] Onboarding URLs missing; onboarding disabled. Provide STRIPE_ONBOARDING_REFRESH_URL and STRIPE_ONBOARDING_RETURN_URL.',
      );
      this.refreshUrl = null;
      this.returnUrl = null;
      this.enabled = false;
      return;
    }
    const refreshNormalized = this.ensureUrl(refreshEnvRaw.trim(), 'STRIPE_ONBOARDING_REFRESH_URL');
    const returnNormalized = this.ensureUrl(returnEnvRaw.trim(), 'STRIPE_ONBOARDING_RETURN_URL');
    this.refreshUrl = this.applyNonLocalhostFallback(refreshNormalized);
    this.returnUrl = this.applyNonLocalhostFallback(returnNormalized);
    this.logger.log('[StripeOnboardingService] Using URLs', {
      refreshUrl: this.refreshUrl,
      returnUrl: this.returnUrl,
    });
  }

  getRefreshUrl() {
    return this.refreshUrl;
  }

  getReturnUrl() {
    return this.returnUrl;
  }

  private assertEnabled() {
    if (!this.enabled || !this.stripe || !this.refreshUrl || !this.returnUrl) {
      throw new BadRequestException('Stripe onboarding is not configured');
    }
  }

  private ensureUrl(value: string, label: string) {
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' && !this.isLocalOrPrivateHost(url.hostname)) {
        throw new Error('Only localhost or private LAN IP may use http; use https for public hostnames');
      }
      return url.toString();
    } catch (err) {
      this.logger.error(`${label} is invalid: ${value}`, err instanceof Error ? err.stack : String(err));
      throw err;
    }
  }

  private isLocalOrPrivateHost(hostname: string) {
    const lower = hostname.toLowerCase();
    if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1') return true;
    const ipType = isIP(lower);
    if (ipType === 4) {
      const parts = lower.split('.').map((p) => Number(p));
      if (
        parts.length === 4 &&
        (parts[0] === 10 ||
          (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
          (parts[0] === 192 && parts[1] === 168))
      ) {
        return true;
      }
    }
    return false;
  }

  private applyNonLocalhostFallback(urlValue: string) {
    try {
      const parsed = new URL(urlValue);
      if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        return parsed.toString();
      }
      const originsRaw = process.env.FRONTEND_ORIGINS || '';
      const origins = originsRaw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      for (const origin of origins) {
        try {
          const candidate = new URL(origin);
          if (candidate.hostname === 'localhost' || candidate.hostname === '127.0.0.1') continue;
          parsed.protocol = candidate.protocol;
          parsed.hostname = candidate.hostname;
          parsed.port = candidate.port;
          return parsed.toString();
        } catch {
          continue;
        }
      }
      return parsed.toString();
    } catch {
      return urlValue;
    }
  }

  async createOrGetExpressAccount(params: OnboardingAccountParams) {
    this.assertEnabled();
    const stripe = this.stripe!;
    const country = params.country || 'JP';
    try {
      this.logger.log('[Onboarding] createOrGetExpressAccount called', {
        existingAccountId: params.existingAccountId ?? null,
        country,
        email: params.email ?? null,
        name: params.name ?? null,
        supportEmail: params.supportEmail ?? null,
        url: params.url ?? null,
        metadata: params.metadata ?? null,
      });

      if (params.existingAccountId) {
        this.logger.log('[Onboarding] retrieving existing account', {
          existingAccountId: params.existingAccountId,
          country,
        });
        const account = await stripe.accounts.retrieve(params.existingAccountId);
        this.logger.log('[Onboarding] retrieved existing account', {
          accountId: account.id,
          detailsSubmitted: account.details_submitted ?? null,
        });
        return { accountId: account.id, onboarded: account.details_submitted ?? false, created: false };
      }

      const payload: Stripe.AccountCreateParams = {
        type: 'express',
        country,
        email: params.email ?? undefined,
        business_profile: {
          name: params.name ?? undefined,
          product_description: params.productDescription ?? undefined,
          support_email: params.supportEmail ?? undefined,
          // url is intentionally omitted to avoid Stripe "Not a valid URL" error
          // url: params.url ?? undefined,
        },
        metadata: params.metadata,
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
      };
      this.logger.log('[Onboarding] creating new express account', {
        country,
        email: params.email ?? null,
        name: params.name ?? null,
        supportEmail: params.supportEmail ?? null,
        url: params.url ?? null,
        metadata: params.metadata ?? null,
      });
      const account = await stripe.accounts.create(payload);
      this.logger.log(`[Onboarding] created account ${account.id}`, {
        detailsSubmitted: account.details_submitted ?? null,
        businessProfileUrl: payload.business_profile?.url ?? null,
      });
      return { accountId: account.id, onboarded: account.details_submitted ?? false, created: true };
    } catch (err: any) {
      this.logger.error(
        '[Onboarding] createOrGetExpressAccount failed',
        JSON.stringify(
          {
            statusCode: err?.statusCode,
            type: err?.type,
            code: err?.code,
            message: err?.message,
            raw: err?.raw,
            param: err?.param,
            params: {
              existingAccountId: params.existingAccountId ?? null,
              country,
              email: params.email ?? null,
              name: params.name ?? null,
              supportEmail: params.supportEmail ?? null,
              url: params.url ?? null,
              metadata: params.metadata ?? null,
            },
            businessProfileUrl: params.url ?? null,
          },
          null,
          2,
        ),
      );
      throw new BadRequestException({
        message: 'Stripe account onboarding failed',
        step: 'createOrGetExpressAccount',
        url: params.url ?? null,
        existingAccountId: params.existingAccountId ?? null,
        stripeError: {
          statusCode: err?.statusCode,
          type: err?.type,
          code: err?.code,
          message: err?.message,
          param: err?.param,
        },
      });
    }
  }

  async createOnboardingLink(accountId: string) {
    this.assertEnabled();
    const stripe = this.stripe!;
    const refreshUrl = this.refreshUrl!;
    const returnUrl = this.returnUrl!;
    this.logger.log('[StripeDBG] creating account link', {
      accountId,
      refreshUrl,
      returnUrl,
    });
    try {
      const link = await stripe.accountLinks.create({
        account: accountId,
        type: 'account_onboarding',
        refresh_url: refreshUrl,
        return_url: returnUrl,
      });
      this.logger.log(`[Onboarding] link created, expires_at=${link.expires_at}`);
      return link.url;
    } catch (err: any) {
      this.logger.error('[StripeDBG] accountLinks.create failed', {
        statusCode: err?.statusCode,
        message: err?.message,
        raw: err?.raw,
      });
      throw new BadRequestException({
        message: 'Stripe onboarding link creation failed',
        step: 'createOnboardingLink',
        accountId,
        refresh_url: this.refreshUrl,
        return_url: this.returnUrl,
        stripeError: {
          statusCode: err?.statusCode,
          type: err?.type,
          code: err?.code,
          message: err?.message,
          param: err?.param,
        },
      });
    }
  }

  async createDebugOnboardingLink() {
    const { accountId } = await this.createOrGetExpressAccount({
      email: 'debug-owner@example.com',
      name: 'Debug',
      productDescription: 'Debug onboarding',
      supportEmail: 'debug-owner@example.com',
      // url is intentionally omitted to align with production flow
      // url: this.returnUrl,
      metadata: { context: 'debug' },
    });
    return this.createOnboardingLink(accountId);
  }
}
