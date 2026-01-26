import liff from '@line/liff';
import { ref } from 'vue';
import { trackEvent } from './analytics';
import { FRONTEND_BASE_URL, LIFF_ID, requireLiffId } from '../config';
const LIFF_INIT_TIMEOUT_MS = 30_000;
const LIFF_READY_TIMEOUT_MS = 30_000;

const isLiffReady = ref(false);
const hasWindow = () => typeof window !== 'undefined';
const isLiffClientCapable = ref(false);

const resolveLiffId = (liffId?: string, require = false) => {
  if (liffId && liffId.trim()) return liffId.trim();
  if (LIFF_ID) return LIFF_ID;
  if (!require) return '';
  return requireLiffId();
};

type RawInitConfig = Parameters<typeof liff.init>[0];
type LiffInitConfig = Omit<RawInitConfig, 'liffId'> | undefined;

let initPromise: Promise<void> | null = null;
let initError: unknown = null;
let initLiffId: string | null = null;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: number | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (typeof timer === 'number') window.clearTimeout(timer);
  });
}

function startInit(resolvedId: string, initConfig?: LiffInitConfig): Promise<void> {
  if (!hasWindow()) {
    return Promise.reject(new Error('LIFF is only available in browser'));
  }
  if (initPromise) return initPromise;
  initLiffId = resolvedId;
  initError = null;
  const config: RawInitConfig = {
    ...(initConfig ?? {}),
    liffId: resolvedId,
  };
  initPromise = liff
    .init(config)
    .then(async () => {
      const ready = (liff as any)?.ready;
      if (ready && typeof ready.then === 'function') {
        await withTimeout(ready, LIFF_READY_TIMEOUT_MS, 'liff.ready');
      }
      isLiffReady.value = true;
      try {
        isLiffClientCapable.value = Boolean((liff as any)?.isInClient?.());
      } catch {
        isLiffClientCapable.value = false;
      }
      trackEvent('liff_ready');
    })
    .catch((error) => {
      initError = error;
      isLiffReady.value = false;
      isLiffClientCapable.value = false;
      initPromise = null;
      throw error;
    });
  return initPromise;
}

export function bootstrapLiff(liffId?: string, initConfig?: LiffInitConfig): void {
  let resolvedId = '';
  try {
    resolvedId = resolveLiffId(liffId, true);
  } catch (error) {
    console.error('LIFF_ID is required to initialize LIFF.', error);
  }
  if (!resolvedId) {
    isLiffReady.value = false;
    return;
  }
  if (initPromise) return;
  void startInit(resolvedId, initConfig).catch((error) => {
    console.warn('LIFF init failed; continuing without LIFF.', error);
  });
}

export async function loadLiff(liffId?: string, initConfig?: LiffInitConfig): Promise<typeof liff> {
  const resolvedId = resolveLiffId(liffId, true);
  if (!resolvedId) {
    throw new Error('LIFF_ID is not configured');
  }
  if (!hasWindow()) {
    throw new Error('LIFF is only available in browser');
  }
  if (!initPromise) {
    startInit(resolvedId, initConfig);
  } else if (initLiffId && initLiffId !== resolvedId) {
    console.warn(`LIFF already initialized with a different id (${initLiffId}); requested=${resolvedId}`);
  }
  try {
    await withTimeout(initPromise as Promise<void>, LIFF_INIT_TIMEOUT_MS, 'liff.init');
  } catch (error) {
    console.warn('LIFF init did not complete; continuing without LIFF.', initError ?? error);
    throw error instanceof Error ? error : new Error('LIFF init failed');
  }
  try {
    isLiffClientCapable.value = !!(liff.isInClient && liff.isInClient());
  } catch {
    isLiffClientCapable.value = false;
  }
  return liff;
}

export const liffInstance = liff;
export { isLiffReady, isLiffClientCapable };

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function looksLikeAbsoluteUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

