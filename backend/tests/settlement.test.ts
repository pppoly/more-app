import test from 'node:test';
import assert from 'node:assert/strict';
import { SettlementService } from '../src/payments/settlement.service';
import { resetPaymentsConfigForTest } from '../src/payments/payments.config';
import { InMemoryPrisma, StripeClientStub, buildStripeServiceStub } from './payments-test-helpers';

test('S1/S3: settlement dry-run generates batch/items and no Stripe transfers', async () => {
  process.env.SETTLEMENT_ENABLED = '0';
  process.env.SETTLEMENT_REPORT_DIR = '.logs/settlement-test';
  resetPaymentsConfigForTest();

  const prisma = new InMemoryPrisma();
  const stripeClient = new StripeClientStub();
  const stripeService = buildStripeServiceStub(stripeClient) as any;
  const settlementService = new SettlementService(prisma as any, stripeService);

  prisma.communities.push({ id: 'com_1', stripeAccountId: 'acct_1', stripeAccountOnboarded: true });
  prisma.communities.push({ id: 'com_2', stripeAccountId: 'acct_2', stripeAccountOnboarded: true });

  const baseTime = new Date('2025-01-10T00:00:00Z');
  prisma.payments.push(
    {
      id: 'pay_s1_1',
      userId: 'u1',
      communityId: 'com_1',
      amount: 10000,
      platformFee: 500,
      currency: 'jpy',
      status: 'paid',
      method: 'stripe',
      chargeModel: 'platform_charge',
      stripeFeeAmountActual: 350,
      merchantTransferAmount: 9150,
      reversedMerchantTotal: 0,
      refundedGrossTotal: 0,
      createdAt: baseTime,
      updatedAt: baseTime,
    },
    {
      id: 'pay_s1_2',
      userId: 'u2',
      communityId: 'com_1',
      amount: 10000,
      platformFee: 500,
      currency: 'jpy',
      status: 'partial_refunded',
      method: 'stripe',
      chargeModel: 'platform_charge',
      stripeFeeAmountActual: 350,
      merchantTransferAmount: 9150,
      reversedMerchantTotal: 1830,
      refundedGrossTotal: 2000,
      createdAt: baseTime,
      updatedAt: baseTime,
    },
    {
      id: 'pay_s1_3',
      userId: 'u3',
      communityId: 'com_2',
      amount: 10000,
      platformFee: 500,
      currency: 'jpy',
      status: 'refunded',
      method: 'stripe',
      chargeModel: 'platform_charge',
      stripeFeeAmountActual: 350,
      merchantTransferAmount: 9150,
      reversedMerchantTotal: 9150,
      refundedGrossTotal: 10000,
      createdAt: baseTime,
      updatedAt: baseTime,
    },
  );

  prisma.ledgerEntries.push(
    {
      id: 'led_s1_hp_1',
      businessPaymentId: 'pay_s1_1',
      businessCommunityId: 'com_1',
      entryType: 'host_payable',
      direction: 'out',
      amount: 9150,
      currency: 'jpy',
      provider: 'internal',
      idempotencyKey: 'led_s1_hp_1',
      occurredAt: baseTime,
    },
    {
      id: 'led_s1_hp_2',
      businessPaymentId: 'pay_s1_2',
      businessCommunityId: 'com_1',
      entryType: 'host_payable',
      direction: 'out',
      amount: 9150,
      currency: 'jpy',
      provider: 'internal',
      idempotencyKey: 'led_s1_hp_2',
      occurredAt: baseTime,
    },
    {
      id: 'led_s1_hp_rev_2',
      businessPaymentId: 'pay_s1_2',
      businessCommunityId: 'com_1',
      entryType: 'host_payable_reversal',
      direction: 'in',
      amount: 1830,
      currency: 'jpy',
      provider: 'internal',
      idempotencyKey: 'led_s1_hp_rev_2',
      occurredAt: baseTime,
    },
    {
      id: 'led_s1_hp_3',
      businessPaymentId: 'pay_s1_3',
      businessCommunityId: 'com_2',
      entryType: 'host_payable',
      direction: 'out',
      amount: 9150,
      currency: 'jpy',
      provider: 'internal',
      idempotencyKey: 'led_s1_hp_3',
      occurredAt: baseTime,
    },
    {
      id: 'led_s1_hp_rev_3',
      businessPaymentId: 'pay_s1_3',
      businessCommunityId: 'com_2',
      entryType: 'host_payable_reversal',
      direction: 'in',
      amount: 9150,
      currency: 'jpy',
      provider: 'internal',
      idempotencyKey: 'led_s1_hp_rev_3',
      occurredAt: baseTime,
    },
  );

  const result = await settlementService.runSettlementBatch({
    periodFrom: new Date('2025-01-01T00:00:00Z'),
    periodTo: new Date('2025-02-01T00:00:00Z'),
  });

  assert.equal(result.status, 'dry_run');
  assert.equal(stripeClient.transfersCreateCalls.length, 0);
  assert.equal(prisma.settlementBatches.length, 1);
  assert.equal(prisma.settlementBatches[0].status, 'dry_run');
  assert.ok(prisma.settlementItems.every((i) => i.status === 'dry_run'));
  const com1 = prisma.settlementItems.find((i) => i.batchId === prisma.settlementBatches[0].id && i.hostId === 'com_1')!;
  assert.equal(com1.settleAmount, 16470);
});

