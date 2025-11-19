<template>
  <section class="publish-success">
    <header class="success-hero">
      <div class="hero-icon">
        <span class="i-lucide-check"></span>
      </div>
      <p class="hero-label">活动发布成功</p>
      <h1>{{ heroTitle }}</h1>
      <p v-if="dateRangeText" class="hero-meta">
        <span class="i-lucide-calendar mr-1"></span>{{ dateRangeText }}
      </p>
      <p v-if="locationText" class="hero-meta">
        <span class="i-lucide-map-pin mr-1"></span>{{ locationText }}
      </p>
    </header>

    <section class="success-card">
      <h2>接下来可以做的</h2>
      <ul class="next-actions">
        <li>
          <span class="dot"></span>
          将活动链接分享到社群或聊天群，越早宣传越好。
        </li>
        <li>
          <span class="dot"></span>
          在 Console 查看报名情况、手动添加或联系参与者。
        </li>
        <li>
          <span class="dot"></span>
          若需要更多细节，可继续通过 AI 助手完善流程。
        </li>
      </ul>
      <div class="stat-grid" v-if="eventDetail">
        <div class="stat-box">
          <p>报名期限</p>
          <strong>{{ registrationRangeText }}</strong>
        </div>
        <div class="stat-box">
          <p>参与人数设置</p>
          <strong>{{ participantRangeText }}</strong>
        </div>
      </div>
    </section>

    <div class="actions">
      <button type="button" class="btn primary" :disabled="!eventId" @click="viewEventDetail">
        查看活动详情
      </button>
      <button type="button" class="btn ghost" @click="backToConsole">
        返回 Console
      </button>
    </div>

    <p v-if="loading" class="status-text">加载活动信息中...</p>
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
    return text || '活动已发布';
  }
  return '活动已发布';
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
  padding: 24px 20px 120px;
  background: linear-gradient(180deg, #f7fbff 0%, #ffffff 36%, #f9fafb 100%);
}

.success-hero {
  text-align: center;
  padding: 32px 20px 24px;
  background: radial-gradient(circle at top, rgba(34, 187, 170, 0.18), transparent 65%);
  border-radius: 20px;
  color: #0f172a;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  box-shadow: 0 25px 65px rgba(15, 23, 42, 0.15);
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
  font-size: 12px;
  letter-spacing: 0.2em;
  color: rgba(15, 23, 42, 0.65);
  margin-top: 6px;
}

.success-hero h1 {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
}

.hero-meta {
  font-size: 13px;
  color: rgba(15, 23, 42, 0.7);
  display: flex;
  align-items: center;
  gap: 4px;
}

.success-card {
  margin-top: 24px;
  padding: 20px;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 12px 35px rgba(15, 23, 42, 0.08);
}

.success-card h2 {
  font-size: 16px;
  margin-bottom: 12px;
  color: #0f172a;
}

.next-actions {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
  color: rgba(15, 23, 42, 0.75);
}

.next-actions li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.next-actions .dot {
  display: inline-flex;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #00b894;
  margin-top: 6px;
}

.stat-grid {
  margin-top: 20px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.stat-box {
  background: rgba(15, 23, 42, 0.03);
  border-radius: 16px;
  padding: 12px;
}

.stat-box p {
  font-size: 11px;
  color: rgba(15, 23, 42, 0.55);
  margin: 0 0 4px;
}

.stat-box strong {
  font-size: 15px;
  color: #0f172a;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 28px;
}

.btn {
  width: 100%;
  border-radius: 999px;
  padding: 14px 18px;
  font-size: 15px;
  font-weight: 600;
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

.btn.ghost {
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.12);
  color: #0f172a;
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
