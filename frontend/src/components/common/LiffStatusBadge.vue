<template>
  <Teleport to="body">
    <div v-if="shouldShow" class="liff-badge" role="status" aria-live="polite">
      <div class="liff-badge__row">
        <span class="liff-badge__label">isLineBrowser</span>
        <span class="liff-badge__value">{{ lineBrowser }}</span>
      </div>
      <div class="liff-badge__row">
        <span class="liff-badge__label">isLiffClient</span>
        <span class="liff-badge__value">{{ liffClient }}</span>
      </div>
      <div class="liff-badge__row">
        <span class="liff-badge__label">isLiffReady</span>
        <span class="liff-badge__value">{{ liffReady }}</span>
      </div>
      <div class="liff-badge__row">
        <span class="liff-badge__label">route</span>
        <span class="liff-badge__value">{{ route.fullPath }}</span>
      </div>
      <div class="liff-badge__row">
        <span class="liff-badge__label">API_BASE_URL</span>
        <span class="liff-badge__value">{{ apiBaseUrl }}</span>
      </div>
      <div class="liff-badge__row">
        <span class="liff-badge__label">LIFF_ID</span>
        <span class="liff-badge__value">{{ liffId }}</span>
      </div>
      <button type="button" class="liff-badge__copy" @click="copyDiagnostics">コピー</button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { API_BASE_URL, LIFF_ID } from '../../config';
import { isLineBrowser, isLiffClient } from '../../utils/device';
import { isLiffReady } from '../../utils/liff';
import { useAuth } from '../../composables/useAuth';

const route = useRoute();
const { user } = useAuth();

const lineBrowser = computed(() => isLineBrowser());
const liffClient = computed(() => isLiffClient());
const liffReady = computed(() => isLiffReady.value);
const apiBaseUrl = API_BASE_URL;
const liffId = LIFF_ID || 'missing';

const debugParam = computed(() => {
  const val = route.query.debug;
  if (Array.isArray(val)) return val.includes('1') || val.includes('true');
  return val === '1' || val === 'true';
});

const shouldShow = computed(() => {
  if (import.meta.env.PROD && !debugParam.value && !user.value?.isAdmin) return false;
  return debugParam.value || Boolean(user.value?.isAdmin);
});

async function copyDiagnostics() {
  const text = [
    `isLineBrowser: ${lineBrowser.value}`,
    `isLiffClient: ${liffClient.value}`,
    `isLiffReady: ${liffReady.value}`,
    `route: ${route.fullPath}`,
    `API_BASE_URL: ${apiBaseUrl}`,
    `LIFF_ID: ${liffId}`,
  ].join('\n');
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  } catch (error) {
    console.warn('Failed to copy diagnostics', error);
  }
}
</script>

<style scoped>
.liff-badge {
  position: fixed;
  right: 12px;
  bottom: 12px;
  min-width: 220px;
  max-width: 320px;
  padding: 10px 12px;
  background: rgba(15, 23, 42, 0.9);
  color: #f8fafc;
  border-radius: 10px;
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.35);
  font-size: 12px;
  line-height: 1.4;
  z-index: 1400;
  pointer-events: auto;
}

.liff-badge__row {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.liff-badge__label {
  color: #cbd5e1;
  min-width: 94px;
  font-weight: 600;
}

.liff-badge__value {
  color: #e2e8f0;
  word-break: break-all;
}

.liff-badge__copy {
  margin-top: 8px;
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.6);
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
}
</style>
