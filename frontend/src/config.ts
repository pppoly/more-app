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
export const APP_TARGET = import.meta.env.VITE_APP_TARGET || 'web';
export const LINE_CHANNEL_ID = import.meta.env.VITE_LINE_CHANNEL_ID || '';
export const LIFF_ID = import.meta.env.VITE_LIFF_ID || '';
export const DEV_LOGIN_SECRET = import.meta.env.VITE_DEV_LOGIN_SECRET || '';
