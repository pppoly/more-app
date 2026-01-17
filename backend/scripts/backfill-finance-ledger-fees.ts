import { PrismaClient } from '@prisma/client';
import { backfillPlatformChargeLedgerFees } from '../src/payments/finance-ledger-backfill';
import { backfillPlatformChargeLedgerFeesFromStripe } from '../src/payments/finance-ledger-backfill-stripe';
import Stripe from 'stripe';
import { execSync } from 'node:child_process';

const parseBoolean = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
  return defaultValue;
};

async function main() {
  const prisma = new PrismaClient();
  const dryRun = parseBoolean(process.env.DRY_RUN, true);
  const useStripe = parseBoolean(process.env.USE_STRIPE, false);
  const communityId = (process.env.COMMUNITY_ID || '').trim() || undefined;
  const limitRaw = (process.env.LIMIT || '').trim();
  const limit = limitRaw ? Number(limitRaw) : undefined;

  try {
    const stripeResult = useStripe
      ? await backfillPlatformChargeLedgerFeesFromStripe(prisma, createStripeClientFromEnv(), {
          dryRun,
          communityId,
          limit,
        })
      : null;
    const result = await backfillPlatformChargeLedgerFees(prisma as any, {
      dryRun,
      communityId,
      limit,
    });
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          dryRun,
          useStripe,
          communityId: communityId ?? null,
          limit: limit ?? null,
          stripe: stripeResult,
          db: result,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

const createStripeClientFromEnv = (): Stripe | null => {
  const secretKey = getStripeSecretKey();
  if (!secretKey) return null;
  return new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' });
};

const getStripeSecretKey = (): string | null => {
  const envLabel = (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  const isLive = ['production', 'prod', 'live'].includes(envLabel);
  const fromEnv =
    (isLive ? process.env.STRIPE_SECRET_KEY_LIVE : process.env.STRIPE_SECRET_KEY_TEST) ||
    process.env.STRIPE_SECRET_KEY ||
    null;
  if (fromEnv) return fromEnv;

  try {
    const raw = execSync('pm2 jlist', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (!raw) return null;
    const list = JSON.parse(raw) as Array<{ name?: string; pm2_env?: { env?: Record<string, string> } }>;
    const app = list.find((item) => (item.name || '').includes('moreapp-backend')) || list[0];
    const env = app?.pm2_env?.env ?? {};
    const fromPm2 =
      (isLive ? env.STRIPE_SECRET_KEY_LIVE : env.STRIPE_SECRET_KEY_TEST) ||
      env.STRIPE_SECRET_KEY ||
      null;
    return fromPm2 || null;
  } catch {
    return null;
  }
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
