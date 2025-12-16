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
