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
  const isDevLike = !envLabel || ['development', 'dev', 'local'].includes(envLabel);
  const isLive = ['production', 'prod', 'live'].includes(envLabel);
  const isUat = envLabel === 'uat' || envLabel === 'staging';
  const isTestLike = !isLive && !isDevLike;
  const apiVersionRaw = (process.env.STRIPE_API_VERSION || '').trim();
  const apiVersion = apiVersionRaw || null;
  const secretKey = isLive
    ? process.env.STRIPE_SECRET_KEY_LIVE || null
    : isTestLike
      ? process.env.STRIPE_SECRET_KEY_TEST || null
      : process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_TEST || null;
  const publishableKey = isLive
    ? process.env.STRIPE_PUBLISHABLE_KEY_LIVE || null
    : isTestLike
      ? process.env.STRIPE_PUBLISHABLE_KEY_TEST || null
      : process.env.STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY_TEST || null;
  const webhookSecret = isLive
    ? process.env.STRIPE_WEBHOOK_SECRET_LIVE || null
    : isTestLike
      ? process.env.STRIPE_WEBHOOK_SECRET_TEST || null
      : process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET_TEST || null;
  const frontendBaseUrlRaw = isLive
    ? process.env.FRONTEND_BASE_URL_LIVE || process.env.FRONTEND_BASE_URL || null
    : isTestLike
      ? process.env.FRONTEND_BASE_URL_UAT || process.env.FRONTEND_BASE_URL || null
      : process.env.FRONTEND_BASE_URL || 'http://localhost:5173';

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
