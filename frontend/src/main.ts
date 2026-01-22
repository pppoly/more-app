/* URL trace (debug=1) must run before any other logic */
if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  const debugUrl = params.get('debug');
  const traceDebug = debugUrl === '1' || debugUrl === 'true';
  const trace: any = {
    initialURL: window.location.href,
    finalURL: window.location.href,
    didRedirect: false,
    debug: traceDebug,
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
          console.warn('[debug:url] blocked location.href set', url);
          return;
        },
      });
    }
    const block = (fnName: 'assign' | 'replace') => {
      const original = loc[fnName]?.bind(loc);
      loc[fnName] = (url: any) => {
        setFinal(url);
        console.warn(`[debug:url] blocked location.${fnName}`, url);
        return;
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
import { buildLiffUrl, normalizeLiffStateToPath } from './utils/liff';
import { isLineBrowser, isLiffClient } from './utils/device';

const ALLOW_WEB_IN_LINE_KEY = 'allowWebInLine';

function shouldAutoOpenMiniApp(): string | null {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  if (host.includes('miniapp.line.me') || host.includes('liff.line.me')) return null;
  if (!isLineBrowser()) return null;
  if (isLiffClient()) return null;
  const params = new URLSearchParams(window.location.search);
  const deepLinkRaw = params.get('to') || params.get('liff.state');
  if (!deepLinkRaw) return null;
  let deepLinkDecoded = deepLinkRaw;
  try {
    deepLinkDecoded = decodeURIComponent(deepLinkRaw);
  } catch {
    deepLinkDecoded = deepLinkRaw;
  }
  const isShareLink = deepLinkDecoded.includes('from=line_share');
  const continueWeb = (params.get('continueWeb') || '').toLowerCase();
  if (continueWeb === '1' || continueWeb === 'true') return null;
  const attemptKey = `miniappAutoOpen:${window.location.pathname}${window.location.search}`;
  try {
    if (window.sessionStorage.getItem(attemptKey) === '1') return null;
    window.sessionStorage.setItem(attemptKey, '1');
  } catch {
    // ignore storage errors; best-effort only
  }
  if (!isShareLink) {
    const allowWeb = window.sessionStorage.getItem(ALLOW_WEB_IN_LINE_KEY) === '1';
    if (allowWeb) return null;
  }
  return buildLiffUrl(window.location.pathname + window.location.search);
}

// Auto-open share links inside LINE in-app browser.
if (typeof window !== 'undefined') {
  const liffUrl = shouldAutoOpenMiniApp();
  if (liffUrl) {
    window.location.href = liffUrl;
  }
}

// Handle LIFF deep link (?to=/path) for the web build as well.
if (typeof window !== 'undefined') {
  void router.isReady().then(() => {
    const search = new URLSearchParams(window.location.search);
    const raw = search.get('to') || search.get('liff.state');
    const normalized = normalizeLiffStateToPath(raw);
    if (!normalized) return;
    const target = router.resolve(normalized);
    if (!target.matched.length) return;
    if (target.fullPath === router.currentRoute.value.fullPath) return;
    router.replace(target.fullPath).catch(() => undefined);
  });
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

const app = createApp(App);

app.use(router);
app.use(i18n);
app.mount('#app');
