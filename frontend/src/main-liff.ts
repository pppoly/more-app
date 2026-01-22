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
import router from './router/liff';
import './assets/main.css';
import { i18n } from './i18n';
import { isProductionLiff } from './config';
import { bootstrapLiff, buildLiffUrl, isLiffReady } from './utils/liff';
import { trackEvent } from './utils/analytics';
import { isLineBrowser, isLiffClient } from './utils/device';

const ALLOW_WEB_IN_LINE_KEY = 'allowWebInLine';

function shouldAutoOpenMiniApp(): string | null {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  if (host.includes('miniapp.line.me') || host.includes('liff.line.me')) return null;
  if (!isLineBrowser()) return null;
  if (isLiffClient()) return null;
  const params = new URLSearchParams(window.location.search);
  const hasDeepLink = params.has('to') || params.has('liff.state');
  if (!hasDeepLink) return null;
  const continueWeb = (params.get('continueWeb') || '').toLowerCase();
  if (continueWeb === '1' || continueWeb === 'true') return null;
  const allowWeb = window.sessionStorage.getItem(ALLOW_WEB_IN_LINE_KEY) === '1';
  if (allowWeb) return null;
  return buildLiffUrl(window.location.pathname + window.location.search);
}

// Auto-open share links inside LINE in-app browser (when this build is opened outside LIFF).
if (typeof window !== 'undefined') {
  const liffUrl = shouldAutoOpenMiniApp();
  if (liffUrl) {
    window.location.replace(liffUrl);
  }
}

// Kick off LIFF init in the background; never await so first paint is not blocked.
if (isProductionLiff()) {
  bootstrapLiff();
  trackEvent('liff_open');
}

// Handle LIFF deep link (?to=/path) without blocking initial render.
if (typeof window !== 'undefined') {
  void router.isReady().then(() => {
    const search = new URLSearchParams(window.location.search);
    const to = search.get('to') || search.get('liff.state');
    if (!to || !to.startsWith('/')) return;
    let decoded = to;
    try {
      decoded = decodeURIComponent(to);
    } catch {
      decoded = to;
    }
    if (!decoded.startsWith('/')) return;
    const target = router.resolve(decoded);
    if (!target.matched.length) return;
    if (target.fullPath === router.currentRoute.value.fullPath) return;
    router.replace(target.fullPath).catch(() => undefined);
  });
}

const app = createApp(App);
app.use(router);
app.use(i18n);
app.provide('isLiffReady', isLiffReady);
app.mount('#app');