test('S2: negative host balance carries receivable and does not transfer', async () => {
  process.env.SETTLEMENT_ENABLED = '0';
  process.env.SETTLEMENT_REPORT_DIR = '.logs/settlement-test';
  resetPaymentsConfigForTest();

  const prisma = new InMemoryPrisma();
  const stripeClient = new StripeClientStub();
  const stripeService = buildStripeServiceStub(stripeClient) as any;
  const settlementService = new SettlementService(prisma as any, stripeService);

  prisma.communities.push({ id: 'com_neg', stripeAccountId: 'acct_neg', stripeAccountOnboarded: true });
  prisma.settlementItems.push({
    id: 'si_prev',
    batchId: 'sb_prev',
    hostId: 'com_neg',
    currency: 'jpy',
    hostBalance: 5000,
    settleAmount: 5000,
    carryReceivable: 0,
    status: 'completed',
    counts: {},
    stripeTransferId: 'tr_prev',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await settlementService.runSettlementBatch({
    periodFrom: new Date('2025-01-01T00:00:00Z'),
    periodTo: new Date('2025-02-01T00:00:00Z'),
  });

  const item = prisma.settlementItems.find((i) => i.batchId !== 'sb_prev' && i.hostId === 'com_neg')!;
  assert.equal(item.settleAmount, 0);
  assert.equal(item.carryReceivable, 5000);
  assert.equal(stripeClient.transfersCreateCalls.length, 0);
});

test('S4: settlement transfer failure is isolated and can be retried', async () => {
  process.env.SETTLEMENT_ENABLED = '1';
  process.env.SETTLEMENT_REPORT_DIR = '.logs/settlement-test';
  resetPaymentsConfigForTest();

  const prisma = new InMemoryPrisma();
  const stripeClient = new StripeClientStub();
  stripeClient.shouldFailTransfersCreate = true;
  const stripeService = buildStripeServiceStub(stripeClient) as any;
  const settlementService = new SettlementService(prisma as any, stripeService);

  prisma.communities.push({ id: 'com_1', stripeAccountId: 'acct_1', stripeAccountOnboarded: true });
  const baseTime = new Date('2025-01-10T00:00:00Z');
  prisma.payments.push({
    id: 'pay_s4_1',
    userId: 'u1',
    communityId: 'com_1',
    amount: 10000,
    platformFee: 500,
    currency: 'jpy',
    status: 'paid',
    method: 'stripe',
    chargeModel: 'platform_charge',
    stripeFeeAmountActual: 350,
    merchantTransferAmount: 9150,
    reversedMerchantTotal: 0,
    refundedGrossTotal: 0,
    createdAt: baseTime,
    updatedAt: baseTime,
  });
  prisma.ledgerEntries.push({
    id: 'led_s4_hp_1',
    businessPaymentId: 'pay_s4_1',
    businessCommunityId: 'com_1',
    entryType: 'host_payable',
    direction: 'out',
    amount: 9150,
    currency: 'jpy',
    provider: 'internal',
    idempotencyKey: 'led_s4_hp_1',
    occurredAt: baseTime,
  });

  const run = await settlementService.runSettlementBatch({
    periodFrom: new Date('2025-01-01T00:00:00Z'),
    periodTo: new Date('2025-02-01T00:00:00Z'),
  });

  assert.ok(['failed', 'partial_failed'].includes(run.status));
  assert.equal(stripeClient.transfersCreateCalls.length, 1);

  // Retry should succeed
  stripeClient.shouldFailTransfersCreate = false;
  const retry = await settlementService.retrySettlementBatch(run.batchId);
  assert.equal(retry.status, 'completed');
  assert.equal(stripeClient.transfersCreateCalls.length, 2);
});

test('S4: retrySettlementBatch is concurrency safe (claim prevents duplicate transfers)', async () => {
  process.env.SETTLEMENT_ENABLED = '0';
  process.env.SETTLEMENT_REPORT_DIR = '.logs/settlement-test';
  resetPaymentsConfigForTest();

  const prisma = new InMemoryPrisma();
  const stripeClient = new StripeClientStub();
  const stripeService = buildStripeServiceStub(stripeClient) as any;
  const settlementService = new SettlementService(prisma as any, stripeService);

  prisma.communities.push({ id: 'com_1', stripeAccountId: 'acct_1', stripeAccountOnboarded: true });
  const baseTime = new Date('2025-01-10T00:00:00Z');
  prisma.payments.push({
    id: 'pay_cc_1',
    userId: 'u1',
    communityId: 'com_1',
    amount: 10000,
    platformFee: 500,
    currency: 'jpy',
    status: 'paid',
    method: 'stripe',
    chargeModel: 'platform_charge',
    stripeFeeAmountActual: 350,
    merchantTransferAmount: 9150,
    reversedMerchantTotal: 0,
    refundedGrossTotal: 0,
    createdAt: baseTime,
    updatedAt: baseTime,
  });
  prisma.ledgerEntries.push({
    id: 'led_cc_hp_1',
    businessPaymentId: 'pay_cc_1',
    businessCommunityId: 'com_1',
    entryType: 'host_payable',
    direction: 'out',
    amount: 9150,
    currency: 'jpy',
    provider: 'internal',
    idempotencyKey: 'led_cc_hp_1',
    occurredAt: baseTime,
  });

  const dryRun = await settlementService.runSettlementBatch({
    periodFrom: new Date('2025-01-01T00:00:00Z'),
    periodTo: new Date('2025-02-01T00:00:00Z'),
  });
  assert.equal(dryRun.status, 'dry_run');
  assert.equal(stripeClient.transfersCreateCalls.length, 0);

  process.env.SETTLEMENT_ENABLED = '1';
  resetPaymentsConfigForTest();
  await Promise.all([settlementService.retrySettlementBatch(dryRun.batchId), settlementService.retrySettlementBatch(dryRun.batchId)]);
  assert.equal(stripeClient.transfersCreateCalls.length, 1);
});

test('S1 ledger basis: fee actual override and refund adjust settlement via ledger', async () => {
  process.env.SETTLEMENT_ENABLED = '0';
  process.env.SETTLEMENT_REPORT_DIR = '.logs/settlement-test';
  resetPaymentsConfigForTest();

  const prisma = new InMemoryPrisma();
  const stripeClient = new StripeClientStub();
  const stripeService = buildStripeServiceStub(stripeClient) as any;
  const settlementService = new SettlementService(prisma as any, stripeService);

  prisma.communities.push({ id: 'com_fee', stripeAccountId: 'acct_fee', stripeAccountOnboarded: true });
  const baseTime = new Date('2025-01-10T00:00:00Z');
  // Payment fields intentionally drift from ledger (e.g., estimated fee was used in payment row).
  prisma.payments.push({
    id: 'pay_fee_1',
    userId: 'u1',
    communityId: 'com_fee',
    amount: 10000,
    platformFee: 500,
    currency: 'jpy',
    status: 'partial_refunded',
    method: 'stripe',
    chargeModel: 'platform_charge',
    stripeFeeAmountActual: 350,
    merchantTransferAmount: 9200,
    reversedMerchantTotal: 0,
    refundedGrossTotal: 2000,
    createdAt: baseTime,
    updatedAt: baseTime,
  });

  // Ledger is the source of truth: host_payable uses actual fee (9150) and refund reversal (1830).
  prisma.ledgerEntries.push(
    {
      id: 'led_fee_hp_1',
      businessPaymentId: 'pay_fee_1',
      businessCommunityId: 'com_fee',
      entryType: 'host_payable',
      direction: 'out',
      amount: 9150,
      currency: 'jpy',
      provider: 'internal',
      idempotencyKey: 'led_fee_hp_1',
      occurredAt: baseTime,
    },
    {
      id: 'led_fee_hp_rev_1',
      businessPaymentId: 'pay_fee_1',
      businessCommunityId: 'com_fee',
      entryType: 'host_payable_reversal',
      direction: 'in',
      amount: 1830,
      currency: 'jpy',
      provider: 'internal',
      idempotencyKey: 'led_fee_hp_rev_1',
      occurredAt: baseTime,
    },
  );

  const result = await settlementService.runSettlementBatch({
    periodFrom: new Date('2025-01-01T00:00:00Z'),
    periodTo: new Date('2025-02-01T00:00:00Z'),
  });

  assert.equal(result.status, 'dry_run');
  const batchId = prisma.settlementBatches[0].id;
  const item = prisma.settlementItems.find((i) => i.batchId === batchId && i.hostId === 'com_fee')!;
  assert.equal(item.settleAmount, 7320);
});
