const resolveApiBaseUrl = () => {
  const envValue = import.meta.env.VITE_API_BASE_URL;
  if (import.meta.env.DEV) {
    return envValue || 'http://localhost:3000/api/v1';
  }
  if (!envValue) {
    throw new Error('VITE_API_BASE_URL must be defined outside of development.');
  }
  return envValue;
};

export const API_BASE_URL = resolveApiBaseUrl();
const inferredTarget = import.meta.env.MODE === 'liff' ? 'liff' : 'web';
export const APP_TARGET = import.meta.env.VITE_APP_TARGET || inferredTarget;
export const LINE_CHANNEL_ID = import.meta.env.VITE_LINE_CHANNEL_ID || '';
export const LIFF_ID = import.meta.env.VITE_LIFF_ID || '';
export const DEV_LOGIN_SECRET = import.meta.env.VITE_DEV_LOGIN_SECRET || '';

const parseNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const STRIPE_FEE_PERCENT = parseNumber(import.meta.env.VITE_STRIPE_FEE_PERCENT, 3.6);
export const STRIPE_FEE_FIXED_JPY = parseNumber(import.meta.env.VITE_STRIPE_FEE_FIXED_JPY, 0);
export const PLATFORM_FEE_WAIVED = !['0', 'false', 'off'].includes(
  (import.meta.env.VITE_PLATFORM_FEE_WAIVED ?? '1').toLowerCase(),
);
