<template>
  <div class="logs-shell">
    <div class="assistant-topbar-wrap">
      <ConsoleTopBar
        v-if="!isLiffClientMode"
        class="assistant-topbar"
        titleKey="console.eventAssistant.logs"
        :sticky="true"
        @back="goBack"
      >
        <template #right>
          <span class="topbar-right">
            <button type="button" class="new-session-btn" @click="startNewConversation" aria-label="新しい相談">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M12 5v14" stroke-linecap="round" />
                <path d="M5 12h14" stroke-linecap="round" />
              </svg>
            </button>
          </span>
        </template>
      </ConsoleTopBar>
    </div>

    <section class="logs-body" v-if="loading">
      <p class="text-muted">履歴を読み込んでいます...</p>
    </section>

    <section class="logs-body" v-else>
      <p v-if="!displayLogs.length" class="text-muted">まだAIアシスタントの履歴がありません。</p>
      <article
        v-for="log in displayLogs"
        :key="log.id"
        class="log-card"
        @click="openDetail(log.id)"
      >
        <div class="log-row">
          <div class="log-meta">
            <p class="log-title">{{ extractTitle(log) || log.summary || 'AI提案' }}</p>
            <p class="log-subtitle">{{ extractSubtitle(log) }}</p>
          </div>
          <span class="log-arrow" aria-hidden="true">›</span>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchEventAssistantLogs } from '../../../api/client';
import type { ConsoleEventAssistantLog } from '../../../types/api';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';
import { isLiffClient } from '../../../utils/device';
import { isLineInAppBrowser } from '../../../utils/liff';

const route = useRoute();
const router = useRouter();
const isLiffClientMode = computed(() => isLineInAppBrowser() || isLiffClient());
const communityId = computed(() => route.params.communityId as string | undefined);

const logs = ref<ConsoleEventAssistantLog[]>([]);
const loading = ref(false);
const displayLogs = computed(() => {
  const sorted = [...logs.value].sort(
    (a, b) =>
      new Date((b as any).updatedAt || b.createdAt).getTime() -
      new Date((a as any).updatedAt || a.createdAt).getTime(),
  );
  const now = Date.now();
  const inProgress = sorted.find((log) => {
    const createdAt = new Date((log as any).updatedAt || log.createdAt).getTime();
    const withinWindow = now - createdAt <= 24 * 60 * 60 * 1000;
    return isInProgressStatus(log.status) && withinWindow;
  });
  const completed = sorted.filter((log) => !isInProgressStatus(log.status)).slice(0, 10);
  return inProgress ? [inProgress, ...completed] : completed;
});

const isInProgressStatus = (status?: string | null) => {
  if (!status) return true;
  return status !== 'completed' && status !== 'ready';
};

const loadLogs = async () => {
  if (!communityId.value) return;
  loading.value = true;
  try {
    logs.value = await fetchEventAssistantLogs(communityId.value);
  } catch (err) {
    console.warn('Failed to load assistant logs', err);
  } finally {
    loading.value = false;
  }
};

const goBack = () => {
  router.back();
};

const extractTitle = (log: ConsoleEventAssistantLog) => {
  const title = log.aiResult?.title;
  if (!title) return '';
  if (typeof title === 'string') return title;
  if (typeof title === 'object' && 'original' in title) {
    return (title as any).original ?? '';
  }
  return '';
};

const extractSubtitle = (log: ConsoleEventAssistantLog) => {
  if (log.qaState?.topic) return log.qaState.topic;
  if (log.summary) return log.summary;
  return '対話の要約がありません';
};

const openDetail = (id: string) => {
  const target = logs.value.find((l) => l.id === id);
  if (!target || !communityId.value) return;
  router.push({
    name: 'ConsoleMobileEventCreate',
    params: { communityId: communityId.value },
    query: { logId: target.id, source: 'history' },
  });
};

const startNewConversation = () => {
  if (!communityId.value) return;
  router.push({
    name: 'ConsoleMobileEventCreate',
    params: { communityId: communityId.value },
    query: { newSession: '1' },
  });
};

onMounted(() => {
  loadLogs();
});
</script>

<style scoped>
.logs-shell {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px)) 12px calc(72px + env(safe-area-inset-bottom, 0px));
  background: #f7f7f8;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}

.assistant-topbar {
  position: relative;
  z-index: 30;
}

.assistant-topbar-wrap {
  position: sticky;
  top: 0;
  z-index: 35;
  background: #f7f7f8;
}

.topbar-right {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 36px;
}

.logs-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.new-session-btn {
  border: none;
  background: transparent;
  color: #6b7280;
  border-radius: 999px;
  padding: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.text-muted {
  font-size: 13px;
  color: #6b7280;
}

.log-card {
  background: transparent;
  border-radius: 0;
  padding: 12px 4px;
  box-shadow: none;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.log-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.log-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
  line-height: 1.4;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.log-subtitle {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.log-arrow {
  color: #d1d5db;
  font-size: 20px;
  line-height: 1;
}
</style>
