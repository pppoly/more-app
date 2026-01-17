import test from 'node:test';
import assert from 'node:assert/strict';
import { SettlementService } from '../src/payments/settlement.service';
import { resetPaymentsConfigForTest } from '../src/payments/payments.config';
import { InMemoryPrisma, StripeClientStub, buildStripeServiceStub } from './payments-test-helpers';

const buildService = (prisma: InMemoryPrisma, stripeClient: StripeClientStub) => {
  const stripeService = buildStripeServiceStub(stripeClient) as any;
  return new SettlementService(prisma as any, stripeService);
};

test('Dispute blocks only the disputed payment amount (other payments still settle)', async () => {
  resetPaymentsConfigForTest();
  process.env.SETTLEMENT_ENABLED = '1';
  process.env.SETTLEMENT_DELAY_DAYS = '0';
  process.env.SETTLEMENT_WINDOW_DAYS = '30';
  process.env.SETTLEMENT_MIN_TRANSFER_AMOUNT = '0';

  const prisma = new InMemoryPrisma();
  const stripeClient = new StripeClientStub();
  const settlementService = buildService(prisma, stripeClient);

  prisma.communities.push({
    id: 'com_1',
    name: 'Host 1',
    stripeAccountId: 'acct_1',
    stripeAccountOnboarded: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const now = new Date();
  const ended = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const createdAt = new Date(now.getTime() - 60 * 1000);

  prisma.payments.push(
    {
      id: 'pay_disputed',
      userId: 'user_1',
      communityId: 'com_1',
      eventId: 'event_1',
      amount: 6000,
      platformFee: 0,
      currency: 'jpy',
      status: 'disputed',
      method: 'stripe',
      chargeModel: 'platform_charge',
      refundedGrossTotal: 0,
      refundedPlatformFeeTotal: 0,
      reversedMerchantTotal: 0,
      createdAt,
      updatedAt: createdAt,
      event: { endTime: ended },
    },
    {
      id: 'pay_ok',
      userId: 'user_1',
      communityId: 'com_1',
      eventId: 'event_2',
      amount: 4000,
      platformFee: 0,
      currency: 'jpy',
      status: 'paid',
      method: 'stripe',
      chargeModel: 'platform_charge',
      refundedGrossTotal: 0,
      refundedPlatformFeeTotal: 0,
      reversedMerchantTotal: 0,
      createdAt,
      updatedAt: createdAt,
      event: { endTime: ended },
    },
  );

  prisma.ledgerEntries.push(
    {
      id: 'led_hp_disputed',
      businessPaymentId: 'pay_disputed',
      businessCommunityId: 'com_1',
      entryType: 'host_payable',
      direction: 'out',
      amount: 6000,
      currency: 'jpy',
      provider: 'internal',
      idempotencyKey: 'led_hp_disputed',
      occurredAt: createdAt,
    },
    {
      id: 'led_hp_ok',
      businessPaymentId: 'pay_ok',
      businessCommunityId: 'com_1',
      entryType: 'host_payable',
      direction: 'out',
      amount: 4000,
      currency: 'jpy',
      provider: 'internal',
      idempotencyKey: 'led_hp_ok',
      occurredAt: createdAt,
    },
  );

  const res = await settlementService.runSettlementBatch({
    periodFrom: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    periodTo: now,
    trigger: { type: 'manual', userId: 'admin_1' },
  });
  assert.ok(res.batchId);
  assert.equal(res.status, 'completed');

  assert.equal(stripeClient.transfersCreateCalls.length, 1);
  assert.equal(stripeClient.transfersCreateCalls[0].params.amount, 4000);
  assert.equal(stripeClient.transfersCreateCalls[0].params.destination, 'acct_1');

  const item = prisma.settlementItems.find((i) => i.hostId === 'com_1')!;
  assert.equal(item.status, 'completed');
  assert.equal(item.settleAmount, 4000);
});

test('Batch status is blocked when all items are rule-blocked and no transfers happen', async () => {
  resetPaymentsConfigForTest();
  process.env.SETTLEMENT_ENABLED = '1';
  process.env.SETTLEMENT_DELAY_DAYS = '7';
  process.env.SETTLEMENT_WINDOW_DAYS = '30';
  process.env.SETTLEMENT_MIN_TRANSFER_AMOUNT = '0';

  const prisma = new InMemoryPrisma();
  const stripeClient = new StripeClientStub();
  const settlementService = buildService(prisma, stripeClient);

  prisma.communities.push({
    id: 'com_1',
    name: 'Host 1',
    stripeAccountId: 'acct_1',
    stripeAccountOnboarded: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const now = new Date();
  const endedYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const createdAt = new Date(now.getTime() - 60 * 1000);

  prisma.payments.push({
    id: 'pay_not_matured',
    userId: 'user_1',
    communityId: 'com_1',
    eventId: 'event_1',
    amount: 10000,
    platformFee: 0,
    currency: 'jpy',
    status: 'paid',
    method: 'stripe',
    chargeModel: 'platform_charge',
    refundedGrossTotal: 0,
    refundedPlatformFeeTotal: 0,
    reversedMerchantTotal: 0,
    createdAt,
    updatedAt: createdAt,
    event: { endTime: endedYesterday },
  });

  prisma.ledgerEntries.push({
    id: 'led_hp_nm',
    businessPaymentId: 'pay_not_matured',
    businessCommunityId: 'com_1',
    entryType: 'host_payable',
    direction: 'out',
    amount: 8000,
    currency: 'jpy',
    provider: 'internal',
    idempotencyKey: 'led_hp_nm',
    occurredAt: createdAt,
  });

  const res = await settlementService.runSettlementBatch({
    periodFrom: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    periodTo: now,
    trigger: { type: 'manual', userId: 'admin_1' },
  });

  assert.equal(res.status, 'blocked');
  assert.equal(stripeClient.transfersCreateCalls.length, 0);

  const item = prisma.settlementItems.find((i) => i.hostId === 'com_1')!;
  assert.equal(item.status, 'blocked');
  assert.equal(item.settleAmount, 0);
});