export function normalizeLiffStateToPath(raw: string | null): string | null {
  if (!raw) return null;
  let decoded = safeDecode(raw).trim();
  if (!decoded) return null;
  if (decoded.startsWith('?')) {
    decoded = `/${decoded}`;
  } else if (!decoded.startsWith('/') && decoded.startsWith('to=')) {
    decoded = `/?${decoded}`;
  } else if (!decoded.startsWith('/') && !decoded.startsWith('//') && !looksLikeAbsoluteUrl(decoded)) {
    // Docs show liff.state can be a "raw path" like `path_A/?key=...#fragment` (no leading slash).
    decoded = `/${decoded}`;
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return null;
  try {
    const parsed = new URL(decoded, 'https://example.local');
    const nestedTo = parsed.searchParams.get('to');
    if (nestedTo && (parsed.pathname === '/' || parsed.pathname === '/liff')) {
      const normalizedNested = nestedTo.trim();
      if (!normalizedNested) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      if (looksLikeAbsoluteUrl(normalizedNested) || normalizedNested.startsWith('//')) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      const withLeadingSlash = normalizedNested.startsWith('/') ? normalizedNested : `/${normalizedNested}`;
      if (withLeadingSlash.startsWith('/') && !withLeadingSlash.startsWith('//')) {
        return withLeadingSlash;
      }
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return decoded;
  }
}

export const buildLiffUrl = (toPath?: string, liffId?: string) => {
  const resolvedId = resolveLiffId(liffId);
  if (!resolvedId) return null;
  const base = `https://miniapp.line.me/${resolvedId}`;
  if (!toPath) return base;
  const trimmed = toPath.trim();
  // Prevent accidentally embedding absolute URLs into the Mini App URL.
  if (looksLikeAbsoluteUrl(trimmed)) return base;
  const normalizedCandidate = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const normalized = normalizeLiffStateToPath(normalizedCandidate) || normalizedCandidate;
  if (!normalized.startsWith('/') || normalized.startsWith('//')) return base;
  // Permanent link:
  //   https://miniapp.line.me/{liffId} + (page URL - endpoint URL)
  // When the endpoint URL is `https://{host}` (no path), it becomes:
  //   https://miniapp.line.me/{liffId}{pathname}{search}{hash}
  return `${base}${normalized}`;
};

export const buildMiniAppPermanentLink = (
  pageUrl: string,
  liffId?: string,
  endpointUrl: string = FRONTEND_BASE_URL,
) => {
  const resolvedId = resolveLiffId(liffId);
  if (!resolvedId) return null;
  const base = `https://miniapp.line.me/${resolvedId}`;
  const trimmed = (pageUrl || '').trim();
  if (!trimmed) return base;
  let resolvedPath = '';
  try {
    const endpoint = endpointUrl ? new URL(endpointUrl) : null;
    const target = looksLikeAbsoluteUrl(trimmed)
      ? new URL(trimmed)
      : endpoint
        ? new URL(trimmed, endpoint)
        : new URL(trimmed, 'https://example.local');
    resolvedPath = `${target.pathname}${target.search}${target.hash}`;
    if (endpoint) {
      const endpointPath = endpoint.pathname.replace(/\/$/, '');
      if (endpointPath && endpointPath !== '/' && resolvedPath.startsWith(endpointPath)) {
        resolvedPath = resolvedPath.slice(endpointPath.length) || '/';
      }
    }
  } catch {
    resolvedPath = trimmed;
  }
  const normalized = resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`;
  if (normalized.startsWith('//')) return base;
  return `${base}${normalized}`;
};

export async function getLiffProfile(): Promise<{
  userId: string;
  displayName: string;
  pictureUrl: string | null | undefined;
} | null> {
  if (!isLiffReady.value) return null;
  try {
    if (!liffInstance?.isInClient || !liffInstance.isInClient()) return null;
    const permissionApi = (liffInstance as any)?.permission;
    if (permissionApi && typeof permissionApi.query === 'function') {
      const status = await permissionApi.query('profile').catch(() => null);
      if (!status || status.state !== 'granted') return null;
    } else {
      return null;
    }
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

async function requestAdditionalPermissions(scopes: string[]) {
  if (!scopes.length) return;
  if (typeof liff.permission?.requestAll !== 'function') return;
  try {
    for (const scope of scopes) {
      if (typeof liff.permission?.query !== 'function') break;
      const status = await liff.permission.query(scope);
      if (status?.state === 'prompt') {
        await liff.permission.requestAll();
        break;
      }
    }
  } catch (error) {
    console.warn('Failed to request LIFF permissions', error);
  }
}

export async function ensureLiffPermissions(scopes: string[]): Promise<void> {
  if (!scopes.length) return;
  try {
    await loadLiff();
  } catch {
    return;
  }
  await requestAdditionalPermissions(scopes);
}

export async function ensureLiffLoggedIn(scopes: string[] = []): Promise<typeof liff> {
  const instance = await loadLiff();
  const inClient = typeof (instance as any)?.isInClient === 'function' ? (instance as any).isInClient() : false;
  const loginAvailable = typeof instance.isLoggedIn === 'function';
  const loggedIn = loginAvailable ? instance.isLoggedIn() : false;
  // liff.login() isn't guaranteed inside the LIFF browser; prefer init-only there.
  if (!inClient && loginAvailable && !loggedIn && typeof instance.login === 'function') {
    instance.login();
  }
  await ensureLiffPermissions(scopes);
  return instance;
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
