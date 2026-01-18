import Stripe from 'stripe';
import { Prisma, PrismaClient } from '@prisma/client';
import { computeMerchantNet } from './settlement.utils';

type StripeFeeBackfillPaymentRow = Prisma.PaymentGetPayload<{
  select: {
    id: true;
    communityId: true;
    registrationId: true;
    lessonId: true;
    amount: true;
    platformFee: true;
    currency: true;
    status: true;
    chargeModel: true;
    stripeCheckoutSessionId: true;
    stripePaymentIntentId: true;
    stripeChargeId: true;
    providerBalanceTxId: true;
    stripeFeeAmountActual: true;
    merchantTransferAmount: true;
    createdAt: true;
  };
}>;

export type BackfillFinanceLedgerFromStripeResult = {
  scannedPayments: number;
  stripeRequests: number;
  updatedPayments: number;
  created: {
    stripeFeeActual: number;
    platformFee: number;
    hostPayable: number;
  };
  skipped: {
    missingCommunityId: number;
    nonJpy: number;
    missingStripeKey: number;
    missingBalanceTxId: number;
    stripeFeeZero: number;
    stripeError: number;
  };
};

const computeStripeFeeFromBalanceTx = (balanceTx: Stripe.BalanceTransaction) => {
  const feeDetails = balanceTx.fee_details ?? [];
  if (feeDetails.length) {
    return feeDetails.reduce((sum, detail) => sum + (detail.amount ?? 0), 0);
  }
  return balanceTx.fee ?? 0;
};

const extractStripeId = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return null;
};

const wait = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withStripeRetry = async <T>(
  fn: () => Promise<T>,
  params?: { maxAttempts?: number; baseDelayMs?: number },
): Promise<T> => {
  const maxAttempts = Math.max(1, params?.maxAttempts ?? 3);
  const baseDelayMs = Math.max(100, params?.baseDelayMs ?? 500);
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const shouldRetry =
        message.includes('rate limit') ||
        message.includes('429') ||
        message.includes('timeout') ||
        message.includes('ETIMEDOUT') ||
        message.includes('ECONNRESET') ||
        message.includes('APIConnectionError');
      if (!shouldRetry || attempt === maxAttempts) break;
      await wait(baseDelayMs * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

const resolveBalanceTxIdForPayment = async (
  stripe: Stripe,
  payment: StripeFeeBackfillPaymentRow,
  request: <T>(fn: () => Promise<T>) => Promise<T>,
): Promise<string | null> => {
  if (payment.providerBalanceTxId) return payment.providerBalanceTxId;

  const stripeChargeId = payment.stripeChargeId ?? null;
  if (stripeChargeId) {
    const charge = await request(() => stripe.charges.retrieve(stripeChargeId));
    const balanceTxId = extractStripeId((charge as Stripe.Charge).balance_transaction);
    if (balanceTxId) return balanceTxId;
  }

  let paymentIntentId = payment.stripePaymentIntentId ?? null;
  const checkoutSessionId = payment.stripeCheckoutSessionId ?? null;
  if (!paymentIntentId && checkoutSessionId) {
    const session = await request(() =>
      stripe.checkout.sessions.retrieve(checkoutSessionId),
    );
    paymentIntentId = extractStripeId((session as Stripe.Checkout.Session).payment_intent);
  }

  if (paymentIntentId) {
    const intent = await request(() =>
      stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge.balance_transaction'],
      }),
    );
    const latestCharge = (intent as Stripe.PaymentIntent).latest_charge;
    const chargeId = extractStripeId(latestCharge);
    if (chargeId) {
      const charge =
        typeof latestCharge === 'string'
          ? await request(() => stripe.charges.retrieve(chargeId))
          : (latestCharge as Stripe.Charge);
      const balanceTxId = extractStripeId(charge.balance_transaction);
      if (balanceTxId) return balanceTxId;
    }
  }

  return null;
};

