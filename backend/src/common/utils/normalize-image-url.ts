import { buildAssetUrl } from '../storage/asset-path';

export function normalizeImageUrl(
  value: string | null | undefined,
  baseUrl?: string,
): string | null | undefined {
  if (value === null || value === undefined) return value;

  const normalizedValue = value.trim();
  if (!normalizedValue) return value;

  if (normalizedValue.startsWith('http://') || normalizedValue.startsWith('https://')) {
    return normalizedValue;
  }

  const resolved = buildAssetUrl(normalizedValue);
  if (resolved && /^https?:\/\//i.test(resolved)) {
    return resolved;
  }

  const origin = (baseUrl || '').trim().replace(/\/$/, '');
  if (resolved && resolved.startsWith('/')) {
    return origin ? origin + resolved : resolved;
  }

  if (normalizedValue.startsWith('/uploads/')) {
    return origin + normalizedValue;
  }

  return origin + '/uploads/' + normalizedValue.replace(/^\/+/, '');
}
