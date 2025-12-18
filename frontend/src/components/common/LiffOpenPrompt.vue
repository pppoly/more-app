<template>
  <Teleport to="body">
    <div v-if="visible" class="liff-prompt">
      <div class="liff-prompt__text">LINEアプリで開くと、より便利にご利用いただけます</div>
      <div class="liff-prompt__actions">
        <button type="button" class="liff-prompt__open" @click="openInLine">LINEで開く</button>
        <button type="button" class="liff-prompt__close" aria-label="閉じる" @click="dismiss">×</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { isLiffClient, isLineBrowser } from '../../utils/device';

const LIFF_LAUNCH_URL = 'https://liff.line.me/2008600730-qxlPrj5Q';
const STORAGE_KEY = 'liff-open-prompt-dismissed';

const visible = ref(false);

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

const shouldShow = () => {
  if (!hasWindow()) return false;
  const dismissed = window.localStorage?.getItem(STORAGE_KEY) === '1';
  const onTargetHost = window.location.hostname === 'test.socialmore.jp';
  // 在 LINE 内部（Line Browser/LIFF）时不再提示“在 LINE 里打开”
  if (isLineBrowser() || isLiffClient()) return false;
  return onTargetHost && !dismissed;
};

function openInLine() {
  if (!hasWindow()) return;
  const current = window.location.pathname + window.location.search;
  window.location.href = `${LIFF_LAUNCH_URL}?to=${encodeURIComponent(current)}`;
}

function dismiss() {
  if (hasWindow()) {
    window.localStorage?.setItem(STORAGE_KEY, '1');
  }
  visible.value = false;
}

onMounted(() => {
  visible.value = shouldShow();
});
</script>

<style scoped>
.liff-prompt {
  position: fixed;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  width: calc(100% - 24px);
  max-width: 460px;
  padding: 12px 14px;
  background: #0f172a;
  color: #f8fafc;
  border-radius: 14px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.25);
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 1200;
}

.liff-prompt__text {
  flex: 1;
  font-size: 14px;
  line-height: 1.4;
}

.liff-prompt__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.liff-prompt__open {
  border: none;
  background: #00c300;
  color: #0b1b03;
  font-weight: 700;
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
}

.liff-prompt__close {
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  line-height: 1;
  font-weight: 700;
}
</style>
