<template>
  <div class="ticket-scanner-page">
    <header class="scanner-hero">
      <h1>验票扫码</h1>
      <p>使用设备相机扫描票券二维码，实时完成验票。</p>
    </header>

    <section class="scanner-card">
      <div class="scanner-video" :class="{ 'scanner-video--inactive': !scanning }">
        <video ref="videoEl" playsinline muted />
        <div v-if="!scanning" class="scanner-overlay">
          <p>点击下方按钮启动相机</p>
        </div>
      </div>
      <div class="scanner-actions">
        <button type="button" class="primary-btn" :disabled="scanning" @click="startScan">
          {{ scanning ? '扫描中…' : '启动相机扫码' }}
        </button>
        <button v-if="scanning" type="button" class="ghost-btn" @click="stopScan">停止</button>
      </div>
      <div class="scanner-actions">
        <button type="button" class="ghost-btn" @click="openCapture">
          拍照扫码
        </button>
      </div>
      <input
        ref="captureInput"
        type="file"
        accept="image/*"
        capture="environment"
        class="capture-input"
        @change="handleCapture"
      />
      <p v-if="scanError" class="error-text">{{ scanError }}</p>
    </section>

    <section v-if="resultMessage" class="result-card" :class="{ 'result-card--success': resultSuccess }">
      <p class="result-title">{{ resultSuccess ? '验票成功' : '验票失败' }}</p>
      <p class="result-message">{{ resultMessage }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { checkinRegistration } from '../../../api/client';

const videoEl = ref<HTMLVideoElement | null>(null);
const captureInput = ref<HTMLInputElement | null>(null);
const scanning = ref(false);
const scanError = ref<string | null>(null);
const resultMessage = ref<string | null>(null);
const resultSuccess = ref(false);

let readerInstance: BrowserMultiFormatReader | null = null;
let controls: IScannerControls | null = null;
let stopping = false;

const startScan = async () => {
  if (scanning.value) return;
  scanError.value = null;
  resultMessage.value = null;
  try {
    if (!readerInstance) {
      readerInstance = new BrowserMultiFormatReader();
    }
    scanning.value = true;
    await nextTick();
    controls = await readerInstance.decodeFromVideoDevice(
      undefined,
      videoEl.value as HTMLVideoElement,
      (result, err) => {
        if (result) {
          handlePayload(result.getText());
        } else if (err && !(err as any).message?.includes('No MultiFormat Readers')) {
          scanError.value = err instanceof Error ? err.message : '识别失败';
        }
      },
    );
  } catch (err) {
    scanError.value = '无法直接打开相机，请使用拍照扫码（建议使用 HTTPS 环境）';
    stopScan();
  }
};

const stopScan = async () => {
  if (stopping) return;
  stopping = true;
  scanning.value = false;
  if (controls) {
    await controls.stop();
    controls = null;
  }
  if (readerInstance) {
    readerInstance.reset();
  }
  stopping = false;
};

const handlePayload = async (raw: string) => {
  try {
    const payload = JSON.parse(raw);
    if (!payload.eventId || !payload.registrationId) {
      throw new Error('二维码内容不完整');
    }
    await submitCheckin(payload.eventId, payload.registrationId);
  } catch (err) {
    resultSuccess.value = false;
    resultMessage.value = err instanceof Error ? err.message : '无法解析二维码';
  } finally {
    await stopScan();
  }
};

const submitCheckin = async (eventId: string, registrationId: string) => {
  try {
    await checkinRegistration(eventId, registrationId);
    resultSuccess.value = true;
    resultMessage.value = `已登记：${registrationId.slice(0, 8).toUpperCase()}`;
  } catch (err) {
    resultSuccess.value = false;
    resultMessage.value = err instanceof Error ? err.message : '验票失败，请稍后再试';
  }
};

const openCapture = () => {
  captureInput.value?.click();
};

const handleCapture = async (event: Event) => {
  resultMessage.value = null;
  scanError.value = null;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const readerFile = new FileReader();
  readerFile.onload = async () => {
    const img = new Image();
    img.onload = async () => {
      try {
        if (!readerInstance) {
          readerInstance = new BrowserMultiFormatReader();
        }
        const result = await readerInstance.decodeFromImageElement(img);
        await handlePayload(result.getText());
      } catch (err) {
        scanError.value = err instanceof Error ? err.message : '无法解析照片中的二维码';
      } finally {
        input.value = '';
      }
    };
    img.src = readerFile.result as string;
  };
  readerFile.onerror = () => {
    scanError.value = '读取照片失败';
    input.value = '';
  };
  readerFile.readAsDataURL(file);
};

onMounted(() => {
  resultMessage.value = null;
});

onUnmounted(() => {
  stopScan();
});
</script>

<style scoped>
.ticket-scanner-page {
  min-height: 100vh;
  padding: 16px;
  background: #f6f8fb;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.scanner-hero {
  background: #fff;
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.scanner-hero h1 {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 700;
}

.scanner-hero p {
  margin: 0;
  color: #475569;
}

.scanner-card {
  background: #fff;
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.scanner-video {
  position: relative;
  min-height: 260px;
  border-radius: 18px;
  overflow: hidden;
  border: 1px dashed rgba(148, 163, 184, 0.6);
  background: #0f172a;
}

.scanner-video video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.scanner-video--inactive video {
  opacity: 0.25;
}

.scanner-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #e2e8f0;
  font-weight: 600;
  background: rgba(15, 23, 42, 0.45);
}

.scanner-actions {
  display: flex;
  gap: 12px;
}

.primary-btn,
.ghost-btn {
  flex: 1;
  border: none;
  border-radius: 14px;
  padding: 12px;
  font-size: 15px;
  font-weight: 600;
}

.primary-btn {
  background: #0ea5e9;
  color: #fff;
  box-shadow: 0 12px 30px rgba(14, 165, 233, 0.35);
}

.primary-btn:disabled {
  opacity: 0.6;
}

.ghost-btn {
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
}

.error-text {
  margin: 0;
  color: #b91c1c;
  font-size: 13px;
}

.result-card {
  background: #fff;
  border-radius: 20px;
  padding: 18px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  border-left: 4px solid #f97316;
}

.result-card--success {
  border-color: #22c55e;
}

.result-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.result-message {
  margin: 4px 0 0;
  color: #475569;
}
</style>
