<template>
  <div class="ticket-scanner-page">
    <ConsoleTopBar v-if="!isLiffClientMode" title="チケットスキャン" @back="goBack" />

    <header class="page-head">
      <div>
        <h1>受付・チェックイン</h1>
        <p>QR をかざすだけで受付できます。カメラ許可が必要です。</p>
      </div>
      <button class="info-btn" type="button" @click="showInfo = true">
        <span class="i-lucide-info"></span>
      </button>
    </header>

    <section class="scanner-box">
      <div class="viewfinder" :class="{ 'viewfinder--active': isScanning }">
        <video ref="videoEl" playsinline muted />
        <div class="frame">
          <span class="corner tl"></span>
          <span class="corner tr"></span>
          <span class="corner bl"></span>
          <span class="corner br"></span>
        </div>
        <div class="center-hint">
          <p v-if="state === 'idle'">『スキャン開始』を押してください</p>
          <p v-else-if="state === 'scanning'">枠内に QR を合わせてください</p>
          <p v-else-if="state === 'submitting'">確認中…</p>
        </div>
      </div>

      <div v-if="state === 'result'" class="result-card" :class="result?.kind === 'success' ? 'success' : 'error'">
        <div class="result-icon">{{ result?.kind === 'success' ? '✅' : '❌' }}</div>
        <div class="result-body">
          <p class="result-title">
            {{ result?.kind === 'success' ? 'チェックイン完了' : '検証に失敗しました' }}
          </p>
          <p class="result-desc">
            {{ result?.kind === 'success' ? result?.message : result?.message || '無効なQRコードです' }}
          </p>
        </div>
      </div>

      <div v-if="state !== 'result'" class="hint-text" role="status">{{ hintText }}</div>

      <div class="actions">
        <button class="primary" type="button" :disabled="state === 'submitting'" @click="handlePrimary">
          {{ primaryLabel }}
        </button>
        <button v-if="allowImageScan" class="link" type="button" @click="openCapture">写真から読み取る</button>
      </div>

      <input
        v-if="allowImageScan"
        ref="captureInput"
        type="file"
        accept="image/*"
        capture="environment"
        class="hidden-input"
        @change="handleCapture"
      />
    </section>

    <dialog v-if="showInfo" class="info-dialog">
      <div class="info-card">
        <p class="info-title">スキャンの流れ</p>
        <ol>
          <li>『スキャン開始』でカメラを起動</li>
          <li>QR を枠内に合わせると自動で判定</li>
          <li>結果を確認して次へ</li>
        </ol>
        <button type="button" class="primary ghost" @click="showInfo = false">閉じる</button>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { nextTick, onMounted, onUnmounted, ref, computed } from 'vue';
import { checkinRegistration } from '../../../api/client';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';
import { useRouter, useRoute } from 'vue-router';
import { isLiffClient } from '../../../utils/device';

type ScanState = 'idle' | 'scanning' | 'submitting' | 'result';
type Result =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

const router = useRouter();
const route = useRoute();
const isLiffClientMode = computed(() => isLiffClient());
const videoEl = ref<HTMLVideoElement | null>(null);
const captureInput = ref<HTMLInputElement | null>(null);
const state = ref<ScanState>('idle');
const result = ref<Result | null>(null);
const showInfo = ref(false);
const allowImageScan = computed(() => route.query.photo === '1'); // feature flag（デフォルトOFF）

let readerInstance: BrowserMultiFormatReader | null = null;
let controls: IScannerControls | null = null;
let lastPayload = '';
let lastPayloadAt = 0;
let stopping = false;
let submitTimer: number | null = null;
const SUBMIT_TIMEOUT_MS = 8000;

const isScanning = computed(() => state.value === 'scanning');
const primaryLabel = computed(() => {
  if (state.value === 'scanning') return 'スキャン中…';
  if (state.value === 'submitting') return '確認中…';
  if (state.value === 'result') return result.value?.kind === 'success' ? '次をスキャン' : 'もう一度';
  return 'スキャン開始';
});

const hintText = computed(() => {
  if (state.value === 'submitting') return '読み取り内容を確認しています…';
  if (state.value === 'scanning') return '枠内に QR を合わせると自動で判定します';
  return 'QR をかざしてチェックインできます';
});

const goBack = () => {
  router.back();
};

const resetResult = () => {
  result.value = null;
};

const startScan = async () => {
  resetResult();
  if (state.value === 'scanning' || state.value === 'submitting') return;
  state.value = 'scanning';
  try {
    if (!readerInstance) {
      readerInstance = new BrowserMultiFormatReader();
    }
    await nextTick();
    controls = await readerInstance.decodeFromVideoDevice(
      undefined,
      videoEl.value as HTMLVideoElement,
      (scanResult, err) => {
        if (state.value !== 'scanning') return;
        if (scanResult) {
          onPayload(scanResult.getText());
        } else if (err && !(err as any).message?.includes('No MultiFormat Readers')) {
          // ignore noisy errors
        }
      },
    );
  } catch {
    state.value = 'result';
    result.value = { kind: 'error', message: 'カメラを開けませんでした。権限を確認してください。' };
    await stopScan();
  }
};

const stopScan = async () => {
  if (stopping) return;
  stopping = true;
  if (controls) {
    await controls.stop();
    controls = null;
  }
  if (readerInstance) {
    readerInstance.reset();
  }
  stopping = false;
};

