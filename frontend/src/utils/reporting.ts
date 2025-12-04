export type ReportingPayload = Record<string, unknown>;

/**
 * Minimal error reporting hook.
 * Replace console logging with Sentry/Datadog, etc. when available.
 */
export function reportError(scope: string, payload: ReportingPayload = {}) {
  // eslint-disable-next-line no-console
  console.warn(`[report] ${scope}`, payload);
}
