<template>
  <div class="staff-page">
    <header class="staff-head">
      <div>
        <p class="staff-label">AI デバッグ</p>
        <h1>アシスタント運用パネル</h1>
        <p class="staff-desc">社内スタッフの Prompt / API 検証用</p>
      </div>
      <button type="button" class="outline" @click="loadDashboard" :disabled="loading">
        <span class="i-lucide-refresh-cw mr-1"></span>
        更新
      </button>
    </header>

    <section class="control-card">
      <label>
        コミュニティを選択
        <select v-model="selectedCommunityId" @change="handleCommunityChange">
          <option value="" disabled>選択してください</option>
          <option v-for="community in communities" :key="community.id" :value="community.id">
            {{ community.name }}
          </option>
        </select>
      </label>
      <label>
        またはコミュニティIDを入力
        <div class="manual-entry">
          <input v-model="manualCommunityId" type="text" placeholder="例: cmty_xxx" />
          <button type="button" class="outline" @click="applyManualId" :disabled="!manualCommunityId.trim()">
            表示
          </button>
        </div>
      </label>
      <p class="helper">管理者は任意のコミュニティIDでAIログを確認できます。</p>
    </section>

    <section class="stats-grid" v-if="dashboard">
      <article class="stat-card">
        <p>総対話数</p>
        <strong>{{ dashboard.stats.totalSessions }}</strong>
      </article>
      <article class="stat-card">
        <p>完了率</p>
        <strong>{{ dashboard.stats.readySessions }}</strong>
        <span>{{ dashboard.stats.readyRate }}%</span>
      </article>
      <article class="stat-card">
        <p>平均ターン数</p>
        <strong>{{ dashboard.stats.averageTurns }}</strong>
      </article>
    </section>

    <section class="breakdown" v-if="dashboard">
      <div class="breakdown-card">
        <h3>Prompt バージョン</h3>
        <ul>
          <li v-for="(count, version) in dashboard.stats.promptVersions" :key="version">
            <span>{{ version }}</span>
            <strong>{{ count }}</strong>
          </li>
        </ul>
      </div>
      <div class="breakdown-card">
        <h3>言語分布</h3>
        <ul>
          <li v-for="(count, lang) in dashboard.stats.languages" :key="lang">
            <span>{{ lang }}</span>
            <strong>{{ count }}</strong>
          </li>
        </ul>
      </div>
    </section>

    <section class="logs-section">
      <div class="logs-head">
        <h2>最近のデバッグ対話</h2>
        <span v-if="loading">読み込み中…</span>
      </div>
      <div v-if="error" class="error-banner">{{ error }}</div>
      <div v-else-if="!dashboard" class="placeholder">コミュニティを選択してください</div>
      <ul v-else class="log-list">
        <li v-for="log in dashboard.logs" :key="log.id" class="log-item">
          <div class="log-meta" @click="toggleLog(log.id)">
            <div>
              <p class="log-title">{{ log.summary || '未命名の下書き' }}</p>
              <p class="log-sub">
                Prompt: {{ log.promptVersion || '不明' }} · ターン: {{ log.turnCount ?? 0 }} · 時間:
                {{ new Date(log.createdAt).toLocaleString() }}
              </p>
            </div>
            <span class="log-status" :class="log.status">{{ log.status ?? 'collecting' }}</span>
          </div>
          <div v-if="expandedLogId === log.id" class="log-body">
            <div class="log-badge">Stage: {{ log.stage }}</div>
            <div class="conversation">
              <p class="conversation-title">会話ログ（Speak）</p>
              <ul>
                <li
                  v-for="message in log.messages"
                  :key="message.id"
                  :class="['message', message.role === 'user' ? 'message-user' : 'message-assistant']"
                >
                  <span class="message-role">{{ message.role === 'user' ? 'ユーザー Speak' : 'AI Guide' }}</span>
                  <p class="message-content" v-if="message.type === 'text'">{{ message.content }}</p>
                  <div v-else class="proposal-snippet">
                    <p>タイトル: {{ message.payload?.title }}</p>
                    <p>{{ message.payload?.description }}</p>
                  </div>
                </li>
              </ul>
            </div>
            <div class="write-panel" v-if="log.aiResult">
              <p class="conversation-title">構造化 Draft（Write）</p>
              <pre class="draft-json">{{ formatResult(log.aiResult) }}</pre>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { fetchAssistantDashboard } from '../../api/client';
import type { EventAssistantDashboard } from '../../types/api';
import { useConsoleCommunityStore } from '../../stores/consoleCommunity';

