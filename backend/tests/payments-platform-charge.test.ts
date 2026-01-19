import test from 'node:test';
import assert from 'node:assert/strict';
import { PaymentsService } from '../src/payments/payments.service';
import { backfillPlatformChargeLedgerFees } from '../src/payments/finance-ledger-backfill';
import { backfillPlatformChargeLedgerFeesFromStripe } from '../src/payments/finance-ledger-backfill-stripe';
import {
  InMemoryPrisma,
  StripeClientStub,
  buildStripeServiceStub,
  PermissionsServiceStub,
  NotificationServiceStub,
  SettlementServiceStub,
} from './payments-test-helpers';

process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test';

const waitTick = async () => new Promise((resolve) => setImmediate(resolve));

const buildPaidIntent = (params: { id: string; chargeId: string; fee: number }) => {
  return {
    id: params.id,
    latest_charge: {
      id: params.chargeId,
      balance_transaction: {
        id: `bt_${params.chargeId}`,
        fee_details: [{ amount: params.fee }],
      },
    },
  } as any;
};

test('P1/P4: platform charge paid + webhook replay is idempotent', async () => {
  const prisma = new InMemoryPrisma();
  const stripeClient = new StripeClientStub();
  stripeClient.paymentIntents['pi_1'] = buildPaidIntent({ id: 'pi_1', chargeId: 'ch_1', fee: 350 });
  const stripeService = buildStripeServiceStub(stripeClient) as any;
  const paymentsService = new PaymentsService(
    prisma as any,
    stripeService,
    new PermissionsServiceStub() as any,
    new NotificationServiceStub() as any,
    new SettlementServiceStub() as any,
  );

  prisma.registrations.push({
    id: 'reg_1',
    userId: 'user_1',
    status: 'pending',
    paymentStatus: 'unpaid',
    amount: 10000,
    paidAmount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  prisma.payments.push({
    id: 'pay_1',
    userId: 'user_1',
    communityId: 'com_1',
    eventId: 'event_1',
    registrationId: 'reg_1',
    amount: 10000,
    platformFee: 500,
    currency: 'jpy',
    status: 'pending',
    method: 'stripe',
    chargeModel: 'platform_charge',
    stripeCheckoutSessionId: 'cs_1',
    refundedGrossTotal: 0,
    refundedPlatformFeeTotal: 0,
    reversedMerchantTotal: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const event = {
    id: 'evt_checkout_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_1',
        metadata: { paymentId: 'pay_1', registrationId: 'reg_1', communityId: 'com_1' },
        payment_intent: 'pi_1',
        mode: 'payment',
        status: 'complete',
        payment_status: 'paid',
      },
    },
  } as any;

  const rawBody = Buffer.from(JSON.stringify(event));
  await paymentsService.handleStripeWebhook(rawBody, 'sig');
  await waitTick();

  const payment = prisma.payments.find((p) => p.id === 'pay_1')!;
  assert.equal(payment.status, 'paid');
  assert.equal(payment.stripePaymentIntentId, 'pi_1');
  assert.equal(payment.stripeChargeId, 'ch_1');

  const reg = prisma.registrations.find((r) => r.id === 'reg_1')!;
  assert.equal(reg.paymentStatus, 'paid');
  assert.equal(reg.status, 'paid');

  const ledgerCountAfter = prisma.ledgerEntries.length;
  assert.ok(ledgerCountAfter >= 1);

  await paymentsService.handleStripeWebhook(rawBody, 'sig');
  await paymentsService.handleStripeWebhook(rawBody, 'sig');
  await paymentsService.handleStripeWebhook(rawBody, 'sig');

  assert.equal(prisma.ledgerEntries.length, ledgerCountAfter);
});

test('Webhook durable ACK: returns error when event cannot be persisted', async () => {
  const prisma = new InMemoryPrisma();
  prisma.shouldFailPaymentGatewayEventUpsert = true;
  const stripeClient = new StripeClientStub();
  const stripeService = buildStripeServiceStub(stripeClient) as any;
  const paymentsService = new PaymentsService(
    prisma as any,
    stripeService,
    new PermissionsServiceStub() as any,
    new NotificationServiceStub() as any,
    new SettlementServiceStub() as any,
  );

  const event = {
    id: 'evt_durable_fail_1',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_durable_fail_1', metadata: {} } },
  } as any;

  await assert.rejects(async () => {
    await paymentsService.handleStripeWebhook(Buffer.from(JSON.stringify(event)), 'sig');
  });
});

test('Webhook crash fallback: marks gateway event failed and schedules retry when processor crashes', async () => {
  const prisma = new InMemoryPrisma();
  const stripeClient = new StripeClientStub();
  const stripeService = buildStripeServiceStub(stripeClient) as any;
  const paymentsService = new PaymentsService(
    prisma as any,
    stripeService,
    new PermissionsServiceStub() as any,
    new NotificationServiceStub() as any,
    new SettlementServiceStub() as any,
  );

  // Simulate an unexpected crash after durable upsert.
  (paymentsService as any).claimAndProcessGatewayEvent = async () => {
    throw new Error('boom');
  };

  const event = {
    id: 'evt_crash_1',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_crash_1', metadata: {} } },
  } as any;

  await paymentsService.handleStripeWebhook(Buffer.from(JSON.stringify(event)), 'sig');

  const stored = prisma.paymentGatewayEvents.find(
    (e) => e.provider === 'stripe' && e.providerEventId === 'evt_crash_1',
  )!;
  assert.equal(stored.status, 'failed');
  assert.equal(stored.processedAt ?? null, null);
  assert.ok(stored.nextAttemptAt instanceof Date);
  assert.equal(stored.attempts ?? 0, 0);
  assert.ok(String(stored.errorMessage ?? '').includes('boom'));
});

test('Webhook upsert update: unprocessed event nextAttemptAt is pulled forward for immediate retry', async () => {
  const prisma = new InMemoryPrisma();
  const stripeClient = new StripeClientStub();
  const stripeService = buildStripeServiceStub(stripeClient) as any;
  const paymentsService = new PaymentsService(
    prisma as any,
    stripeService,
    new PermissionsServiceStub() as any,
    new NotificationServiceStub() as any,
    new SettlementServiceStub() as any,
  );

  const future = new Date(Date.now() + 60 * 60 * 1000);
  prisma.paymentGatewayEvents.push({
    id: 'pge_existing_1',
    gateway: 'stripe',
    provider: 'stripe',
    providerEventId: 'evt_existing_1',
    eventType: 'charge.refunded',
    status: 'failed',
    payload: { id: 'evt_existing_1', type: 'charge.refunded', data: { object: {} } },
    payloadHash: 'hash',
    receivedAt: new Date(),
    nextAttemptAt: future,
    processedAt: null,
    attempts: 1,
    errorMessage: 'previous_error',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const before = Date.now();
  await (paymentsService as any).upsertGatewayEvent({
    id: 'evt_existing_1',
    type: 'charge.refunded',
    data: { object: { id: 'ch_any' } },
  } as any);
  const after = Date.now();

  const stored = prisma.paymentGatewayEvents.find((e) => e.id === 'pge_existing_1')!;
  assert.equal(stored.processedAt ?? null, null);
  assert.ok(stored.nextAttemptAt instanceof Date);
  assert.ok(stored.nextAttemptAt.getTime() <= after + 1000);
  assert.ok(stored.nextAttemptAt.getTime() >= before - 1000);
});

test('Community balance: settlement snapshot is derived from ledger + settlement items', async () => {
  const prisma = new InMemoryPrisma();
  prisma.communities.push({ id: 'com_1', stripeAccountId: null });

  const paymentsService = new PaymentsService(
    prisma as any,
    { enabled: false, client: {} } as any,
    new PermissionsServiceStub() as any,
    new NotificationServiceStub() as any,
    new SettlementServiceStub() as any,
  );

  const now = new Date();
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const inMonth = new Date(Math.max(monthStart.getTime(), now.getTime() - 5 * 60_000));
  const beforeMonth = new Date(monthStart.getTime() - 5 * 60_000);

  prisma.ledgerEntries.push(
    {
      id: 'led_hp_prev',
      businessPaymentId: 'pay_prev',
      businessCommunityId: 'com_1',
      entryType: 'host_payable',
      direction: 'out',
      amount: 1000,
      currency: 'jpy',
      provider: 'internal',
      idempotencyKey: 'led_hp_prev',
      occurredAt: beforeMonth,
    },
    {
      id: 'led_fee_prev',
      businessPaymentId: 'pay_prev',
      businessCommunityId: 'com_1',
      entryType: 'stripe_fee_actual',
      direction: 'out',
      amount: 50,
      currency: 'jpy',
      provider: 'stripe',
      idempotencyKey: 'led_fee_prev',
      occurredAt: beforeMonth,
    },
    {
      id: 'led_hp_month',
      businessPaymentId: 'pay_month',
      businessCommunityId: 'com_1',
      entryType: 'host_payable',
      direction: 'out',
      amount: 9000,
      currency: 'jpy',
      provider: 'internal',
      idempotencyKey: 'led_hp_month',
      occurredAt: inMonth,
    },
    {
      id: 'led_fee_month',
      businessPaymentId: 'pay_month',
      businessCommunityId: 'com_1',
      entryType: 'stripe_fee_actual',
      direction: 'out',
      amount: 150,
      currency: 'jpy',
      provider: 'stripe',
      idempotencyKey: 'led_fee_month',
      occurredAt: inMonth,
    },
    {
      id: 'led_rev_month',
      businessPaymentId: 'pay_month',
      businessCommunityId: 'com_1',
      entryType: 'host_payable_reversal',
      direction: 'in',
      amount: 2000,
      currency: 'jpy',
      provider: 'internal',
      idempotencyKey: 'led_rev_month',
      occurredAt: inMonth,
    },
  );

  prisma.settlementItems.push({
    id: 'si_1',
    batchId: 'sb_1',
    hostId: 'com_1',
    currency: 'jpy',
    hostBalance: 0,
    settleAmount: 5000,
    carryReceivable: 0,
    status: 'completed',
    counts: {},
    stripeTransferId: 'tr_1',
    createdAt: now,
    updatedAt: now,
  });

  const all = await paymentsService.getCommunityBalance('user_1', 'com_1');
  assert.equal(all.settlement?.accruedNetAll, 8000);
  assert.equal(all.settlement?.paidOutAll, 5000);
  assert.equal(all.settlement?.hostBalance, 3000);
  assert.equal(all.settlement?.settleAmount, 3000);
  assert.equal(all.settlement?.carryReceivable, 0);
  assert.equal(all.settlement?.accruedNetPeriod, undefined);
  assert.equal(all.stripeFee, 200);

  const month = await paymentsService.getCommunityBalance('user_1', 'com_1', 'month');
  assert.equal(month.settlement?.accruedNetPeriod, 7000);
  assert.equal(month.stripeFee, 150);
});

test('Community balance: stripe fee is backfilled from payment fields into ledger (DB-only) and then shows up', async () => {
  const prisma = new InMemoryPrisma();
  prisma.communities.push({ id: 'com_1', stripeAccountId: null });

  const paymentsService = new PaymentsService(
    prisma as any,
    { enabled: false, client: {} } as any,
    new PermissionsServiceStub() as any,
    new NotificationServiceStub() as any,
    new SettlementServiceStub() as any,
  );

  const createdAt = new Date('2026-01-10T10:00:00.000Z');
  prisma.payments.push({
    id: 'pay_fee_1',
    userId: 'user_1',
    communityId: 'com_1',
    eventId: 'event_1',
    registrationId: 'reg_fee_1',
    amount: 10000,
    platformFee: 500,
    currency: 'jpy',
    status: 'paid',
    method: 'stripe',
    chargeModel: 'platform_charge',
    stripePaymentIntentId: 'pi_fee_1',
    stripeChargeId: 'ch_fee_1',
    providerBalanceTxId: 'bt_fee_1',
    stripeFeeAmountActual: null,
    merchantTransferAmount: 9300,
    refundedGrossTotal: 0,
    refundedPlatformFeeTotal: 0,
    reversedMerchantTotal: 0,
    createdAt,
    updatedAt: createdAt,
  });

  const before = await paymentsService.getCommunityBalance('user_1', 'com_1');
  assert.equal(before.stripeFee, 0);

  const backfill = await backfillPlatformChargeLedgerFees(prisma as any, { communityId: 'com_1' });
  assert.equal(backfill.scannedPayments, 1);
  assert.equal(backfill.created.stripeFeeActual, 1);
  assert.equal(backfill.created.platformFee, 1);
  assert.equal(backfill.created.hostPayable, 1);

  const after = await paymentsService.getCommunityBalance('user_1', 'com_1');
  assert.equal(after.stripeFee, 200);
  assert.equal(after.platformFee, 500);
  assert.equal(after.net, 9300);

  const ledgerStripeFee = prisma.ledgerEntries.find((e) => e.entryType === 'stripe_fee_actual' && e.businessPaymentId === 'pay_fee_1');
  assert.ok(ledgerStripeFee);
  assert.equal(ledgerStripeFee.idempotencyKey, 'stripe:balance_tx.fee:bt_fee_1');

  const ledgerPlatformFee = prisma.ledgerEntries.find((e) => e.entryType === 'platform_fee' && e.businessPaymentId === 'pay_fee_1');
  assert.ok(ledgerPlatformFee);
  assert.equal(ledgerPlatformFee.idempotencyKey, 'ledger:platform_fee:pay_fee_1');

  const ledgerHostPayable = prisma.ledgerEntries.find((e) => e.entryType === 'host_payable' && e.businessPaymentId === 'pay_fee_1');
  assert.ok(ledgerHostPayable);
  assert.equal(ledgerHostPayable.amount, 9300);

  const ledgerCount = prisma.ledgerEntries.length;
  await backfillPlatformChargeLedgerFees(prisma as any, { communityId: 'com_1' });
  assert.equal(prisma.ledgerEntries.length, ledgerCount);
});

test('Community balance: stripe fee is backfilled from Stripe balance transaction when payment is missing fee (Plan B)', async () => {
  const prisma = new InMemoryPrisma();
  prisma.communities.push({ id: 'com_1', stripeAccountId: null });

  const paymentsService = new PaymentsService(
    prisma as any,
    { enabled: false, client: {} } as any,
    new PermissionsServiceStub() as any,
    new NotificationServiceStub() as any,
    new SettlementServiceStub() as any,
  );

  const createdAt = new Date('2026-01-10T10:00:00.000Z');
  prisma.payments.push({
    id: 'pay_fee_b_1',
    userId: 'user_1',
    communityId: 'com_1',
    eventId: 'event_1',
    registrationId: 'reg_fee_b_1',
    amount: 10000,
    platformFee: 500,
    currency: 'jpy',
    status: 'paid',
    method: 'stripe',
    chargeModel: 'platform_charge',
    stripePaymentIntentId: 'pi_fee_b_1',
    stripeChargeId: null,
    providerBalanceTxId: null,
    stripeFeeAmountActual: null,
    // NOTE: existing merchantTransferAmount might be recorded without Stripe fee (gross - platformFee).
    merchantTransferAmount: 9500,
    refundedGrossTotal: 0,
    refundedPlatformFeeTotal: 0,
    reversedMerchantTotal: 0,
    createdAt,
    updatedAt: createdAt,
  });

  const before = await paymentsService.getCommunityBalance('user_1', 'com_1');
  assert.equal(before.stripeFee, 0);

  const stripe = {
    paymentIntents: {
      retrieve: async (id: string) => {
        assert.equal(id, 'pi_fee_b_1');
        return {
          id,
          object: 'payment_intent',
          latest_charge: {
            id: 'ch_fee_b_1',
            balance_transaction: 'bt_fee_b_1',
          },
        } as any;
      },
    },
    balanceTransactions: {
      retrieve: async (id: string) => {
        assert.equal(id, 'bt_fee_b_1');
        return {
          id,
          object: 'balance_transaction',
          created: Math.floor(createdAt.getTime() / 1000),
          currency: 'jpy',
          fee: 200,
          fee_details: [{ amount: 200 }],
        } as any;
      },
    },
  } as any;

  const stripeBackfill = await backfillPlatformChargeLedgerFeesFromStripe(prisma as any, stripe, {
    communityId: 'com_1',
  });
  assert.equal(stripeBackfill.scannedPayments, 1);
  assert.equal(stripeBackfill.created.stripeFeeActual, 1);
  assert.equal(stripeBackfill.updatedPayments, 1);

  // Run DB-only to ensure other ledger entries are present if needed (idempotent).
  await backfillPlatformChargeLedgerFees(prisma as any, { communityId: 'com_1' });

  const after = await paymentsService.getCommunityBalance('user_1', 'com_1');
  assert.equal(after.stripeFee, 200);
  assert.equal(after.platformFee, 500);
  assert.equal(after.net, 9300);

  const updatedPayment = prisma.payments.find((p) => p.id === 'pay_fee_b_1')!;
  assert.equal(updatedPayment.stripeFeeAmountActual, 200);
  assert.equal(updatedPayment.merchantTransferAmount, 9300);

  const ledgerStripeFee = prisma.ledgerEntries.find(
    (e) => e.entryType === 'stripe_fee_actual' && e.businessPaymentId === 'pay_fee_b_1',
  );
  assert.ok(ledgerStripeFee);
  assert.equal(ledgerStripeFee.idempotencyKey, 'stripe:balance_tx.fee:bt_fee_b_1');
});

test('Community balance: Plan B can resolve balanceTx via checkout session when payment_intent id is missing', async () => {
  const prisma = new InMemoryPrisma();
  prisma.communities.push({ id: 'com_1', stripeAccountId: null });

  const paymentsService = new PaymentsService(
    prisma as any,
    { enabled: false, client: {} } as any,
    new PermissionsServiceStub() as any,
    new NotificationServiceStub() as any,
    new SettlementServiceStub() as any,
  );

  const createdAt = new Date('2026-01-10T10:00:00.000Z');
  prisma.payments.push({
    id: 'pay_fee_b_2',
    userId: 'user_1',
    communityId: 'com_1',
    eventId: 'event_1',
    registrationId: 'reg_fee_b_2',
    amount: 10000,
    platformFee: 500,
    currency: 'jpy',
    status: 'paid',
    method: 'stripe',
    chargeModel: 'platform_charge',
    stripeCheckoutSessionId: 'cs_fee_b_2',
    stripePaymentIntentId: null,
    stripeChargeId: null,
    providerBalanceTxId: null,
    stripeFeeAmountActual: null,
    merchantTransferAmount: 9500,
    refundedGrossTotal: 0,
    refundedPlatformFeeTotal: 0,
    reversedMerchantTotal: 0,
    createdAt,
    updatedAt: createdAt,
  });

  const stripe = {
    checkout: {
      sessions: {
        retrieve: async (id: string) => {
          assert.equal(id, 'cs_fee_b_2');
          return {
            id,
            object: 'checkout.session',
            payment_intent: 'pi_fee_b_2',
          } as any;
        },
      },
    },
    paymentIntents: {
      retrieve: async (id: string) => {
        assert.equal(id, 'pi_fee_b_2');
        return {
          id,
          object: 'payment_intent',
          latest_charge: {
            id: 'ch_fee_b_2',
            balance_transaction: 'bt_fee_b_2',
          },
        } as any;
      },
    },
    balanceTransactions: {
      retrieve: async (id: string) => {
        assert.equal(id, 'bt_fee_b_2');
        return {
          id,
          object: 'balance_transaction',
          created: Math.floor(createdAt.getTime() / 1000),
          currency: 'jpy',
          fee: 200,
          fee_details: [{ amount: 200 }],
        } as any;
      },
    },
  } as any;

  const before = await paymentsService.getCommunityBalance('user_1', 'com_1');
  assert.equal(before.stripeFee, 0);

  const stripeBackfill = await backfillPlatformChargeLedgerFeesFromStripe(prisma as any, stripe, {
    communityId: 'com_1',
  });
  assert.equal(stripeBackfill.scannedPayments, 1);
  assert.equal(stripeBackfill.created.stripeFeeActual, 1);
  assert.equal(stripeBackfill.updatedPayments, 1);

  const after = await paymentsService.getCommunityBalance('user_1', 'com_1');
  assert.equal(after.stripeFee, 200);
});

test('P2: payment_intent.payment_failed marks payment failed', async () => {
  const prisma = new InMemoryPrisma();
  const stripeClient = new StripeClientStub();
  const stripeService = buildStripeServiceStub(stripeClient) as any;
  const paymentsService = new PaymentsService(
    prisma as any,
    stripeService,
    new PermissionsServiceStub() as any,
    new NotificationServiceStub() as any,
    new SettlementServiceStub() as any,
  );

  prisma.registrations.push({
    id: 'reg_2',
    userId: 'user_2',
    status: 'pending',
    paymentStatus: 'unpaid',
    amount: 8000,
    paidAmount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  prisma.payments.push({
    id: 'pay_2',
    userId: 'user_2',
    communityId: 'com_1',
    eventId: 'event_1',
    registrationId: 'reg_2',
    amount: 8000,
    platformFee: 400,
    currency: 'jpy',
    status: 'pending',
    method: 'stripe',
    chargeModel: 'platform_charge',
    stripePaymentIntentId: 'pi_fail_1',
    refundedGrossTotal: 0,
    refundedPlatformFeeTotal: 0,
    reversedMerchantTotal: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const event = {
    id: 'evt_pi_failed_1',
    type: 'payment_intent.payment_failed',
    data: { object: { id: 'pi_fail_1' } },
  } as any;

  await paymentsService.handleStripeWebhook(Buffer.from(JSON.stringify(event)), 'sig');

  const payment = prisma.payments.find((p) => p.id === 'pay_2')!;
  assert.equal(payment.status, 'failed');

  const reg = prisma.registrations.find((r) => r.id === 'reg_2')!;
  assert.equal(reg.paymentStatus, 'failed');
});

test('P3: checkout.session.expired cancels pending payment', async () => {
  const prisma = new InMemoryPrisma();
  const stripeClient = new StripeClientStub();
  const stripeService = buildStripeServiceStub(stripeClient) as any;
  const paymentsService = new PaymentsService(
    prisma as any,
    stripeService,
    new PermissionsServiceStub() as any,
    new NotificationServiceStub() as any,
    new SettlementServiceStub() as any,
  );

  prisma.registrations.push({
    id: 'reg_3',
    userId: 'user_3',
    status: 'pending',
    paymentStatus: 'unpaid',
    amount: 6000,
    paidAmount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  prisma.payments.push({
    id: 'pay_3',
    userId: 'user_3',
    communityId: 'com_1',
    eventId: 'event_1',
    registrationId: 'reg_3',
    amount: 6000,
    platformFee: 300,
    currency: 'jpy',
    status: 'pending',
    method: 'stripe',
    chargeModel: 'platform_charge',
    stripeCheckoutSessionId: 'cs_exp_1',
    refundedGrossTotal: 0,
    refundedPlatformFeeTotal: 0,
    reversedMerchantTotal: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const event = {
    id: 'evt_cs_expired_1',
    type: 'checkout.session.expired',
    data: { object: { id: 'cs_exp_1', metadata: { registrationId: 'reg_3' } } },
  } as any;

  await paymentsService.handleStripeWebhook(Buffer.from(JSON.stringify(event)), 'sig');

  const payment = prisma.payments.find((p) => p.id === 'pay_3')!;
  assert.equal(payment.status, 'cancelled');
});

test('R1-R3: platform refund is from platform, no reverse_transfer/refund_application_fee, supports partial refunds', async () => {
  const prisma = new InMemoryPrisma();
  const stripeClient = new StripeClientStub();
  stripeClient.paymentIntents['pi_ref_1'] = buildPaidIntent({ id: 'pi_ref_1', chargeId: 'ch_ref_1', fee: 350 });
  const stripeService = buildStripeServiceStub(stripeClient) as any;
  const paymentsService = new PaymentsService(
    prisma as any,
    stripeService,
    new PermissionsServiceStub() as any,
    new NotificationServiceStub() as any,
    new SettlementServiceStub() as any,
  );

  prisma.registrations.push({
    id: 'reg_r1',
    userId: 'user_1',
    status: 'paid',
    paymentStatus: 'paid',
    amount: 10000,
    paidAmount: 10000,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  prisma.payments.push({
    id: 'pay_r1',
    userId: 'user_1',
    communityId: 'com_1',
    eventId: 'event_1',
    registrationId: 'reg_r1',
    amount: 10000,
    platformFee: 500,
    currency: 'jpy',
    status: 'paid',
    method: 'stripe',
    chargeModel: 'platform_charge',
    stripePaymentIntentId: 'pi_ref_1',
    refundedGrossTotal: 0,
    refundedPlatformFeeTotal: 0,
    reversedMerchantTotal: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Partial refund (2000)
  await paymentsService.refundStripePaymentInternal('admin', 'pay_r1', 2000, 'partial');
  const refundCall1 = stripeClient.refundsCreateCalls[0];
  const refundParams1 = refundCall1.params;
  assert.equal(refundParams1.amount, 2000);
  assert.ok(!('reverse_transfer' in refundParams1));
  assert.ok(!('refund_application_fee' in refundParams1));
  assert.equal(refundCall1.opts?.idempotencyKey, 'refund:pay_r1:2000:0');

  let payment = prisma.payments.find((p) => p.id === 'pay_r1')!;
  assert.equal(payment.status, 'partial_refunded');
  assert.equal(payment.refundedGrossTotal, 2000);

  // Another partial refund (8000) -> full refund
  await paymentsService.refundStripePaymentInternal('admin', 'pay_r1', 8000, 'rest');
  const refundCall2 = stripeClient.refundsCreateCalls[1];
  const refundParams2 = refundCall2.params;
  assert.equal(refundParams2.amount, 8000);
  assert.ok(!('reverse_transfer' in refundParams2));
  assert.equal(refundCall2.opts?.idempotencyKey, 'refund:pay_r1:8000:2000');

  payment = prisma.payments.find((p) => p.id === 'pay_r1')!;
  assert.equal(payment.status, 'refunded');
  assert.equal(payment.refundedGrossTotal, 10000);

  // Ledger should have refund entries keyed per refund id
  const refundLedgerKeys = prisma.ledgerEntries
    .filter((e) => e.entryType === 'refund' && e.provider === 'stripe')
    .map((e) => e.idempotencyKey);
  assert.ok(refundLedgerKeys.some((k) => k.includes('stripe:refund:re_test_1')));
  assert.ok(refundLedgerKeys.some((k) => k.includes('stripe:refund:re_test_2')));
});

test('R4/R5: out-of-order refund webhook is retried and idempotent', async () => {
  const prisma = new InMemoryPrisma();
  const stripeClient = new StripeClientStub();
  const stripeService = buildStripeServiceStub(stripeClient) as any;
  const paymentsService = new PaymentsService(
    prisma as any,
    stripeService,
    new PermissionsServiceStub() as any,
    new NotificationServiceStub() as any,
    new SettlementServiceStub() as any,
  );

  const refundEvent = {
    id: 'evt_refund_ooo_1',
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_ooo_1',
        payment_intent: 'pi_ooo_1',
        amount_refunded: 10000,
        currency: 'jpy',
        refunds: { data: [{ id: 're_ooo_1', amount: 10000, currency: 'jpy', balance_transaction: 'bt_re_ooo_1' }] },
      },
    },
  } as any;

  await paymentsService.handleStripeWebhook(Buffer.from(JSON.stringify(refundEvent)), 'sig');

  const storedGatewayEvent = prisma.paymentGatewayEvents.find(
    (e) => e.provider === 'stripe' && e.providerEventId === 'evt_refund_ooo_1',
  )!;
  assert.ok(storedGatewayEvent.payload);
  assert.equal(storedGatewayEvent.status, 'failed');
  assert.equal(storedGatewayEvent.processedAt ?? null, null);
  assert.ok(storedGatewayEvent.nextAttemptAt instanceof Date);

  // Payment arrives later
  prisma.registrations.push({
    id: 'reg_ooo_1',
    userId: 'user_ooo',
    status: 'paid',
    paymentStatus: 'paid',
    amount: 10000,
    paidAmount: 10000,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  prisma.payments.push({
    id: 'pay_ooo_1',
    userId: 'user_ooo',
    communityId: 'com_1',
    eventId: 'event_1',
    registrationId: 'reg_ooo_1',
    amount: 10000,
    platformFee: 500,
    currency: 'jpy',
    status: 'paid',
    method: 'stripe',
    chargeModel: 'platform_charge',
    stripePaymentIntentId: 'pi_ooo_1',
    refundedGrossTotal: 0,
    refundedPlatformFeeTotal: 0,
    reversedMerchantTotal: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Make the gateway event due and retry
  storedGatewayEvent.nextAttemptAt = new Date(Date.now() - 1);

  const retry = await paymentsService.retryOverdueStripeWebhookEvents(5);
  assert.equal(retry.retried, 1);

  const payment = prisma.payments.find((p) => p.id === 'pay_ooo_1')!;
  assert.equal(payment.status, 'refunded');

  const refundEntryCount = prisma.ledgerEntries.filter((e) => e.idempotencyKey === 'stripe:refund:re_ooo_1').length;
  assert.equal(refundEntryCount, 1);

  // Replay the same event should not duplicate ledger
  await paymentsService.handleStripeWebhook(Buffer.from(JSON.stringify(refundEvent)), 'sig');
  const refundEntryCountAfter = prisma.ledgerEntries.filter((e) => e.idempotencyKey === 'stripe:refund:re_ooo_1').length;
  assert.equal(refundEntryCountAfter, 1);
});