const onPayload = async (raw: string) => {
  const now = Date.now();
  if (raw === lastPayload && now - lastPayloadAt < 2000) return; // debounce duplicate within 2s
  lastPayload = raw;
  lastPayloadAt = now;

  state.value = 'submitting';
  await stopScan();

  const parsed = parsePayload(raw);
  if (!parsed) {
    state.value = 'result';
    result.value = { kind: 'error', message: '無効なQRコードです' };
    return;
  }

  const clearSubmitTimer = () => {
    if (submitTimer) {
      window.clearTimeout(submitTimer);
      submitTimer = null;
    }
  };

  submitTimer = window.setTimeout(() => {
    if (state.value === 'submitting') {
      state.value = 'result';
      result.value = { kind: 'error', message: '確認に時間がかかっています。再スキャンしてください。' };
    }
  }, SUBMIT_TIMEOUT_MS);

  try {
    await checkinRegistration(parsed.eventId, parsed.registrationId);
    state.value = 'result';
    result.value = {
      kind: 'success',
      message: `${parsed.displayId} のチェックインが完了しました`,
    };
  } catch (err) {
    state.value = 'result';
    result.value = {
      kind: 'error',
      message: err instanceof Error ? err.message : '検証に失敗しました',
    };
  } finally {
    clearSubmitTimer();
  }
};

const parsePayload = (raw: string) => {
  try {
    // Prefer JSON payload
    const payload = JSON.parse(raw);
    if (payload?.eventId && payload?.registrationId) {
      return {
        eventId: String(payload.eventId),
        registrationId: String(payload.registrationId),
        displayId: String(payload.registrationId).slice(0, 8).toUpperCase(),
      };
    }
  } catch {
    // Not JSON, try URL with query params
    try {
      const url = new URL(raw);
      const eventId = url.searchParams.get('eventId');
      const registrationId = url.searchParams.get('registrationId');
      if (eventId && registrationId) {
        return {
          eventId,
          registrationId,
          displayId: registrationId.slice(0, 8).toUpperCase(),
        };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
};

const handlePrimary = async () => {
  if (state.value === 'result') {
    await startScan();
    return;
  }
  if (state.value === 'scanning') return;
  await startScan();
};

const openCapture = () => {
  captureInput.value?.click();
};

const handleCapture = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const readerFile = new FileReader();
  readerFile.onload = async () => {
    const img = new Image();
    img.onload = async () => {
      if (!readerInstance) {
        readerInstance = new BrowserMultiFormatReader();
      }
      try {
        const res = await readerInstance.decodeFromImageElement(img);
        await onPayload(res.getText());
      } catch {
        state.value = 'result';
        result.value = { kind: 'error', message: '写真からQRを判定できませんでした' };
      } finally {
        input.value = '';
      }
    };
    img.src = readerFile.result as string;
  };
  readerFile.onerror = () => {
    input.value = '';
    state.value = 'result';
    result.value = { kind: 'error', message: '写真の読み込みに失敗しました' };
  };
  readerFile.readAsDataURL(file);
};

onMounted(() => {
  state.value = 'idle';
});

onUnmounted(() => {
  stopScan();
});
</script>

<style scoped>
.ticket-scanner-page {
  min-height: 100vh;
  background: #f7f8fb;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.page-head h1 {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
}

.page-head p {
  margin: 0;
  font-size: 13px;
  color: #475569;
  line-height: 1.4;
}

.info-btn {
  border: none;
  background: #e2e8f0;
  color: #0f172a;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: grid;
  place-items: center;
}

.scanner-box {
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.viewfinder {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  background: #0f172a;
  min-height: 280px;
}

.viewfinder video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  filter: brightness(0.9);
}

.frame {
  position: absolute;
  inset: 12px;
  pointer-events: none;
}

.corner {
  position: absolute;
  width: 36px;
  height: 36px;
  border: 3px solid #38bdf8;
}

.corner.tl {
  top: 0;
  left: 0;
  border-right: none;
  border-bottom: none;
}

.corner.tr {
  top: 0;
  right: 0;
  border-left: none;
  border-bottom: none;
}

.corner.bl {
  bottom: 0;
  left: 0;
  border-right: none;
  border-top: none;
}

.corner.br {
  bottom: 0;
  right: 0;
  border-left: none;
  border-top: none;
}

.center-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #e2e8f0;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  font-weight: 600;
}

.result-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.result-card.success {
  border-color: #22c55e;
}

.result-card.error {
  border-color: #ef4444;
}

.result-icon {
  font-size: 22px;
}

.result-title {
  margin: 0 0 4px;
  font-weight: 700;
  color: #0f172a;
}

.result-desc {
  margin: 0;
  color: #475569;
  font-size: 14px;
  line-height: 1.4;
}

.hint-text {
  margin: 0;
  color: #475569;
  font-size: 13px;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.primary {
  border: none;
  border-radius: 14px;
  background: linear-gradient(90deg, #22c55e, #16a34a);
  color: #fff;
  padding: 14px;
  font-size: 16px;
  font-weight: 700;
}

.primary:disabled {
  opacity: 0.6;
}

.primary.ghost {
  background: #e2e8f0;
  color: #0f172a;
}

.link {
  border: none;
  background: transparent;
  color: #0ea5e9;
  font-weight: 600;
  padding: 0;
  align-self: flex-start;
}

.hidden-input {
  display: none;
}

.info-dialog {
  border: none;
  background: transparent;
  width: 100%;
}

.info-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  max-width: 360px;
  margin: 0 auto;
}

.info-title {
  margin: 0 0 8px;
  font-weight: 700;
  color: #0f172a;
}

.info-card ol {
  margin: 0 0 12px 18px;
  color: #475569;
  font-size: 14px;
  line-height: 1.4;
}
</style>
