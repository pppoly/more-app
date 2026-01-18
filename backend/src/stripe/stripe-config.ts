export type StripeEnvConfig = {
  envLabel: string;
  isLive: boolean;
  isUat: boolean;
  apiVersion: string | null;
  secretKey: string | null;
  publishableKey: string | null;
  webhookSecret: string | null;
  frontendBaseUrlRaw: string | null;
};

const normalizeEnvLabel = () => (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();

export const resolveStripeEnv = (): StripeEnvConfig => {
  const envLabel = normalizeEnvLabel();
  const isLive = ['production', 'prod', 'live'].includes(envLabel);
  const isUat = envLabel === 'uat' || envLabel === 'staging';
  const apiVersionRaw = (process.env.STRIPE_API_VERSION || '').trim();
  const apiVersion = apiVersionRaw || null;
  const secretKey = isLive
    ? process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY || null
    : process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY || null;
  const publishableKey = isLive
    ? process.env.STRIPE_PUBLISHABLE_KEY_LIVE || process.env.STRIPE_PUBLISHABLE_KEY || null
    : process.env.STRIPE_PUBLISHABLE_KEY_TEST || process.env.STRIPE_PUBLISHABLE_KEY || null;
  const webhookSecret = isLive
    ? process.env.STRIPE_WEBHOOK_SECRET_LIVE || process.env.STRIPE_WEBHOOK_SECRET || null
    : process.env.STRIPE_WEBHOOK_SECRET_TEST || process.env.STRIPE_WEBHOOK_SECRET || null;
  const frontendBaseUrlRaw = isLive ? process.env.FRONTEND_BASE_URL_LIVE : process.env.FRONTEND_BASE_URL_UAT;

  return {
    envLabel,
    isLive,
    isUat,
    apiVersion,
    secretKey,
    publishableKey,
    webhookSecret,
    frontendBaseUrlRaw: frontendBaseUrlRaw || null,
  };
};
