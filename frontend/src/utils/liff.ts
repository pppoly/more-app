import liff from '@line/liff';
import { ref } from 'vue';
import { trackEvent } from './analytics';
import { LIFF_ID, requireLiffId } from '../config';
const LIFF_INIT_TIMEOUT_MS = 10_000;

const isLiffReady = ref(false);
const hasWindow = () => typeof window !== 'undefined';
const isLiffClientCapable = ref(false);

let initStarted = false;
let finalized = false;
let readyResolver: ((ready: boolean) => void) | null = null;

const readyPromise = new Promise<boolean>((resolve) => {
  readyResolver = resolve;
});

function finalize(ready: boolean, context?: string) {
  // Allow late success to upgrade from false -> true, but never downgrade a true state.
  if (finalized && isLiffReady.value && !ready) return;
  isLiffReady.value = ready;
  readyResolver?.(ready);
  if (ready) {
    finalized = true;
    trackEvent('liff_ready');
  }
  if (!ready && context) {
    console.warn(`LIFF init skipped (${context}); continuing as web page.`);
  }
}

const resolveLiffId = (liffId?: string, require = false) => {
  if (liffId && liffId.trim()) return liffId.trim();
  if (LIFF_ID) return LIFF_ID;
  if (!require) return '';
  return requireLiffId();
};

export function bootstrapLiff(liffId?: string): void {
  if (initStarted || !hasWindow()) return;
  initStarted = true;

  let resolvedId = '';
  try {
    resolvedId = resolveLiffId(liffId, true);
  } catch (error) {
    console.error('LIFF_ID is required to initialize LIFF.', error);
  }
  if (!resolvedId) {
    finalize(false, 'missing-id');
    return;
  }

  const timeoutId = window.setTimeout(() => finalize(false, 'timeout'), LIFF_INIT_TIMEOUT_MS);

  // Fire-and-forget: do not await, do not block rendering.
  void liff
    .init({ liffId: resolvedId })
    .then(() => finalize(true))
    .catch((error) => {
      console.warn('LIFF init failed; continuing without LIFF.', error);
      finalize(false, 'init-error');
    })
    .finally(() => window.clearTimeout(timeoutId));
}

export async function loadLiff(liffId?: string): Promise<typeof liff> {
  const resolvedId = resolveLiffId(liffId, true);
  if (!resolvedId) {
    throw new Error('LIFF_ID is not configured');
  }
  if (!hasWindow()) {
    throw new Error('LIFF is only available in browser');
  }
  if (!initStarted) {
    bootstrapLiff(resolvedId);
  }
  await readyPromise;
  try {
    isLiffClientCapable.value = !!(liff.isInClient && liff.isInClient());
  } catch {
    isLiffClientCapable.value = false;
  }
  return liff;
}

export const liffInstance = liff;
export { isLiffReady, isLiffClientCapable };

export const buildLiffUrl = (toPath?: string, liffId?: string) => {
  const resolvedId = resolveLiffId(liffId);
  if (!resolvedId) return null;
  const base = `https://miniapp.line.me/${resolvedId}`;
  if (!toPath) return base;
  let normalized = toPath.startsWith('/') ? toPath : `/${toPath}`;
  try {
    const parsed = new URL(normalized, 'https://example.local');
    const nestedTo = parsed.searchParams.get('to');
    if (
      nestedTo &&
      nestedTo.startsWith('/') &&
      (parsed.pathname === '/' || parsed.pathname === '/liff')
    ) {
      normalized = nestedTo;
    }
  } catch {
    // Keep original path when URL parsing fails.
  }
  return `${base}?to=${encodeURIComponent(normalized)}`;
};

export async function getLiffProfile(): Promise<{
  userId: string;
  displayName: string;
  pictureUrl: string | null | undefined;
} | null> {
  if (!isLiffReady.value) return null;
  try {
    if (!liffInstance?.isInClient || !liffInstance.isInClient()) return null;
    const profile = await liffInstance.getProfile();
    if (!profile) return null;
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
    };
  } catch (error) {
    console.warn('Failed to fetch LIFF profile; continuing without it.', error);
    return null;
  }
}

function logDevLiffState() {
  if (!import.meta.env.DEV) return;
  try {
    const inLiffClient = typeof liffInstance?.isInClient === 'function' ? liffInstance.isInClient() : false;
    // Avoid eager navigator access when not available.
    const inLineBrowser =
      typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
        ? navigator.userAgent.toLowerCase().includes(' line/')
        : false;
    // eslint-disable-next-line no-console
    console.info('[LIFF][dev]', {
      isLineBrowser: inLineBrowser,
      isLiffClient: inLiffClient,
      isLiffReady: isLiffReady.value,
      url: typeof window !== 'undefined' ? window.location.href : 'n/a',
    });
  } catch {
    // Do nothing in dev logging errors to keep it non-intrusive.
  }
}

logDevLiffState();

export const isLineInAppBrowser = () => {
  if (typeof navigator === 'undefined' || typeof navigator.userAgent !== 'string') return false;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('liff') || ua.includes('miniapp')) return true;
  // Match LINE token without catching words like "guideline".
  return /(^|\W)line(\/|\W|$)/.test(ua);
};
