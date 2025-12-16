import liff from '@line/liff';
import { ref } from 'vue';
import { trackEvent } from './analytics';

const LIFF_ID = '2008600730-qxlPrj5Q';
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

export function bootstrapLiff(): void {
  if (initStarted || !hasWindow()) return;
  initStarted = true;

  const timeoutId = window.setTimeout(() => finalize(false, 'timeout'), LIFF_INIT_TIMEOUT_MS);

  // Fire-and-forget: do not await, do not block rendering.
  void liff
    .init({ liffId: LIFF_ID })
    .then(() => finalize(true))
    .catch((error) => {
      console.warn('LIFF init failed; continuing without LIFF.', error);
      finalize(false, 'init-error');
    })
    .finally(() => window.clearTimeout(timeoutId));
}

export async function loadLiff(liffId?: string): Promise<typeof liff> {
  if (liffId && liffId !== LIFF_ID) {
    console.warn(`[liff] Ignoring provided LIFF ID ${liffId}; using configured ${LIFF_ID}.`);
  }
  if (!hasWindow()) {
    throw new Error('LIFF is only available in browser');
  }
  if (!initStarted) {
    bootstrapLiff();
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
