/* URL trace (debug=1) must run before any other logic */
if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  const debugUrl = params.get('debug');
  const traceDebug = debugUrl === '1' || debugUrl === 'true';
  const debugBlockRedirect =
    (params.get('debugBlockRedirect') || '').toLowerCase() === '1' ||
    (params.get('debugBlockRedirect') || '').toLowerCase() === 'true';
  const trace: any = {
    initialURL: window.location.href,
    finalURL: window.location.href,
    didRedirect: false,
    debug: traceDebug,
    blockRedirect: debugBlockRedirect,
  };
  const setFinal = (url: any) => {
    trace.didRedirect = true;
    trace.finalURL = typeof url === 'string' ? url : String(url);
  };
  if (traceDebug) {
    const loc: any = window.location;
    const proto = Object.getPrototypeOf(loc);
    const hrefDesc = Object.getOwnPropertyDescriptor(proto, 'href');
    if (hrefDesc?.set) {
      Object.defineProperty(loc, 'href', {
        configurable: true,
        get: hrefDesc.get ? hrefDesc.get.bind(loc) : undefined,
        set: (url) => {
          setFinal(url);
          console.warn('[debug:url] location.href set', url);
          if (debugBlockRedirect) return;
          try {
            hrefDesc.set.call(loc, url);
          } catch {
            // Fallback: some environments disallow calling the original setter directly.
            try {
              window.location.assign(String(url));
            } catch {
              // ignore
            }
          }
        },
      });
    }
    const block = (fnName: 'assign' | 'replace') => {
      const original = loc[fnName]?.bind(loc);
      loc[fnName] = (url: any) => {
        setFinal(url);
        console.warn(`[debug:url] location.${fnName}`, url);
        if (debugBlockRedirect) return;
        return original?.(url);
      };
      return original;
    };
    block('assign');
    block('replace');
  }
  (window as any).__URL_TRACE = trace;
}

import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './assets/main.css';
import { i18n } from './i18n';
import { LIFF_ID } from './config';
import { buildLiffUrl, loadLiff, normalizeLiffStateToPath } from './utils/liff';
import { isLiffClient, isLineBrowser } from './utils/device';

const ALLOW_WEB_IN_LINE_KEY = 'allowWebInLine';
const LIFF_ENTRY_SESSION_KEY = 'liffEntry';
const SHARE_RETURN_TO_KEY = 'share:returnTo';
const SHARE_RETURN_AT_KEY = 'share:returnAt';
const SHARE_RETURN_TTL_MS = 60_000;
const INITIAL_DEEP_LINK_KEY = 'liff:initialDeepLink';

function markLiffEntry() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(LIFF_ENTRY_SESSION_KEY, '1');
  } catch {
    // ignore
  }
}

function hasLiffEntryFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(LIFF_ENTRY_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function captureInitialDeepLink(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('to') || params.get('liff.state');
  const normalized = normalizeLiffStateToPath(raw);
  if (!normalized) return null;
  try {
    window.sessionStorage.setItem(INITIAL_DEEP_LINK_KEY, normalized);
  } catch {
    // ignore
  }
  return normalized;
}

function consumeInitialDeepLink(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(INITIAL_DEEP_LINK_KEY) || '';
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
    window.sessionStorage.removeItem(INITIAL_DEEP_LINK_KEY);
    return raw;
  } catch {
    return null;
  }
}

