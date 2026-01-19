import test from 'node:test';
import assert from 'node:assert/strict';
import { PaymentsService } from '../src/payments/payments.service';
import {
  InMemoryPrisma,
  StripeClientStub,
  buildStripeServiceStub,
  PermissionsServiceStub,
  NotificationServiceStub,
  SettlementServiceStub,
} from './payments-test-helpers';

test('diagnoseStripePayment: keeps partial_refunded when Stripe shows refund', async () => {
  const prisma = new InMemoryPrisma();
  const stripeClient = new StripeClientStub();
  stripeClient.paymentIntents.pi_1 = {
    id: 'pi_1',
    status: 'succeeded',
    latest_charge: {
      id: 'ch_1',
      amount_refunded: 1500,
    },
  } as any;
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
    status: 'refunded',
    paymentStatus: 'refunded',
    amount: 3000,
    paidAmount: 1500,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  prisma.payments.push({
    id: 'pay_1',
    userId: 'user_1',
    communityId: 'com_1',
    eventId: 'event_1',
    registrationId: 'reg_1',
    amount: 3000,
    platformFee: 0,
    currency: 'jpy',
    status: 'partial_refunded',
    method: 'stripe',
    chargeModel: 'platform_charge',
    stripePaymentIntentId: 'pi_1',
    refundedGrossTotal: 1500,
    refundedPlatformFeeTotal: 0,
    reversedMerchantTotal: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await paymentsService.diagnoseStripePayment('pay_1');

  const payment = prisma.payments.find((p) => p.id === 'pay_1')!;
  assert.equal(payment.status, 'partial_refunded');
  assert.equal(payment.refundedGrossTotal, 1500);

  const registration = prisma.registrations.find((r) => r.id === 'reg_1')!;
  assert.equal(registration.paymentStatus, 'refunded');
  assert.equal(registration.status, 'refunded');
  assert.equal(registration.paidAmount, 1500);
});

test('diagnoseStripePayment: repairs paid -> partial_refunded when Stripe shows refund', async () => {
  const prisma = new InMemoryPrisma();
  const stripeClient = new StripeClientStub();
  stripeClient.paymentIntents.pi_1 = {
    id: 'pi_1',
    status: 'succeeded',
    latest_charge: {
      id: 'ch_1',
      amount_refunded: 1500,
    },
  } as any;
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
    status: 'paid',
    paymentStatus: 'paid',
    amount: 3000,
    paidAmount: 3000,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  prisma.payments.push({
    id: 'pay_1',
    userId: 'user_1',
    communityId: 'com_1',
    eventId: 'event_1',
    registrationId: 'reg_1',
    amount: 3000,
    platformFee: 0,
    currency: 'jpy',
    status: 'paid',
    method: 'stripe',
    chargeModel: 'platform_charge',
    stripePaymentIntentId: 'pi_1',
    refundedGrossTotal: 0,
    refundedPlatformFeeTotal: 0,
    reversedMerchantTotal: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await paymentsService.diagnoseStripePayment('pay_1');

  const payment = prisma.payments.find((p) => p.id === 'pay_1')!;
  assert.equal(payment.status, 'partial_refunded');
  assert.equal(payment.refundedGrossTotal, 1500);

  const registration = prisma.registrations.find((r) => r.id === 'reg_1')!;
  assert.equal(registration.paymentStatus, 'refunded');
  assert.equal(registration.status, 'refunded');
  assert.equal(registration.paidAmount, 1500);
});

