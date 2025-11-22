import { API_BASE_URL } from '../config';

const getAssetBase = () => {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(API_BASE_URL, base);
    const pathname = parsed.pathname.replace(/\/$/, '');
    return `${parsed.origin}${pathname}`;
  } catch {
    return '';
  }
};

const assetBase = getAssetBase();

export const resolveAssetUrl = (path?: string | null) => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return assetBase ? `${assetBase}${normalized}` : normalized;
};
