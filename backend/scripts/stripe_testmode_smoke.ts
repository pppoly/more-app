import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { SettlementService } from '../src/payments/settlement.service';
import { resetPaymentsConfigForTest } from '../src/payments/payments.config';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const BASE_URL = process.env.BASE_URL;

const logDir = '.logs/stripe-e2e';

const ensureLogDir = async () => {
  await mkdir(logDir, { recursive: true });
};

const writeJson = async (filename: string, value: unknown) => {
  await writeFile(join(logDir, filename), JSON.stringify(value, null, 2), 'utf8');
};

const coerceBalanceTxFee = (tx: Stripe.BalanceTransaction | null) => {
  if (!tx) return null;
  if (typeof tx.fee === 'number') return tx.fee;
  const details = Array.isArray((tx as any).fee_details) ? ((tx as any).fee_details as Array<{ amount?: number }>) : [];
  return details.reduce((sum, item) => sum + (item.amount ?? 0), 0);
};

const main = async () => {
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !BASE_URL) {
    console.log(
      '[stripe_testmode_smoke] SKIP: require STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, BASE_URL (backend base URL)',
    );
    return;
  }

  await ensureLogDir();

  const apiVersion = process.env.STRIPE_API_VERSION || '2025-12-15.preview';
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: apiVersion as unknown as Stripe.LatestApiVersion });
  const baseUrl = BASE_URL.replace(/\/$/, '');
  const amount = 1000;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'jpy',
          product_data: { name: 'MORE Stripe testmode smoke (platform charge)' },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/payments/cancel`,
    metadata: {
      e2e: 'stripe_testmode_smoke',
      chargeModel: 'platform_charge',
    },
    payment_intent_data: {
      metadata: {
        e2e: 'stripe_testmode_smoke',
        chargeModel: 'platform_charge',
      },
    },
  });

  await writeJson('checkout_session.created.json', session);
  console.log(`[stripe_testmode_smoke] checkout session created: ${session.id}`);

  const sessionExpanded = await stripe.checkout.sessions.retrieve(session.id, { expand: ['payment_intent'] });
  const piId =
    typeof sessionExpanded.payment_intent === 'string'
      ? sessionExpanded.payment_intent
      : sessionExpanded.payment_intent?.id ?? null;
  if (!piId) {
    console.log('[stripe_testmode_smoke] STOP: payment_intent not found on checkout session');
    console.log(`- Open the checkout URL and complete payment: ${session.url ?? '(no url)'}`);
    return;
  }

  let paymentIntent = await stripe.paymentIntents.retrieve(piId);
  if (paymentIntent.status !== 'succeeded') {
    try {
      paymentIntent = await stripe.paymentIntents.confirm(piId, { payment_method: 'pm_card_visa' });
    } catch (err) {
      await writeJson('payment_intent.confirm_failed.json', {
        paymentIntentId: piId,
        error: err instanceof Error ? err.message : String(err),
        checkoutUrl: session.url,
      });
      console.log('[stripe_testmode_smoke] STOP: PaymentIntent confirm failed');
      console.log(`- Open the checkout URL and complete payment: ${session.url ?? '(no url)'}`);
      console.log(`- Then re-run and inspect the PaymentIntent: ${piId}`);
      return;
    }
  }

  await writeJson('payment_intent.after_confirm.json', paymentIntent);
  assert.equal(paymentIntent.status, 'succeeded');

  const piWithCharge = await stripe.paymentIntents.retrieve(paymentIntent.id, {
    expand: ['latest_charge.balance_transaction'],
  });
  const latestChargeId =
    typeof piWithCharge.latest_charge === 'string'
      ? piWithCharge.latest_charge
      : piWithCharge.latest_charge?.id ?? null;
  assert.ok(latestChargeId);

  const charge =
    typeof piWithCharge.latest_charge === 'string'
      ? await stripe.charges.retrieve(piWithCharge.latest_charge, { expand: ['balance_transaction'] })
      : (piWithCharge.latest_charge as Stripe.Charge | null);
  assert.ok(charge);

  const chargeBalanceTx =
    charge && typeof charge.balance_transaction !== 'string' ? (charge.balance_transaction as Stripe.BalanceTransaction) : null;
  const chargeFee = coerceBalanceTxFee(chargeBalanceTx);
  const chargeNet = chargeBalanceTx?.net ?? null;
  await writeJson('charge.balance_transaction.json', chargeBalanceTx);

  assert.ok(typeof chargeFee === 'number' && chargeFee > 0);
  assert.ok(typeof chargeNet === 'number');

  console.log(`[stripe_testmode_smoke] charge fee=${chargeFee} net=${chargeNet}`);

  const refund = await stripe.refunds.create({ payment_intent: paymentIntent.id });
  await writeJson('refund.created.json', refund);
  assert.equal(refund.status, 'succeeded');
  assert.equal(refund.amount, amount);

  const refundExpanded = await stripe.refunds.retrieve(refund.id, { expand: ['balance_transaction'] });
  const refundBalanceTx =
    refundExpanded.balance_transaction && typeof refundExpanded.balance_transaction !== 'string'
      ? (refundExpanded.balance_transaction as Stripe.BalanceTransaction)
      : null;
  const refundNet = refundBalanceTx?.net ?? null;
  await writeJson('refund.balance_transaction.json', refundBalanceTx);

  assert.ok(typeof refundNet === 'number');
  const combinedNet = (chargeNet as number) + (refundNet as number);

  // Stripe processing fee is not returned on refunds: net(charge) + net(refund) should equal -fee.
  assert.equal(combinedNet, -(chargeFee as number));

  const report: Record<string, unknown> = {
    checkoutSessionId: session.id,
    paymentIntentId: paymentIntent.id,
    chargeId: charge?.id ?? null,
    refundId: refund.id,
    amounts: {
      amount,
      chargeFee,
      chargeNet,
      refundNet,
      combinedNet,
    },
  };
  await writeJson('result.json', report);
  console.log('[stripe_testmode_smoke] PASS: fee exists and is not returned on refund');

  // Settlement dry-run (optional): requires DATABASE_URL but does not call Stripe transfers.
  if (!process.env.DATABASE_URL) {
    console.log('[stripe_testmode_smoke] SKIP: settlement dry-run (DATABASE_URL is not set)');
    return;
  }

  process.env.SETTLEMENT_ENABLED = '0';
  process.env.SETTLEMENT_REPORT_DIR = join(logDir, 'settlement');
  resetPaymentsConfigForTest();

  const prisma = new PrismaClient();
  await prisma.$connect();
  try {
    const settlementService = new SettlementService(prisma as any, { enabled: false, client: {} } as any);
    const now = new Date();
    const periodFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const periodTo = now;
    const batch = await settlementService.runSettlementBatch({ periodFrom, periodTo });
    await writeJson('settlement.dry_run.result.json', batch);
    console.log(`[stripe_testmode_smoke] settlement dry-run: batchId=${batch.batchId} status=${batch.status}`);
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((err) => {
  console.error('[stripe_testmode_smoke] FAIL', err);
  process.exitCode = 1;
});
