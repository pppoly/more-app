import { PrismaClient } from '@prisma/client';
import { backfillPlatformChargeLedgerFees } from '../src/payments/finance-ledger-backfill';

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
  const communityId = (process.env.COMMUNITY_ID || '').trim() || undefined;
  const limitRaw = (process.env.LIMIT || '').trim();
  const limit = limitRaw ? Number(limitRaw) : undefined;

  try {
    const result = await backfillPlatformChargeLedgerFees(prisma as any, {
      dryRun,
      communityId,
      limit,
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ dryRun, communityId: communityId ?? null, limit: limit ?? null, ...result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});

