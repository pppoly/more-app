<template>
  <div class="publish-success">
    <div class="content">
      <div class="hero">
        <div class="hero-icon" aria-hidden="true">
          <svg viewBox="0 0 72 72" role="img">
            <defs>
              <linearGradient id="publish-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0ea5e9" />
                <stop offset="100%" stop-color="#22c55e" />
              </linearGradient>
            </defs>
            <circle cx="36" cy="36" r="34" fill="url(#publish-grad)" />
            <path d="M24 36.5 32.5 45 48 27" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div class="hero-text">
          <h1>公開が完了しました</h1>
          <p>イベントが正常に公開されました</p>
        </div>
      </div>

      <div class="actions">
        <button type="button" class="btn primary" :disabled="!eventId" @click="goManage">
          イベント管理へ
        </button>
        <button type="button" class="btn secondary" @click="goConsoleHome">
          コンソールホームへ
        </button>
      </div>

      <p v-if="loading" class="status-text">イベント情報を読み込み中…</p>
      <p v-else-if="error" class="status-text error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchConsoleEvent } from '../../../api/client';
import type { ConsoleEventDetail } from '../../../types/api';
import { getLocalizedText } from '../../../utils/i18nContent';

const route = useRoute();
const router = useRouter();
const eventId = route.params.eventId as string | undefined;
const eventDetail = ref<ConsoleEventDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const loadEventDetail = async () => {
  if (!eventId) {
    loading.value = false;
    return;
  }
  try {
    eventDetail.value = await fetchConsoleEvent(eventId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'イベント情報を取得できませんでした';
  } finally {
    loading.value = false;
  }
};

const goManage = () => {
  if (!eventId) return;
  router.replace({ name: 'ConsoleEventManageMobile', params: { eventId } });
};

const goConsoleHome = () => {
  router.replace({ name: 'ConsoleMobileHome' });
};

onMounted(() => {
  loadEventDetail();
});
</script>

<style scoped>
.publish-success {
  min-height: 100vh;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px calc(32px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}

.content {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  text-align: left;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.hero-icon {
  width: 88px;
  height: 88px;
  border-radius: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
}

.hero-icon svg {
  width: 88px;
  height: 88px;
  display: block;
}

.hero-text h1 {
  margin: 0;
  font-size: 21px;
  font-weight: 700;
  color: #0f172a;
}

.hero-text p {
  margin: 4px 0 0;
  font-size: 13px;
  color: #475569;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn {
  width: 100%;
  height: 48px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  box-sizing: border-box;
}

.btn.primary {
  border: none;
  background: linear-gradient(135deg, #0ea5e9, #22c55e);
  color: #fff;
  letter-spacing: 0.01em;
  box-shadow: none;
}

.btn.secondary {
  border: 1px solid rgba(15, 23, 42, 0.16);
  background: #fff;
  color: #0f172a;
}

.status-text {
  margin: 0;
  font-size: 13px;
  color: #475569;
  text-align: center;
}

.status-text.error {
  color: #dc2626;
}
</style>
