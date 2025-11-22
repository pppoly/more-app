<template>
  <main class="ai-overview">
    <section class="hero">
      <p class="hero-chip">SOCIALMORE · AI 控制</p>
      <h1>AI 助手使用情况</h1>
      <p class="hero-desc">
        这里可以看到所有 AI 助手的运行概况、关键指标，并进入各模块的详细使用记录。
      </p>
      <p class="hero-meta">上次拉取：{{ formatDate(summary?.generatedAt) }}</p>
      <div class="hero-actions">
        <button type="button" class="outline-button" @click="goPrompts">Prompt 管理</button>
      </div>
    </section>

    <section v-if="error" class="error-card">
      <p>{{ error }}</p>
      <button type="button" @click="loadSummary">重新加载</button>
    </section>

    <section v-else class="module-list" :aria-busy="loading">
      <article v-for="module in summary?.modules ?? []" :key="module.id" class="module-card">
        <div class="module-head">
          <div>
            <p class="module-eyebrow">{{ module.status === 'active' ? '运行中' : '筹备中' }}</p>
            <h2>{{ module.name }}</h2>
          </div>
          <span :class="['status-pill', module.status === 'active' ? 'is-active' : 'is-muted']">
            {{ module.status === 'active' ? 'LIVE' : 'SOON' }}
          </span>
        </div>
        <p class="module-desc">{{ module.description }}</p>
        <div v-if="module.metrics" class="metric-grid">
          <div class="metric">
            <p>会话总数</p>
            <strong>{{ formatNumber(module.metrics.totalLogs) }}</strong>
          </div>
          <div class="metric">
            <p>24h</p>
            <strong>{{ formatNumber(module.metrics.last24h) }}</strong>
          </div>
          <div class="metric">
            <p>7天</p>
            <strong>{{ formatNumber(module.metrics.last7d) }}</strong>
          </div>
          <div class="metric">
            <p>活跃社群</p>
            <strong>{{ formatNumber(module.metrics.activeCommunities) }}</strong>
          </div>
          <div class="metric">
            <p>活跃用户</p>
            <strong>{{ formatNumber(module.metrics.activeUsers) }}</strong>
          </div>
          <div class="metric">
            <p>最新记录</p>
            <strong>{{ formatDate(module.metrics.lastActivityAt) ?? '—' }}</strong>
          </div>
        </div>
        <div v-else class="coming-soon">
          <p>功能筹备中，敬请期待。</p>
        </div>
        <button
          v-if="module.status === 'active'"
          class="outline-button"
          type="button"
          @click="goDetail(module.id)"
        >
          查看详细数据
          <span class="i-lucide-arrow-up-right"></span>
        </button>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AiUsageSummaryResponse } from '../../types/api';
import { fetchAiUsageSummary } from '../../api/client';

const router = useRouter();
const summary = ref<AiUsageSummaryResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const formatNumber = (value?: number | null) => {
  if (typeof value !== 'number') return '-';
  return new Intl.NumberFormat('ja-JP').format(value);
};

const formatDate = (value?: string | null) => {
  if (!value) return null;
  return new Date(value).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const goDetail = (moduleId: string) => {
  router.push({ name: 'admin-ai-detail', params: { moduleId } });
};

const goPrompts = () => {
  router.push({ name: 'admin-ai-prompts' });
};

const loadSummary = async () => {
  loading.value = true;
  error.value = null;
  try {
    summary.value = await fetchAiUsageSummary();
  } catch (err) {
    console.error(err);
    error.value = '无法加载 AI 使用概览，请稍后重试。';
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadSummary();
});
</script>

<style scoped>
.ai-overview {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(80px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, #ecf3ff 0%, #f8fbff 50%, #ffffff 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #0f172a;
}

.hero {
  border-radius: 28px;
  padding: 24px;
  background: linear-gradient(140deg, #001a43, #004173, #00a0e9);
  color: #fff;
  box-shadow: 0 25px 50px rgba(0, 26, 67, 0.35);
}

.hero-chip {
  font-size: 0.78rem;
  letter-spacing: 0.18em;
  opacity: 0.8;
}

.hero h1 {
  margin: 0.5rem 0;
  font-size: 2rem;
}

.hero-desc {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  opacity: 0.95;
}

.hero-meta {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.8;
}

.hero-actions {
  margin-top: 10px;
  display: flex;
  gap: 10px;
}

.error-card {
  border-radius: 12px;
  padding: 16px;
  background: #fff1f2;
  color: #b91c1c;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.module-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.module-card {
  border-radius: 24px;
  padding: 18px;
  background: #fff;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.module-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
}

.module-eyebrow {
  margin: 0;
  font-size: 0.85rem;
  letter-spacing: 0.12em;
  color: #94a3b8;
}

.module-card h2 {
  margin: 0.1rem 0 0;
  font-size: 1.4rem;
}

.module-desc {
  margin: 0;
  font-size: 0.95rem;
  color: #475569;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.metric {
  border-radius: 18px;
  padding: 0.9rem;
  background: #f8fafc;
}

.metric p {
  margin: 0;
  font-size: 0.75rem;
  color: #94a3b8;
}

.metric strong {
  display: block;
  margin-top: 0.35rem;
  font-size: 1.2rem;
  color: #0f172a;
}

.coming-soon {
  padding: 0.8rem;
  border-radius: 16px;
  background: #f1f5f9;
  color: #475569;
  font-size: 0.9rem;
}

.outline-button {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  padding: 0.5rem 1rem;
  background: transparent;
  color: #0f172a;
  font-weight: 600;
}

.status-pill {
  border-radius: 999px;
  padding: 0.25rem 0.8rem;
  font-weight: 600;
  font-size: 0.8rem;
}

.status-pill.is-active {
  background: rgba(16, 185, 129, 0.2);
  color: #047857;
}

.status-pill.is-muted {
  background: rgba(148, 163, 184, 0.25);
  color: #475569;
}
</style>
