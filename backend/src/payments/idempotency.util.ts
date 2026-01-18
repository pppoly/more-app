// Stable builder for idempotency keys across payment providers/actions.
// Keep the rule simple and deterministic to avoid duplicate ledger entries
// when the generation logic evolves.
export function buildIdempotencyKey(
  provider: string,
  action: string,
  providerObjectType: string,
  providerObjectId: string,
  amount?: number,
  currency?: string,
  ...extraParts: string[]
): string {
  const safe = (v: string | undefined) => (v && v.trim().length > 0 ? v.trim().toLowerCase() : 'unknown');
  const parts = [
    safe(provider),
    safe(action),
    safe(providerObjectType),
    safe(providerObjectId),
  ];
  if (currency && amount !== undefined) {
    parts.push(safe(currency), String(amount));
  } else if (amount !== undefined) {
    parts.push(String(amount));
  }
  for (const extra of extraParts) {
    parts.push(safe(extra));
  }
  return parts.join(':');
}
