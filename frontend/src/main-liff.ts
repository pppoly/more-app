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
import { APP_TARGET } from './config';
import { bootstrapLiff, isLiffReady } from './utils/liff';
import { trackEvent } from './utils/analytics';

// Kick off LIFF init in the background; never await so first paint is not blocked.
if (APP_TARGET === 'liff') {
  bootstrapLiff();
  trackEvent('liff_open');
}

// Handle LIFF deep link (?to=/path) without blocking initial render.
if (typeof window !== 'undefined') {
  void router.isReady().then(() => {
    const search = new URLSearchParams(window.location.search);
    const to = search.get('to');
    if (!to || !to.startsWith('/')) return;
    const target = router.resolve(to);
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
