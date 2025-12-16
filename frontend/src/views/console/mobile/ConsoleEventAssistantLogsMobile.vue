<template>
  <div class="logs-shell">
    <div class="assistant-topbar-wrap">
      <ConsoleTopBar class="assistant-topbar" title="AI 履歴" :sticky="true" @back="goBack" />
    </div>

    <section class="logs-body" v-if="loading">
      <p class="text-muted">履歴を読み込んでいます...</p>
    </section>

    <section class="logs-body" v-else>
      <div class="logs-actions">
        <button class="new-session-btn" type="button" @click="startNewConversation">
          ＋ 新しい相談
        </button>
      </div>
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
            <p class="log-subtitle">
              {{ extractSubtitle(log) }}
            </p>
            <div class="log-tags">
              <span class="status-dot" :class="statusClass(log.status)"></span>
              <span class="tag">{{ statusLabel(log.status) }}</span>
              <span v-if="log.qaState?.communityName" class="tag tag--muted">{{ log.qaState.communityName }}</span>
              <span class="time">{{ formatTime(log.updatedAt || log.createdAt) }}</span>
            </div>
          </div>
          <button type="button" class="chip-btn" @click.stop="openDetail(log.id)">
            {{ actionLabel(log.status) }}
          </button>
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

const route = useRoute();
const router = useRouter();
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
  const completed = sorted.filter((log) => !isInProgressStatus(log.status)).slice(0, 3);
  return inProgress ? [inProgress, ...completed] : completed;
});

const statusLabel = (status: string | undefined) => {
  if (status === 'ready' || status === 'completed') return '完了';
  if (status === 'options') return '候補あり';
  return '進行中';
};

const statusClass = (status: string | undefined) => {
  if (status === 'ready' || status === 'completed') return 'ok';
  if (status === 'options') return 'warn';
  return 'active';
};

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

const formatTime = (value: string) =>
  new Date(value).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

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

const actionLabel = (status?: string) => {
  if (status === 'ready' || status === 'completed') return '結果を見る';
  return '続ける';
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
  background: radial-gradient(circle at 20% 20%, #e4f0ff 0%, #f7f9fb 45%, #f4f2ff 100%);
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
  background: radial-gradient(circle at 20% 20%, #e4f0ff 0%, #f7f9fb 45%, #f4f2ff 100%);
}

.logs-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.logs-actions {
  display: flex;
  justify-content: flex-end;
}

.new-session-btn {
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.95);
  color: #0f172a;
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12);
  font-weight: 700;
}

.text-muted {
  font-size: 13px;
  color: #475569;
}

.log-card {
  background: #fff;
  border-radius: 18px;
  padding: 14px;
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
}

.log-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.log-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.4;
}

.log-subtitle {
  margin: 0;
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.log-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #0ea5e9;
}
.status-dot.ok {
  background: #22c55e;
}
.status-dot.warn {
  background: #f59e0b;
}
.status-dot.active {
  background: #0ea5e9;
}

.tag {
  padding: 4px 10px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 12px;
  font-weight: 700;
}

.tag--muted {
  background: #f1f5f9;
  color: #475569;
}

.time {
  font-size: 12px;
  color: #94a3b8;
}

.chip-btn {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #0f172a;
  border-radius: 12px;
  padding: 10px 12px;
  font-weight: 700;
  min-width: 110px;
  justify-self: flex-end;
}
</style>
