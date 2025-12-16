<template>
  <section class="publish-success">
    <header class="success-hero">
      <div class="hero-icon">
        <span class="i-lucide-check"></span>
      </div>
      <p class="hero-label">イベントを公開しました</p>
      <h1 class="hero-title">{{ heroTitle }}</h1>
      <p v-if="dateRangeText" class="hero-meta">
        <span class="i-lucide-calendar mr-1"></span>{{ dateRangeText }}
      </p>
      <p v-if="locationText" class="hero-meta location">
        <span class="i-lucide-map-pin mr-1"></span>{{ locationText }}
      </p>
    </header>

    <p class="next-hint">次のおすすめ：イベント詳細で公開内容を確認しましょう。</p>

    <div class="actions">
      <button type="button" class="btn primary" :disabled="!eventId" @click="viewEventDetail">
        イベント詳細を見る
      </button>
      <button type="button" class="btn link" @click="backToConsole">コミュニティに戻る</button>
    </div>

    <p v-if="loading" class="status-text">イベント情報を読み込み中…</p>
    <p v-else-if="error" class="status-text error">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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

const heroTitle = computed(() => {
  if (eventDetail.value) {
    const text = getLocalizedText(eventDetail.value.title);
    return text || 'イベントが公開されました';
  }
  return 'イベントが公開されました';
});

const dateRangeText = computed(() => formatDateRange(eventDetail.value?.startTime, eventDetail.value?.endTime));
const locationText = computed(() => eventDetail.value?.locationText || '地点待定');
const registrationRangeText = computed(() =>
  formatDateRange(eventDetail.value?.regStartTime ?? eventDetail.value?.startTime, eventDetail.value?.regEndTime),
);
const participantRangeText = computed(() => {
  if (!eventDetail.value) return '未设置';
  const min = eventDetail.value.minParticipants ?? '—';
  const max = eventDetail.value.maxParticipants ?? '—';
  return `${min} ~ ${max} 人`;
});

const loadEventDetail = async () => {
  if (!eventId) {
    error.value = '缺少活动 ID';
    loading.value = false;
    return;
  }
  try {
    eventDetail.value = await fetchConsoleEvent(eventId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '无法获取活动信息';
  } finally {
    loading.value = false;
  }
};

const viewEventDetail = () => {
  if (!eventId) return;
  router.push({ name: 'event-detail', params: { eventId } });
};

const backToConsole = () => {
  if (eventDetail.value?.communityId) {
    router.push({
      name: 'ConsoleMobileCommunityEvents',
      params: { communityId: eventDetail.value.communityId },
    });
  } else {
    router.push({ name: 'ConsoleMobileHome' });
  }
};

const formatDateRange = (start?: string | null, end?: string | null) => {
  if (!start) return '';
  const startText = formatDate(start);
  if (!end) return startText;
  const endText = formatDate(end);
  return `${startText} · ${endText}`;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

onMounted(() => {
  loadEventDetail();
});
</script>

<style scoped>
.publish-success {
  min-height: 100vh;
  padding: 32px 20px 80px;
  background: #f8fafc;
}

.success-hero {
  text-align: center;
  padding: 28px 20px 20px;
  background: linear-gradient(145deg, rgba(0, 144, 217, 0.16), rgba(34, 187, 170, 0.12));
  border-radius: 24px;
  color: #0f172a;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  box-shadow: 0 20px 55px rgba(15, 23, 42, 0.12);
}

.hero-icon {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: linear-gradient(135deg, #00b894, #00d4ff);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: #fff;
  box-shadow: 0 20px 45px rgba(0, 184, 148, 0.3);
}

.hero-label {
  font-size: 13px;
  letter-spacing: 0.12em;
  color: rgba(15, 23, 42, 0.7);
  margin-top: 6px;
}

.hero-title {
  font-size: 22px;
  font-weight: 800;
  margin: 2px 0 0;
  line-height: 1.3;
}

.hero-meta {
  font-size: 13px;
  color: rgba(15, 23, 42, 0.7);
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
}
.hero-meta.location {
  max-width: 280px;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.next-hint {
  margin: 16px 8px 0;
  font-size: 13px;
  color: #475569;
  text-align: center;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 22px;
}

.btn {
  width: 100%;
  border-radius: 14px;
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 700;
  border: none;
}

.btn.primary {
  background: linear-gradient(135deg, #0090d9, #0ccbaf);
  color: #fff;
  box-shadow: 0 20px 40px rgba(0, 144, 217, 0.3);
}

.btn.primary:disabled {
  opacity: 0.6;
}

.btn.link {
  background: transparent;
  color: #475569;
  padding: 8px 10px;
}

.status-text {
  margin-top: 16px;
  text-align: center;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.55);
}

.status-text.error {
  color: #dc2626;
}
</style>
