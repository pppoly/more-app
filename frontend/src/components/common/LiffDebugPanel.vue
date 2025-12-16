<template>
  <div v-if="visible" class="liff-debug">
    <h3>LIFF Diagnostic</h3>
    <div class="row"><span>location.href</span><code>{{ data.locationHref }}</code></div>
    <div class="row"><span>document.referrer</span><code>{{ data.referrer }}</code></div>
    <div class="row"><span>navigator.userAgent</span><code>{{ data.userAgent }}</code></div>
    <div class="row"><span>hasWindowLiff</span><code>{{ data.hasWindowLiff }}</code></div>
    <div class="row"><span>importedLiffModule</span><code>{{ data.importedLiffModule }}</code></div>
    <div class="row"><span>liffIdUsed</span><code>{{ data.liffIdUsed }}</code></div>
    <div class="row"><span>initAttempted</span><code>{{ data.initAttempted }}</code></div>
    <div class="row"><span>initResult</span><code>{{ data.initResult }}</code></div>
    <div class="row" v-if="data.initError"><span>initError</span><code>{{ data.initError }}</code></div>
    <div class="row" v-if="data.initErrorRaw"><span>initErrorRaw</span><code>{{ data.initErrorRaw }}</code></div>
    <div class="row" v-if="data.initResult === 'success'"><span>isInClient</span><code>{{ data.isInClient }}</code></div>
    <div class="row" v-if="data.initResult === 'success'"><span>isLoggedIn</span><code>{{ data.isLoggedIn }}</code></div>
    <div class="row" v-if="data.os"><span>getOS</span><code>{{ data.os }}</code></div>
    <div class="row" v-if="data.lang"><span>getLanguage</span><code>{{ data.lang }}</code></div>
    <div class="row" v-if="data.ver"><span>getVersion</span><code>{{ data.ver }}</code></div>
    <div class="row" v-if="data.context"><span>getContext</span><code>{{ data.context }}</code></div>
    <div class="row" v-if="data.grantedScopes"><span>grantedScopes</span><code>{{ data.grantedScopes }}</code></div>
    <div class="row"><span>liffClientStatus</span><code>{{ data.liffClientStatus }}</code></div>
    <div class="row"><span>suggestion</span><code>{{ data.suggestion }}</code></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

const props = defineProps<{ visible: boolean }>();

type InitResult = 'pending' | 'success' | 'failed';
type ClientStatus = 'ready-in-client' | 'ready-not-in-client' | 'init-failed';

const data = ref({
  locationHref: '',
  referrer: '',
  userAgent: '',
  hasWindowLiff: false,
  importedLiffModule: false,
  liffIdUsed: '2008600730-qxlPrj5Q',
  initAttempted: false,
  initResult: 'pending' as InitResult,
  initError: '',
  initErrorRaw: '',
  isInClient: null as null | boolean,
  isLoggedIn: null as null | boolean,
  os: '',
  lang: '',
  ver: '',
  context: '',
  grantedScopes: '',
  liffClientStatus: 'init-failed' as ClientStatus,
  suggestion: '',
});

const safeString = (v: any) => {
  try {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

onMounted(async () => {
  if (!props.visible) return;
  data.value.locationHref = typeof window !== 'undefined' ? window.location.href : '';
  data.value.referrer = typeof document !== 'undefined' ? document.referrer : '';
  data.value.userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  data.value.hasWindowLiff = typeof window !== 'undefined' && typeof (window as any).liff !== 'undefined';

  let liffModule: any = null;
  try {
    const mod = await import('@line/liff');
    liffModule = mod?.default || mod;
    data.value.importedLiffModule = !!liffModule;
  } catch (err: any) {
    data.value.importedLiffModule = false;
    data.value.initResult = 'failed';
    data.value.initError = err?.message || 'import failed';
    data.value.initErrorRaw = safeString(err);
    data.value.liffClientStatus = 'init-failed';
    data.value.suggestion = 'init failed, check allowed domains / redirect';
    return;
  }

  data.value.initAttempted = true;
  try {
    await liffModule.init({ liffId: data.value.liffIdUsed });
    data.value.initResult = 'success';
    data.value.isInClient = liffModule.isInClient();
    data.value.isLoggedIn = liffModule.isLoggedIn();
    try {
      data.value.os = safeString(liffModule.getOS?.());
    } catch {}
    try {
      data.value.lang = safeString(liffModule.getLanguage?.());
    } catch {}
    try {
      data.value.ver = safeString(liffModule.getVersion?.());
    } catch {}
    try {
      data.value.context = safeString(liffModule.getContext?.());
    } catch {}
    try {
      if (liffModule.permission?.getGrantedAll) {
        data.value.grantedScopes = safeString(await liffModule.permission.getGrantedAll());
      }
    } catch {}

    data.value.liffClientStatus = data.value.isInClient ? 'ready-in-client' : 'ready-not-in-client';
    data.value.suggestion = data.value.isInClient
      ? ''
      : 'opened in external browser mode; inClient false is expected';
  } catch (err: any) {
    data.value.initResult = 'failed';
    data.value.initError = err?.message || 'init failed';
    data.value.initErrorRaw = safeString(err);
    data.value.liffClientStatus = 'init-failed';
    data.value.suggestion = 'init failed, check allowed domains / redirect';
  }
});
</script>

<style scoped>
.liff-debug {
  position: fixed;
  bottom: 12px;
  right: 12px;
  width: min(420px, 90vw);
  max-height: 70vh;
  overflow: auto;
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
  padding: 12px;
  border-radius: 12px;
  font-size: 12px;
  z-index: 1800;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
}
.liff-debug h3 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #f8fafc;
}
.row {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}
.row span {
  min-width: 140px;
  color: #cbd5e1;
}
code {
  color: #e2e8f0;
  word-break: break-all;
}
</style>
