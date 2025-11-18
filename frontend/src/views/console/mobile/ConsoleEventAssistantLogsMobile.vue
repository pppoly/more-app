<template>
  <div class="logs-screen">
    <header class="logs-header">
      <button type="button" class="hero-back" @click="goBack">
        <span class="i-lucide-chevron-left text-lg"></span>
        戻る
      </button>
      <div>
        <p class="header-label">イベントAIアシスタント</p>
        <h1>生成履歴</h1>
      </div>
    </header>

    <section class="logs-body" v-if="loading">
      <p class="text-muted">履歴を読み込んでいます...</p>
    </section>

    <section class="logs-body" v-else>
      <p v-if="!logs.length" class="text-muted">まだAIアシスタントの履歴がありません。</p>
      <article
        v-for="log in logs"
        :key="log.id"
        class="log-card"
        @click="toggleExpand(log.id)"
      >
        <div class="log-head">
          <div>
            <p class="log-time">{{ formatTime(log.createdAt) }}</p>
            <p class="log-author">{{ log.user?.name ?? 'システム' }}</p>
          </div>
          <span class="stage-chip" :class="`stage-chip--${stageClass(log.stage)}`">
            {{ stageLabel(log.stage) }}
          </span>
        </div>
        <h3>{{ log.summary || extractTitle(log) || 'AI提案' }}</h3>
        <p class="log-preview">{{ extractPreview(log) }}</p>
        <div class="log-details" v-if="expandedId === log.id">
          <div class="log-section">
            <p class="log-section-title">対象・雰囲気</p>
            <p class="log-section-text">
              {{ log.qaState ? log.qaState.audience || '---' : '---' }} / {{ log.qaState ? log.qaState.style || '---' : '---' }}
            </p>
          </div>
          <div class="log-section">
            <p class="log-section-title">質問ログ</p>
            <ul>
              <li v-for="msg in log.messages" :key="msg.id" class="log-message" :class="msg.role">
                <strong>{{ msg.role === 'user' ? '主催者' : 'AI' }}</strong>
                <span>{{ msg.content }}</span>
              </li>
            </ul>
          </div>
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

const route = useRoute();
const router = useRouter();
const communityId = computed(() => route.params.communityId as string | undefined);

const logs = ref<ConsoleEventAssistantLog[]>([]);
const loading = ref(false);
const expandedId = ref<string | null>(null);

const stageMap: Record<string, string> = {
  coach: 'Coachモード',
  editor: 'Editorモード',
  writer: 'チェックモード',
};

const stageClass = (stage: string) => {
  if (stage === 'coach' || stage === 'editor' || stage === 'writer') return stage;
  return 'coach';
};

const stageLabel = (stage: string) => stageMap[stage] ?? stage;

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

const extractPreview = (log: ConsoleEventAssistantLog) => {
  const description = log.aiResult?.description;
  let text = '';
  if (!description) {
    text = log.summary ?? '';
  } else if (typeof description === 'string') {
    text = description;
  } else if (typeof description === 'object' && 'original' in description) {
    text = (description as any).original ?? '';
  }
  if (!text) return '---';
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
};

const toggleExpand = (id: string) => {
  expandedId.value = expandedId.value === id ? null : id;
};

onMounted(() => {
  loadLogs();
});
</script>

<style scoped>
.logs-screen {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 8px) 12px calc(72px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, #f4fbff 0%, #eef5fb 60%, #f9f9fb 100%);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.logs-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hero-back {
  border: none;
  background: rgba(15, 23, 42, 0.06);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #0f172a;
  font-weight: 600;
}

.header-label {
  margin: 0;
  font-size: 11px;
  text-transform: uppercase;
  color: #64748b;
  letter-spacing: 0.08em;
}

.logs-header h1 {
  margin: 0;
  font-size: 20px;
  color: #0f172a;
}

.logs-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.text-muted {
  font-size: 13px;
  color: #475569;
}

.log-card {
  background: #fff;
  border-radius: 24px;
  padding: 16px;
  box-shadow: 0 15px 35px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.log-time {
  margin: 0;
  font-size: 12px;
  color: #475569;
}

.log-author {
  margin: 2px 0 0;
  font-size: 11px;
  color: #94a3b8;
}

.stage-chip {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
}
.stage-chip--coach {
  background: #f3e8ff;
  color: #7e22ce;
}
.stage-chip--editor {
  background: #dbf4ff;
  color: #0369a1;
}
.stage-chip--writer {
  background: #dcfce7;
  color: #15803d;
}

.log-card h3 {
  margin: 0;
  font-size: 16px;
  color: #0f172a;
}

.log-preview {
  margin: 0;
  font-size: 13px;
  color: #475569;
}

.log-details {
  margin-top: 8px;
  border-top: 1px dashed #e2e8f0;
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-section-title {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: #0f172a;
}

.log-section-text {
  margin: 0;
  font-size: 12px;
  color: #475569;
}

.log-message {
  list-style: none;
  margin: 0 0 4px;
  padding: 6px 8px;
  border-radius: 12px;
  background: #f8fafc;
  font-size: 12px;
  display: flex;
  gap: 6px;
}

.log-message.assistant {
  background: #e2f8ff;
}
.log-message.user {
  background: #dff7ec;
}

.log-message strong {
  font-size: 11px;
  color: #0f172a;
}
</style>
