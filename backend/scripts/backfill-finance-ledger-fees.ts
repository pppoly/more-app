import { PrismaClient } from '@prisma/client';
import { backfillPlatformChargeLedgerFees } from '../src/payments/finance-ledger-backfill';
import { backfillPlatformChargeLedgerFeesFromStripe } from '../src/payments/finance-ledger-backfill-stripe';
import Stripe from 'stripe';

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
  const envLabel = (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  const isLive = ['production', 'prod', 'live'].includes(envLabel);
  const secretKey =
    (isLive ? process.env.STRIPE_SECRET_KEY_LIVE : process.env.STRIPE_SECRET_KEY_TEST) ||
    process.env.STRIPE_SECRET_KEY ||
    null;
  if (!secretKey) return null;
  return new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' });
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
