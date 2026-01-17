import { computeMerchantNet } from './settlement.utils';
import { Prisma } from '@prisma/client';

type PaymentBackfillRow = Prisma.PaymentGetPayload<{
  select: {
    id: true;
    communityId: true;
    registrationId: true;
    lessonId: true;
    amount: true;
    platformFee: true;
    currency: true;
    status: true;
    stripePaymentIntentId: true;
    stripeChargeId: true;
    providerBalanceTxId: true;
    stripeFeeAmountActual: true;
    merchantTransferAmount: true;
    createdAt: true;
  };
}>;

export type BackfillFinanceLedgerResult = {
  scannedPayments: number;
  created: {
    stripeFeeActual: number;
    platformFee: number;
    hostPayable: number;
  };
  skipped: {
    missingCommunityId: number;
    nonJpy: number;
    missingProviderBalanceTxId: number;
    missingStripeFeeAmountActual: number;
    missingMerchantNet: number;
  };
};

export async function backfillPlatformChargeLedgerFees(
  prisma: Prisma.TransactionClient,
  params?: {
    communityId?: string;
    limit?: number;
    dryRun?: boolean;
  },
): Promise<BackfillFinanceLedgerResult> {
  const dryRun = params?.dryRun ?? false;

  const payments: PaymentBackfillRow[] = await prisma.payment.findMany({
    where: {
      method: 'stripe',
      chargeModel: 'platform_charge',
      status: { in: ['paid', 'partial_refunded', 'refunded', 'disputed'] },
      communityId: params?.communityId ? params.communityId : { not: null },
    },
    orderBy: { createdAt: 'asc' },
    take: params?.limit,
    select: {
      id: true,
      communityId: true,
      registrationId: true,
      lessonId: true,
      amount: true,
      platformFee: true,
      currency: true,
      status: true,
      stripePaymentIntentId: true,
      stripeChargeId: true,
      providerBalanceTxId: true,
      stripeFeeAmountActual: true,
      merchantTransferAmount: true,
      createdAt: true,
    },
  });

  const result: BackfillFinanceLedgerResult = {
    scannedPayments: payments.length,
    created: { stripeFeeActual: 0, platformFee: 0, hostPayable: 0 },
    skipped: {
      missingCommunityId: 0,
      nonJpy: 0,
      missingProviderBalanceTxId: 0,
      missingStripeFeeAmountActual: 0,
      missingMerchantNet: 0,
    },
  };

  const ensureLedger = async (entry: {
    businessPaymentId: string;
    businessRegistrationId?: string | null;
    businessLessonId?: string | null;
    businessCommunityId?: string | null;
    entryType: string;
    direction: string;
    amount: number;
    currency: string;
    provider: string;
    providerObjectType?: string | null;
    providerObjectId?: string | null;
    providerBalanceTxId?: string | null;
    providerAccountId?: string | null;
    idempotencyKey: string;
    occurredAt: Date;
    metadata?: Prisma.InputJsonValue;
  }) => {
    const existing = await prisma.ledgerEntry.findUnique({ where: { idempotencyKey: entry.idempotencyKey } });
    if (existing) return false;
    if (dryRun) return true;
    await prisma.ledgerEntry.create({
      data: {
        businessPaymentId: entry.businessPaymentId,
        businessRegistrationId: entry.businessRegistrationId ?? undefined,
        businessLessonId: entry.businessLessonId ?? undefined,
        businessCommunityId: entry.businessCommunityId ?? undefined,
        entryType: entry.entryType,
        direction: entry.direction,
        amount: entry.amount,
        currency: entry.currency,
        provider: entry.provider,
        providerObjectType: entry.providerObjectType ?? undefined,
        providerObjectId: entry.providerObjectId ?? undefined,
        providerBalanceTxId: entry.providerBalanceTxId ?? undefined,
        providerAccountId: entry.providerAccountId ?? undefined,
        idempotencyKey: entry.idempotencyKey,
        occurredAt: entry.occurredAt,
        metadata: entry.metadata ?? undefined,
      },
    });
    return true;
  };

  for (const payment of payments) {
    const communityId = payment.communityId ?? null;
    if (!communityId) {
      result.skipped.missingCommunityId += 1;
      continue;
    }
    const currency = (payment.currency ?? 'jpy').toLowerCase();
    if (currency !== 'jpy') {
      result.skipped.nonJpy += 1;
      continue;
    }

    const occurredAt = payment.createdAt instanceof Date ? payment.createdAt : new Date();
    const gross = payment.amount ?? 0;
    const platformFee = payment.platformFee ?? 0;
    const stripeFeeActual = payment.stripeFeeAmountActual;

    if (platformFee > 0) {
      const created = await ensureLedger({
        businessPaymentId: payment.id,
        businessRegistrationId: payment.registrationId ?? null,
        businessLessonId: payment.lessonId ?? null,
        businessCommunityId: communityId,
        entryType: 'platform_fee',
        direction: 'in',
        amount: platformFee,
        currency,
        provider: 'internal',
        providerObjectType: 'payment',
        providerObjectId: payment.id,
        idempotencyKey: `ledger:platform_fee:${payment.id}`,
        occurredAt,
        metadata: { paymentId: payment.id, source: 'backfill' },
      });
      if (created) result.created.platformFee += 1;
    }

    if (typeof stripeFeeActual === 'number' && stripeFeeActual > 0) {
      const balanceTxId = payment.providerBalanceTxId ?? null;
      if (!balanceTxId) {
        result.skipped.missingProviderBalanceTxId += 1;
      } else {
        const created = await ensureLedger({
          businessPaymentId: payment.id,
          businessRegistrationId: payment.registrationId ?? null,
          businessLessonId: payment.lessonId ?? null,
          businessCommunityId: communityId,
          entryType: 'stripe_fee_actual',
          direction: 'out',
          amount: stripeFeeActual,
          currency,
          provider: 'stripe',
          providerObjectType: 'balance_transaction',
          providerObjectId: balanceTxId,
          providerBalanceTxId: balanceTxId,
          idempotencyKey: `stripe:balance_tx.fee:${balanceTxId}`,
          occurredAt,
          metadata: {
            paymentId: payment.id,
            paymentIntentId: payment.stripePaymentIntentId ?? null,
            chargeId: payment.stripeChargeId ?? null,
            balanceTxId,
            source: 'backfill',
          },
        });
        if (created) result.created.stripeFeeActual += 1;
      }
    } else {
      result.skipped.missingStripeFeeAmountActual += 1;
    }

    const merchantNet =
      payment.merchantTransferAmount ??
      (typeof stripeFeeActual === 'number'
        ? computeMerchantNet(gross, platformFee, stripeFeeActual)
        : null);
    if (typeof merchantNet !== 'number' || !Number.isFinite(merchantNet) || merchantNet <= 0) {
      result.skipped.missingMerchantNet += 1;
      continue;
    }

    const created = await ensureLedger({
      businessPaymentId: payment.id,
      businessRegistrationId: payment.registrationId ?? null,
      businessLessonId: payment.lessonId ?? null,
      businessCommunityId: communityId,
      entryType: 'host_payable',
      direction: 'out',
      amount: merchantNet,
      currency,
      provider: 'internal',
      providerObjectType: 'payment',
      providerObjectId: payment.id,
      idempotencyKey: `ledger:host_payable:${payment.id}`,
      occurredAt,
      metadata: {
        paymentId: payment.id,
        gross,
        platformFee,
        stripeFeeActual: typeof stripeFeeActual === 'number' ? stripeFeeActual : null,
        merchantNet,
        source: 'backfill',
      },
    });
    if (created) result.created.hostPayable += 1;
  }

  return result;
}