const store = useConsoleCommunityStore();
const communities = computed(() => store.communities.value);
const selectedCommunityId = ref<string | null>(null);
const manualCommunityId = ref('');
const dashboard = ref<EventAssistantDashboard | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const expandedLogId = ref<string | null>(null);

const handleCommunityChange = () => {
  dashboard.value = null;
  loadDashboard();
};

const loadDashboard = async () => {
  if (!selectedCommunityId.value) return;
  loading.value = true;
  error.value = null;
  try {
    dashboard.value = await fetchAssistantDashboard(selectedCommunityId.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'ダッシュボードの読み込みに失敗しました';
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  await store.loadCommunities();
  if (communities.value.length) {
    selectedCommunityId.value = communities.value[0].id;
    loadDashboard();
  }
});

const applyManualId = () => {
  if (!manualCommunityId.value.trim()) return;
  selectedCommunityId.value = manualCommunityId.value.trim();
  loadDashboard();
};

const toggleLog = (id: string) => {
  expandedLogId.value = expandedLogId.value === id ? null : id;
};

const formatResult = (result: Record<string, unknown>) => {
  return JSON.stringify(result, null, 2);
};
</script>

<style scoped>
.staff-page {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px calc(90px + env(safe-area-inset-bottom, 0px));
  background: #f5f7fb;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.staff-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.staff-label {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}

.staff-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
}

.staff-head h1 {
  margin: 0;
  font-size: 22px;
  color: #0f172a;
}

.control-card,
.stats-grid,
.breakdown,
.logs-section {
  background: #fff;
  border-radius: var(--app-border-radius);
  padding: 16px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
}

.control-card label {
  display: flex;
  flex-direction: column;
  font-size: 13px;
  color: #475569;
  gap: 4px;
}

select {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 14px;
  background: #f9fafc;
}

.manual-entry {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.manual-entry input {
  flex: 1;
  border: 1px solid #e2e8f0;
  border-radius: var(--app-border-radius);
  padding: 8px 10px;
}

.helper {
  font-size: 12px;
  color: #94a3b8;
}

.outline {
  border: 1px solid #d5e2ff;
  background: #fff;
  border-radius: var(--app-border-radius);
  padding: 6px 12px;
  font-size: 13px;
  color: #2563eb;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.stat-card p {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.stat-card strong {
  font-size: 22px;
  color: #0f172a;
}

.stat-card span {
  font-size: 12px;
  color: #94a3b8;
  margin-left: 6px;
}

.breakdown {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.breakdown-card {
  flex: 1;
  min-width: 180px;
}

.breakdown-card h3 {
  margin: 0 0 10px;
  font-size: 14px;
}

.breakdown-card ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.breakdown-card li {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #475569;
}

.logs-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.error-banner {
  background: #fee2e2;
  color: #b91c1c;
  border-radius: 12px;
  padding: 8px;
  font-size: 13px;
  margin-top: 8px;
}

.log-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-item {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px;
}

.log-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.log-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.log-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
}

.log-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #475569;
  text-transform: uppercase;
}

.log-status.ready {
  background: #d1fae5;
  color: #047857;
}

.log-status.options {
  background: #ede9fe;
  color: #6d28d9;
}

.log-body {
  margin-top: 10px;
  border-top: 1px solid #e2e8f0;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.log-badge {
  font-size: 12px;
  color: #475569;
  background: rgba(148, 163, 184, 0.2);
  border-radius: 999px;
  padding: 4px 10px;
  align-self: flex-start;
}

.conversation-title {
  margin: 0 0 6px;
  font-size: 13px;
  color: #0f172a;
  font-weight: 600;
}

.conversation ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message {
  border: 1px solid #e2e8f0;
  border-radius: var(--app-border-radius);
  padding: 8px;
  font-size: 13px;
}

.message-role {
  display: inline-flex;
  font-size: 11px;
  font-weight: 600;
  color: #2563eb;
  margin-bottom: 4px;
}

.message-user .message-role {
  color: #f97316;
}

.message-content {
  margin: 0;
  white-space: pre-line;
}

.proposal-snippet p {
  margin: 0;
  font-size: 12px;
  color: #475569;
}

.write-panel {
  border: 1px solid #e2e8f0;
  border-radius: var(--app-border-radius);
  padding: 8px;
}

.draft-json {
  margin: 0;
  font-size: 12px;
  overflow-x: auto;
}

.placeholder {
  font-size: 13px;
  color: #94a3b8;
}
</style>
