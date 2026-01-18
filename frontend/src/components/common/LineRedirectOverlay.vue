<template>
  <div class="line-redirect">
    <div class="line-redirect__backdrop"></div>
    <div class="line-redirect__card">
      <p class="line-redirect__title">創翔モアは LINEアプリ内のミニアプリとしてご利用ください</p>
      <div class="line-redirect__actions">
        <button type="button" class="primary" @click="openLiff">LINEで開く</button>
        <button
          v-if="allowWebContinue"
          type="button"
          class="secondary"
          @click="$emit('continue-web')"
        >
          このままWebで見る
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { buildLiffUrl } from '../../utils/liff';

const props = withDefaults(
  defineProps<{
    allowWebContinue?: boolean;
  }>(),
  {
    allowWebContinue: true,
  },
);

function openLiff() {
  if (typeof window === 'undefined') return;
  const current = window.location.pathname + window.location.search;
  const url = buildLiffUrl(current);
  if (!url) {
    console.error('LIFF_ID is not configured; cannot open in LINE.');
    return;
  }
  window.location.href = url;
}
</script>

<style scoped>
.line-redirect {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1600;
  padding: 20px;
}

.line-redirect__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(2px);
}

.line-redirect__card {
  position: relative;
  width: min(480px, 100%);
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.08);
  padding: 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.line-redirect__title {
  margin: 0;
  font-size: 16px;
  color: #0f172a;
  line-height: 1.5;
}

.line-redirect__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

button {
  border: none;
  border-radius: 10px;
  padding: 12px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.primary {
  background: #00c300;
  color: #0b1b03;
}

.secondary {
  background: #f8fafc;
  color: #0f172a;
  border: 1px solid #e2e8f0;
}
</style>
