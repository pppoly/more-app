import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const run = async () => {
  if (!process.env.DATABASE_URL) {
    console.log('[verify-charge-model-backfill] SKIP: DATABASE_URL is not set');
    return;
  }

  const prisma = new PrismaClient();
  await prisma.$connect();

  const runId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const email = `charge-model-backfill-${runId}@example.com`;
  const slug = `charge-model-backfill-${runId}`;

  const cleanup: Array<() => Promise<unknown>> = [];

  try {
    const user = await prisma.user.create({ data: { email } });
    cleanup.unshift(() => prisma.user.delete({ where: { id: user.id } }));

    const community = await prisma.community.create({
      data: {
        ownerId: user.id,
        name: `ChargeModel Backfill ${runId}`,
        slug,
        description: {},
        labels: [],
        visibleLevel: 'public',
        stripeAccountId: 'acct_test_dummy',
        stripeAccountOnboarded: true,
      },
    });
    cleanup.unshift(() => prisma.community.delete({ where: { id: community.id } }));

    const payments = await Promise.all([
      prisma.payment.create({
        data: {
          id: `pay_cm_old_transfer_${runId}`,
          userId: user.id,
          communityId: community.id,
          amount: 1000,
          platformFee: 0,
          currency: 'jpy',
          status: 'paid',
          method: 'stripe',
          // simulate legacy mislabel (was defaulted to platform_charge) but has destination evidence
          chargeModel: 'platform_charge',
          stripeTransferId: `tr_legacy_${runId}`,
        },
      }),
      prisma.payment.create({
        data: {
          id: `pay_cm_old_ledger_${runId}`,
          userId: user.id,
          communityId: community.id,
          amount: 2000,
          platformFee: 0,
          currency: 'jpy',
          status: 'paid',
          method: 'stripe',
          // simulate legacy mislabel but only has transfer journal evidence
          chargeModel: 'platform_charge',
        },
      }),
      prisma.payment.create({
        data: {
          id: `pay_cm_new_platform_${runId}`,
          userId: user.id,
          communityId: community.id,
          amount: 3000,
          platformFee: 0,
          currency: 'jpy',
          status: 'paid',
          method: 'stripe',
          chargeModel: 'platform_charge',
        },
      }),
      prisma.payment.create({
        data: {
          id: `pay_cm_new_platform_led_${runId}`,
          userId: user.id,
          communityId: community.id,
          amount: 4000,
          platformFee: 0,
          currency: 'jpy',
          status: 'paid',
          method: 'stripe',
          chargeModel: 'platform_charge',
        },
      }),
    ]);
    cleanup.unshift(() =>
      prisma.payment.deleteMany({ where: { id: { in: payments.map((p) => p.id) } } }),
    );

    await prisma.ledgerEntry.create({
      data: {
        businessPaymentId: `pay_cm_old_ledger_${runId}`,
        businessCommunityId: community.id,
        entryType: 'transfer',
        direction: 'out',
        amount: 1800,
        currency: 'jpy',
        provider: 'stripe',
        providerObjectType: 'transfer',
        providerObjectId: `tr_ledger_${runId}`,
        idempotencyKey: `verify:charge_model:transfer:${runId}`,
        occurredAt: new Date(),
      },
    });

    await prisma.ledgerEntry.create({
      data: {
        businessPaymentId: `pay_cm_new_platform_led_${runId}`,
        businessCommunityId: community.id,
        entryType: 'host_payable',
        direction: 'out',
        amount: 3500,
        currency: 'jpy',
        provider: 'internal',
        providerObjectType: 'payment',
        providerObjectId: `pay_cm_new_platform_led_${runId}`,
        idempotencyKey: `verify:charge_model:host_payable:${runId}`,
        occurredAt: new Date(),
      },
    });

    cleanup.unshift(() =>
      prisma.ledgerEntry.deleteMany({
        where: {
          idempotencyKey: {
            in: [`verify:charge_model:transfer:${runId}`, `verify:charge_model:host_payable:${runId}`],
          },
        },
      }),
    );

    // Apply the same backfill predicate as the migration (idempotent).
    await prisma.$executeRaw`
      UPDATE "Payment" AS p
      SET "chargeModel" = 'destination_charge'
      WHERE p."chargeModel" = 'platform_charge'
        AND (
          p."stripeTransferId" IS NOT NULL
          OR p."stripeFeeReversalId" IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM "LedgerEntry" AS le
            WHERE le."businessPaymentId" = p."id"
              AND le."entryType" IN ('transfer', 'transfer_reversal')
          )
        );
    `;

    const refreshed = await prisma.payment.findMany({
      where: { id: { in: payments.map((p) => p.id) } },
      select: { id: true, chargeModel: true },
    });
    const byId = new Map(refreshed.map((p) => [p.id, p.chargeModel]));

    assert.equal(byId.get(`pay_cm_old_transfer_${runId}`), 'destination_charge');
    assert.equal(byId.get(`pay_cm_old_ledger_${runId}`), 'destination_charge');
    assert.equal(byId.get(`pay_cm_new_platform_${runId}`), 'platform_charge');
    assert.equal(byId.get(`pay_cm_new_platform_led_${runId}`), 'platform_charge');

    console.log('[verify-charge-model-backfill] PASS');
  } finally {
    for (const fn of cleanup) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await fn();
      } catch (err) {
        console.warn('[verify-charge-model-backfill] cleanup failed', err);
      }
    }
    await prisma.$disconnect();
  }
};

run().catch((err) => {
  console.error('[verify-charge-model-backfill] FAIL', err);
  process.exitCode = 1;
});

