<template>
  <div class="assistant-dashboard">
    <header class="dashboard-head">
      <div>
        <p class="dashboard-label">AIアシスタント</p>
        <h1>プロンプト改善ダッシュボード</h1>
      </div>
      <button type="button" class="refresh-button" @click="loadData" :disabled="loading">
        <span class="i-lucide-refresh-ccw mr-1"></span>
        更新
      </button>
    </header>

    <section class="stats-grid" v-if="dashboard">
      <article class="stat-card">
        <p>セッション総数</p>
        <strong>{{ dashboard.stats.totalSessions }}</strong>
      </article>
      <article class="stat-card">
        <p>完了提案</p>
        <strong>{{ dashboard.stats.readySessions }}</strong>
        <span>{{ dashboard.stats.readyRate }}%</span>
      </article>
      <article class="stat-card">
        <p>平均ターン</p>
        <strong>{{ dashboard.stats.averageTurns }}</strong>
      </article>
    </section>

    <section v-if="dashboard" class="breakdown">
      <div class="breakdown-card">
        <h3>プロンプトバージョン</h3>
        <ul>
          <li v-for="(count, version) in dashboard.stats.promptVersions" :key="version">
            <span>{{ version }}</span>
            <strong>{{ count }}</strong>
          </li>
        </ul>
      </div>
      <div class="breakdown-card">
        <h3>言語別</h3>
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
        <h2>最近の会話</h2>
        <span v-if="loading">読み込み中...</span>
      </div>
      <div v-if="error" class="error-banner">{{ error }}</div>
      <div v-else-if="!dashboard" class="placeholder">データがありません</div>
      <ul v-else class="log-list">
        <li v-for="log in dashboard.logs" :key="log.id" class="log-item">
          <div class="log-meta">
            <p class="log-title">
              {{ log.summary || '名称未設定の草案' }}
            </p>
            <span class="log-status" :class="log.status">{{ log.status ?? 'collecting' }}</span>
          </div>
          <p class="log-detail">
            prompt: {{ log.promptVersion || 'N/A' }} · ターン: {{ log.turnCount ?? 0 }} · 言語:
            {{ log.language || '不明' }}
          </p>
          <p class="log-time">{{ new Date(log.createdAt).toLocaleString() }}</p>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { fetchAssistantDashboard } from '../../../api/client';
import type { EventAssistantDashboard } from '../../../types/api';

const route = useRoute();
const communityId = computed(() => route.params.communityId as string);
const dashboard = ref<EventAssistantDashboard | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const loadData = async () => {
  if (!communityId.value) return;
  loading.value = true;
  error.value = null;
  try {
    dashboard.value = await fetchAssistantDashboard(communityId.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'ダッシュボードの読み込みに失敗しました';
  } finally {
    loading.value = false;
  }
};

onMounted(loadData);
</script>

<style scoped>
.assistant-dashboard {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px calc(80px + env(safe-area-inset-bottom, 0px));
  background: #f5f7fb;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dashboard-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dashboard-label {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}

.dashboard-head h1 {
  margin: 2px 0 0;
  font-size: 20px;
  color: #0f172a;
}

.refresh-button {
  border: 1px solid #d5e2ff;
  background: #fff;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #2563eb;
  display: inline-flex;
  align-items: center;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.stat-card {
  background: #fff;
  border-radius: 16px;
  padding: 12px;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08);
}
.stat-card p {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
.stat-card strong {
  font-size: 20px;
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
  background: #fff;
  border-radius: 16px;
  padding: 12px;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08);
}
.breakdown-card h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #0f172a;
}
.breakdown-card ul {
  list-style: none;
  padding: 0;
  margin: 0;
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

.logs-section {
  background: #fff;
  border-radius: 16px;
  padding: 12px;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08);
  flex: 1;
}
.logs-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.logs-head h2 {
  margin: 0;
  font-size: 16px;
}
.error-banner {
  background: #fee2e2;
  color: #b91c1c;
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 13px;
}
.placeholder {
  font-size: 13px;
  color: #94a3b8;
}
.log-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  color: #0f172a;
  font-weight: 600;
}
.log-status {
  font-size: 11px;
  border-radius: 999px;
  padding: 2px 8px;
  text-transform: uppercase;
  background: #e2e8f0;
  color: #475569;
}
.log-status.ready {
  background: #d1fae5;
  color: #047857;
}
.log-status.options {
  background: #ede9fe;
  color: #6d28d9;
}
.log-detail {
  margin: 4px 0;
  font-size: 12px;
  color: #64748b;
}
.log-time {
  margin: 0;
  font-size: 11px;
  color: #94a3b8;
}
</style>
