<template>
  <main class="admin-ai-overview">
    <header class="page-head">
      <div>
        <p class="eyebrow">AI 利用概要</p>
        <h1>AI ダッシュボード</h1>
        <p class="subhead">モジュール利用状況とリスク状態</p>
      </div>
      <button class="ghost" type="button" :disabled="loading" @click="load">
        <span class="i-lucide-refresh-cw"></span> 更新
      </button>
    </header>

    <section class="card">
      <div v-if="loading" class="empty">読み込み中…</div>
      <div v-else-if="error" class="empty error">{{ error }}</div>
      <div v-else-if="!modules.length" class="empty">データがありません。</div>
      <div v-else class="card-list">
        <article v-for="mod in modules" :key="mod.id" class="ai-card">
          <div class="card-top">
            <div>
              <p class="eyebrow">{{ mod.id }}</p>
              <h3>{{ mod.name }}</h3>
            </div>
            <span class="pill" :class="mod.status === 'active' ? 'pill-live' : 'pill-pending'">{{ mod.status }}</span>
          </div>
          <p class="meta">{{ mod.description }}</p>
          <div class="metrics">
            <div class="metric">
              <p class="metric-label">累計</p>
              <strong>{{ mod.metrics?.totalLogs ?? 0 }}</strong>
            </div>
            <div class="metric">
              <p class="metric-label">24h</p>
              <strong>{{ mod.metrics?.last24h ?? 0 }}</strong>
            </div>
            <div class="metric">
              <p class="metric-label">7d</p>
              <strong>{{ mod.metrics?.last7d ?? 0 }}</strong>
            </div>
          </div>
          <div class="actions">
            <button class="ghost" type="button" @click="goDetail(mod.id)">詳細</button>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AiModuleUsageSummary } from '../../types/api';
import { fetchAdminAiUsageSummary } from '../../api/client';

const loading = ref(false);
const error = ref<string | null>(null);
const modules = ref<AiModuleUsageSummary[]>([]);
const router = useRouter();

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetchAdminAiUsageSummary();
    modules.value = res.modules ?? [];
  } catch (err) {
    error.value = 'ロードに失敗しました';
  } finally {
    loading.value = false;
  }
};

const goDetail = (id: string) => {
  router.push({ name: 'admin-ai-detail', params: { moduleId: id } });
};

onMounted(load);
</script>

<style scoped>
.admin-ai-overview {
  min-height: 100vh;
  padding: 12px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #0f172a;
}
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.eyebrow {
  font-size: 12px;
  color: #475569;
  letter-spacing: 0.08em;
}
.page-head h1 {
  margin: 4px 0;
}
.subhead {
  margin: 0;
  color: #475569;
}
.ghost {
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  border-radius: 10px;
  padding: 8px 12px;
}
.card {
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
}
.empty {
  padding: 18px;
  color: #475569;
}
.empty.error {
  color: #b91c1c;
}
.card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ai-card {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.meta {
  margin: 0;
  font-size: 13px;
  color: #475569;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.metric {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px;
}
.metric-label {
  margin: 0;
  font-size: 12px;
  color: #475569;
}
.metric strong {
  display: block;
  margin-top: 4px;
}
.actions {
  display: flex;
  justify-content: flex-end;
}
.pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
}
.pill-live {
  background: #ecfdf3;
  color: #15803d;
}
.pill-pending {
  background: #fff7ed;
  color: #c2410c;
}
</style>
