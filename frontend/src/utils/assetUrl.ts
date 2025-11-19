import { API_BASE_URL } from '../config';

const getAssetOrigin = () => {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(API_BASE_URL, base);
    return parsed.origin;
  } catch {
    return '';
  }
};

const assetOrigin = getAssetOrigin();

export const resolveAssetUrl = (path?: string | null) => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return assetOrigin ? `${assetOrigin}${normalized}` : normalized;
};
