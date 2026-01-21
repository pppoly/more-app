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

  const origin = (baseUrl || '').trim().replace(/\/$/, '');
  if (normalizedValue.startsWith('/uploads/')) {
    return origin + normalizedValue;
  }

  return origin + '/uploads/' + normalizedValue.replace(/^\/+/, '');
}
