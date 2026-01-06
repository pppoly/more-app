import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMerchantNet, computeProportionalAmount } from '../src/payments/settlement.utils';

test('computeMerchantNet subtracts platform + Stripe fee', () => {
  assert.equal(computeMerchantNet(10000, 500, 400), 9100);
});

test('partial refund uses proportional platform fee and merchant reversal', () => {
  const gross = 10000;
  const platformFee = 500;
  const stripeFee = 400;
  const merchantNet = computeMerchantNet(gross, platformFee, stripeFee);
  const refundAmount = 3000;
  const refundPlatformFee = computeProportionalAmount(platformFee, refundAmount, gross);
  const reverseMerchant = computeProportionalAmount(merchantNet, refundAmount, gross);
  assert.equal(refundPlatformFee, 150);
  assert.equal(reverseMerchant, 2730);
});

test('rounding stays within gross for small amounts', () => {
  const gross = 101;
  const platformFee = 5;
  const merchantNet = computeMerchantNet(gross, platformFee, 1);
  const refundAmount = 1;
  const refundPlatformFee = computeProportionalAmount(platformFee, refundAmount, gross);
  const reverseMerchant = computeProportionalAmount(merchantNet, refundAmount, gross);
  assert.ok(refundPlatformFee >= 0 && refundPlatformFee <= platformFee);
  assert.ok(reverseMerchant >= 0 && reverseMerchant <= merchantNet);
});