const ensureLedger = async (
  tx: Prisma.TransactionClient,
  params: {
    idempotencyKey: string;
    data: Prisma.LedgerEntryCreateInput;
    dryRun: boolean;
  },
) => {
  const existing = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
  if (existing) return false;
  if (params.dryRun) return true;
  await tx.ledgerEntry.create({ data: params.data });
  return true;
};

export async function backfillPlatformChargeLedgerFeesFromStripe(
  prisma: PrismaClientOrTx,
  stripe: Stripe | null,
  params?: {
    communityId?: string;
    limit?: number;
    dryRun?: boolean;
  },
): Promise<BackfillFinanceLedgerFromStripeResult> {
  const dryRun = params?.dryRun ?? false;
  const result: BackfillFinanceLedgerFromStripeResult = {
    scannedPayments: 0,
    stripeRequests: 0,
    updatedPayments: 0,
    created: { stripeFeeActual: 0, platformFee: 0, hostPayable: 0 },
    skipped: {
      missingCommunityId: 0,
      nonJpy: 0,
      missingStripeKey: 0,
      missingBalanceTxId: 0,
      stripeFeeZero: 0,
      stripeError: 0,
    },
  };

  if (!stripe) {
    result.skipped.missingStripeKey = 1;
    return result;
  }

  const payments: StripeFeeBackfillPaymentRow[] = await prisma.payment.findMany({
    where: {
      method: 'stripe',
      chargeModel: 'platform_charge',
      status: { in: ['paid', 'partial_refunded', 'refunded', 'disputed'] },
      OR: [{ stripeFeeAmountActual: null }, { stripeFeeAmountActual: { lte: 0 } }],
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
      chargeModel: true,
      stripeCheckoutSessionId: true,
      stripePaymentIntentId: true,
      stripeChargeId: true,
      providerBalanceTxId: true,
      stripeFeeAmountActual: true,
      merchantTransferAmount: true,
      createdAt: true,
    },
  });

  result.scannedPayments = payments.length;

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

    const needsFeeBackfill = !(typeof payment.stripeFeeAmountActual === 'number' && payment.stripeFeeAmountActual > 0);
    if (!needsFeeBackfill) continue;

    const request = async <T>(fn: () => Promise<T>) => {
      result.stripeRequests += 1;
      return withStripeRetry(fn);
    };

    let balanceTxId: string | null = null;
    try {
      balanceTxId = await resolveBalanceTxIdForPayment(stripe, payment, request);
    } catch {
      result.skipped.stripeError += 1;
      continue;
    }

    if (!balanceTxId) {
      result.skipped.missingBalanceTxId += 1;
      continue;
    }

    const stripeFeeKey = `stripe:balance_tx.fee:${balanceTxId}`;
    const existingFee = await prisma.ledgerEntry.findUnique({ where: { idempotencyKey: stripeFeeKey } });
    if (existingFee) {
      if (!dryRun) {
        const gross = payment.amount ?? 0;
        const platformFee = payment.platformFee ?? 0;
        const stripeFeeAmount = Number(existingFee.amount ?? 0);
        const merchantNet = computeMerchantNet(gross, platformFee, stripeFeeAmount);
        const updated = await prisma.payment.updateMany({
          where: {
            id: payment.id,
            OR: [{ stripeFeeAmountActual: null }, { stripeFeeAmountActual: { lte: 0 } }],
          },
          data: {
            stripeFeeAmountActual: stripeFeeAmount,
            providerBalanceTxId: balanceTxId,
            merchantTransferAmount: merchantNet,
          },
        });
        if (updated.count === 1) result.updatedPayments += 1;
      }
      continue;
    }

    let balanceTx: Stripe.BalanceTransaction;
    try {
      balanceTx = await request(() => stripe.balanceTransactions.retrieve(balanceTxId));
    } catch {
      result.skipped.stripeError += 1;
      continue;
    }

    const stripeFee = Math.max(0, computeStripeFeeFromBalanceTx(balanceTx));
    if (stripeFee <= 0) {
      result.skipped.stripeFeeZero += 1;
      continue;
    }

    const occurredAt =
      typeof balanceTx.created === 'number' ? new Date(balanceTx.created * 1000) : (payment.createdAt ?? new Date());

    const gross = payment.amount ?? 0;
    const platformFee = payment.platformFee ?? 0;
    const merchantNet = computeMerchantNet(gross, platformFee, stripeFee);

    await prisma.$transaction(async (tx) => {
      if (!dryRun && needsFeeBackfill) {
        const updated = await tx.payment.updateMany({
          where: {
            id: payment.id,
            OR: [{ stripeFeeAmountActual: null }, { stripeFeeAmountActual: { lte: 0 } }],
          },
          data: {
            stripeFeeAmountActual: stripeFee,
            providerBalanceTxId: balanceTxId,
            merchantTransferAmount: merchantNet,
          },
        });
        if (updated.count === 1) {
          result.updatedPayments += 1;
        }
      }

      const feeCreated = await ensureLedger(tx, {
        dryRun,
        idempotencyKey: stripeFeeKey,
        data: {
          businessPaymentId: payment.id,
          businessRegistrationId: payment.registrationId ?? undefined,
          businessLessonId: payment.lessonId ?? undefined,
          businessCommunityId: communityId,
          entryType: 'stripe_fee_actual',
          direction: 'out',
          amount: stripeFee,
          currency,
          provider: 'stripe',
          providerObjectType: 'balance_transaction',
          providerObjectId: balanceTxId,
          providerBalanceTxId: balanceTxId,
          idempotencyKey: stripeFeeKey,
          occurredAt,
          metadata: {
            paymentId: payment.id,
            paymentIntentId: payment.stripePaymentIntentId ?? null,
            chargeId: payment.stripeChargeId ?? null,
            balanceTxId,
            source: 'backfill_stripe',
          },
        },
      });
      if (feeCreated) result.created.stripeFeeActual += 1;

      if (platformFee > 0) {
        const pfKey = `ledger:platform_fee:${payment.id}`;
        const pfCreated = await ensureLedger(tx, {
          dryRun,
          idempotencyKey: pfKey,
          data: {
            businessPaymentId: payment.id,
            businessRegistrationId: payment.registrationId ?? undefined,
            businessLessonId: payment.lessonId ?? undefined,
            businessCommunityId: communityId,
            entryType: 'platform_fee',
            direction: 'in',
            amount: platformFee,
            currency,
            provider: 'internal',
            providerObjectType: 'payment',
            providerObjectId: payment.id,
            idempotencyKey: pfKey,
            occurredAt,
            metadata: { paymentId: payment.id, source: 'backfill_stripe' },
          },
        });
        if (pfCreated) result.created.platformFee += 1;
      }

      if (merchantNet > 0) {
        const hpKey = `ledger:host_payable:${payment.id}`;
        const hpCreated = await ensureLedger(tx, {
          dryRun,
          idempotencyKey: hpKey,
          data: {
            businessPaymentId: payment.id,
            businessRegistrationId: payment.registrationId ?? undefined,
            businessLessonId: payment.lessonId ?? undefined,
            businessCommunityId: communityId,
            entryType: 'host_payable',
            direction: 'out',
            amount: merchantNet,
            currency,
            provider: 'internal',
            providerObjectType: 'payment',
            providerObjectId: payment.id,
            idempotencyKey: hpKey,
            occurredAt,
            metadata: {
              paymentId: payment.id,
              gross,
              platformFee,
              stripeFeeActual: stripeFee,
              merchantNet,
              source: 'backfill_stripe',
            },
          },
        });
        if (hpCreated) result.created.hostPayable += 1;
      }
    });
  }

  return result;
}

type PrismaClientOrTx = Pick<
  PrismaClient,
  '$transaction' | 'payment' | 'ledgerEntry'
>;