function shouldAutoOpenMiniApp(): string | null {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  if (host.includes('miniapp.line.me') || host.includes('liff.line.me')) return null;
  if (!isLineBrowser()) return null;
  if (isLiffClient()) {
    markLiffEntry();
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const isLiffEntry =
    params.has('liff.state') ||
    params.has('liff.referrer') ||
    (typeof document !== 'undefined' &&
      (document.referrer.includes('liff.line.me') || document.referrer.includes('miniapp.line.me')));
  if (isLiffEntry) {
    markLiffEntry();
    return null;
  }
  const continueWeb = (params.get('continueWeb') || '').toLowerCase();
  if (continueWeb === '1' || continueWeb === 'true') return null;

  const current = window.location.pathname + window.location.search;
  const deepLinkRaw = params.get('to') || params.get('liff.state');
  const deepLinkPath = normalizeLiffStateToPath(deepLinkRaw);
  const from = (params.get('from') || '').toLowerCase();
  const src = (params.get('src') || '').toLowerCase();
  const isShareLink =
    from === 'line_share' ||
    src === 'line_share' ||
    current.includes('from=line_share') ||
    (deepLinkPath ? deepLinkPath.includes('from=line_share') : false);
  const hasDeepLink = Boolean(deepLinkPath);

  // Only auto-open when the URL indicates a deep link or a share link.
  if (!isShareLink && !hasDeepLink) return null;

  const attemptKey = `miniappAutoOpen:${current}`;
  const now = Date.now();
  try {
    const lastAttempt = Number(window.sessionStorage.getItem(attemptKey) || '0');
    if (Number.isFinite(lastAttempt) && now - lastAttempt < 5000) return null;
    window.sessionStorage.setItem(attemptKey, String(now));
  } catch {
    // ignore storage errors; best-effort only
  }
  if (!isShareLink) {
    const allowWeb = window.sessionStorage.getItem(ALLOW_WEB_IN_LINE_KEY) === '1';
    if (allowWeb) return null;
  }
  return buildLiffUrl(current);
}

async function bootstrapApp() {
  if (typeof window !== 'undefined') {
    // Capture deep link early because the LIFF SDK may rewrite the URL during init.
    captureInitialDeepLink();
    const liffUrl = shouldAutoOpenMiniApp();
    if (liffUrl) {
      window.location.href = liffUrl;
      return;
    }
  }

  // In LINE, the SDK may modify liff.* query params during init.
  // Per official docs, avoid app-driven URL changes until liff.init() resolves.
  if (typeof window !== 'undefined' && isLineBrowser() && LIFF_ID) {
    const params = new URLSearchParams(window.location.search);
    const hasLiffQuery = Array.from(params.keys()).some((key) => key.startsWith('liff.'));
    if (hasLiffQuery || hasLiffEntryFlag()) {
      try {
        await loadLiff(LIFF_ID);
      } catch {
        // Continue as a normal web page.
      }
    }
  }

  const app = createApp(App);
  app.use(router);
  app.use(i18n);

  await router.isReady();

  // Apply initial deep link after LIFF init. This ensures share links land on the intended page.
  const initialDeepLink = consumeInitialDeepLink();
  if (initialDeepLink) {
    try {
      const target = router.resolve(initialDeepLink);
      if (target.matched.length && target.fullPath !== router.currentRoute.value.fullPath) {
        await router.replace(target.fullPath);
      }
    } catch {
      // ignore navigation errors
    }
  }

  // Restore the previous route after returning from the LINE share UI (some WebViews reload to root).
  if (typeof window !== 'undefined') {
    try {
      // If a deep link was present, never override it with share-return restoration.
      const hasDeepLinkNow = Boolean(initialDeepLink);
      const returnTo = window.sessionStorage.getItem(SHARE_RETURN_TO_KEY) || '';
      const at = Number(window.sessionStorage.getItem(SHARE_RETURN_AT_KEY) || '0');
      if (!hasDeepLinkNow && returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
        if (Number.isFinite(at) && Date.now() - at <= SHARE_RETURN_TTL_MS) {
          const resolved = router.resolve(returnTo);
          if (resolved.matched.length && resolved.fullPath !== router.currentRoute.value.fullPath) {
            await router.replace(resolved.fullPath);
          }
        }
      }
    } catch {
      // ignore storage errors
    } finally {
      try {
        window.sessionStorage.removeItem(SHARE_RETURN_TO_KEY);
        window.sessionStorage.removeItem(SHARE_RETURN_AT_KEY);
      } catch {
        // ignore
      }
    }
  }

  app.mount('#app');
}

// Prevent pinch-zoom / double-tap zoom so mobile layouts stay fixed-scale.
let lastTouchEnd = 0;
const preventMultiTouch = (event: TouchEvent) => {
  if (event.touches.length > 1) {
    event.preventDefault();
  }
};

const preventDoubleTapZoom = (event: TouchEvent) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    event.preventDefault();
  }
  lastTouchEnd = now;
};

document.addEventListener('touchmove', preventMultiTouch, { passive: false });
document.addEventListener('touchend', preventDoubleTapZoom, false);
document.addEventListener(
  'gesturestart',
  (event) => {
    event.preventDefault();
  },
  false,
);

void bootstrapApp();
