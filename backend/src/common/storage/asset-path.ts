import { join } from 'path';
import { UPLOAD_ROOT } from './upload-root';

const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, '');
const uploadHttpPrefix = trimSlashes(process.env.UPLOADS_HTTP_PREFIX || 'uploads');
const assetBaseUrl = trimSlashes(process.env.ASSET_BASE_URL || '');

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

/**
 * Normalize a raw image value (key or URL) to an asset key (no leading slash, no domain).
 * Returns null for empty values or external URLs that are not under ASSET_BASE_URL/UPLOAD prefix.
 */
export function toAssetKey(raw?: string | null): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (!value) return null;

  if (isHttpUrl(value)) {
    if (assetBaseUrl && value.startsWith(`${assetBaseUrl}/`)) {
      value = value.slice(assetBaseUrl.length + 1);
    } else {
      return null; // external URL, not an OSS key we control
    }
  }

  value = value.replace(/^\/+/, '');
  if (value.startsWith(`${uploadHttpPrefix}/`)) {
    value = value.slice(uploadHttpPrefix.length + 1);
  }

  const cleaned = trimSlashes(value);
  return cleaned || null;
}

/**
 * Convert an asset key (or compatible URL) to a local disk path under UPLOAD_ROOT.
 */
export function assetKeyToDiskPath(raw?: string | null): string | null {
  const key = toAssetKey(raw);
  if (!key) return null;
  return join(UPLOAD_ROOT, key);
}

/**
 * Build a public URL for an asset key. Falls back to /uploads when ASSET_BASE_URL is not set.
 */
export function buildAssetUrl(raw?: string | null, opts?: { transform?: string }): string | null {
  if (!raw) return null;
  if (isHttpUrl(raw) && (!assetBaseUrl || !raw.startsWith(`${assetBaseUrl}/`))) {
    return raw; // already a full URL we don't manage
  }

  const key = toAssetKey(raw);
  if (!key) return null;

  const base = assetBaseUrl
    ? assetBaseUrl.startsWith('http')
      ? assetBaseUrl.replace(/\/+$/, '')
      : `/${assetBaseUrl}`
    : `/${uploadHttpPrefix}`;
  const url = `${base.replace(/\/+$/, '')}/${key}`;
  const query = opts?.transform?.trim();
  if (query) {
    return `${url}${url.includes('?') ? '&' : '?'}${query}`;
  }
  return url;
}
