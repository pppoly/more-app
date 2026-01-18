// Quick standalone Stripe onboarding link test.
// Uses STRIPE_SECRET_KEY from backend/.env. Run with: node stripe_onboarding_test.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Stripe = require('stripe');

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error('Missing STRIPE_SECRET_KEY in backend/.env');
  process.exit(1);
}

const apiVersion = process.env.STRIPE_API_VERSION || '2025-12-15.preview';
const stripe = new Stripe(secretKey, { apiVersion });

(async () => {
  try {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'JP',
      email: 'debug-owner@example.com',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    console.log('Created account:', account.id);

    // Localhost allowed over http for testing.
    const refreshUrl = 'http://localhost:5173/console/stripe-return';
    const returnUrl = 'http://localhost:5173/console/stripe-return';

    const link = await stripe.accountLinks.create({
      account: account.id,
      type: 'account_onboarding',
      refresh_url: refreshUrl,
      return_url: returnUrl,
    });

    console.log('Onboarding URL:', link.url);
  } catch (err) {
    console.log('Stripe error:');
    console.log('statusCode:', err.statusCode);
    console.log('type:', err.type);
    console.log('code:', err.code);
    console.log('message:', err.message);
    console.log('raw:', err.raw);
  }
})();
