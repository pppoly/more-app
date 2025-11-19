<template>
  <main class="ai-detail">
    <section class="hero">
      <button type="button" class="ghost-button" @click="goBack">
        <span class="i-lucide-chevron-left"></span>
      </button>
      <p class="hero-eyebrow">AI 模块</p>
      <h1>{{ detail?.module.name ?? '加载中…' }}</h1>
      <p class="hero-desc">{{ detail?.module.description ?? '正在获取最新数据' }}</p>
    </section>

    <section v-if="error" class="error-card">
      <p>{{ error }}</p>
      <button type="button" @click="loadDetail">重试</button>
    </section>

    <section v-else-if="!detail" class="loading-card">
      <p>数据加载中...</p>
    </section>

    <section v-else class="content">
      <section class="metrics-card">
        <h2>关键指标</h2>
        <div class="metric-grid">
          <div class="metric">
            <p>会话总数</p>
            <strong>{{ formatNumber(detail.metrics.totalLogs) }}</strong>
          </div>
          <div class="metric">
            <p>24h</p>
            <strong>{{ formatNumber(detail.metrics.last24h) }}</strong>
          </div>
          <div class="metric">
            <p>7天</p>
            <strong>{{ formatNumber(detail.metrics.last7d) }}</strong>
          </div>
          <div class="metric">
            <p>活跃社群</p>
            <strong>{{ formatNumber(detail.metrics.activeCommunities) }}</strong>
          </div>
          <div class="metric">
            <p>活跃用户</p>
            <strong>{{ formatNumber(detail.metrics.activeUsers) }}</strong>
          </div>
          <div class="metric">
            <p>平均轮次</p>
            <strong>{{ detail.metrics.avgTurns?.toFixed(1) ?? '-' }}</strong>
          </div>
          <div class="metric">
            <p>最新记录</p>
            <strong>{{ formatDate(detail.metrics.lastActivityAt) ?? '—' }}</strong>
          </div>
        </div>
      </section>

      <section class="card breakdown-card">
        <header>
          <div>
            <p class="section-eyebrow">阶段占比</p>
            <h3>Coach / Editor / Writer</h3>
          </div>
        </header>
        <div class="breakdown">
          <div v-for="item in detail.breakdown.stage" :key="item.label" class="breakdown-row">
            <p>{{ item.label }}</p>
            <div class="bar">
              <div class="fill" :style="{ width: stagePercentage(item.count) }"></div>
            </div>
            <span>{{ item.count }}</span>
          </div>
        </div>
      </section>

      <section class="card breakdown-card">
        <header>
          <div>
            <p class="section-eyebrow">语言分布</p>
            <h3>用户输入语言</h3>
          </div>
        </header>
        <div class="breakdown">
          <div v-for="item in detail.breakdown.language" :key="item.label" class="breakdown-row">
            <p>{{ item.label }}</p>
            <div class="bar bar--secondary">
              <div class="fill" :style="{ width: languagePercentage(item.count) }"></div>
            </div>
            <span>{{ item.count }}</span>
          </div>
        </div>
      </section>

      <section class="card session-card">
        <header>
          <div>
            <p class="section-eyebrow">最近会话</p>
            <h3>最新 25 条</h3>
          </div>
        </header>
        <div class="session-list">
          <article v-for="session in detail.recentSessions" :key="session.id" class="session-row">
            <div>
              <p class="session-community">{{ session.communityName }}</p>
              <p class="session-user">{{ session.userName }}</p>
              <p class="session-meta">
                {{ formatDate(session.createdAt) }} · {{ session.stage ?? '未知阶段' }} · {{ session.status ?? '状态未知' }}
              </p>
              <p v-if="session.summary" class="session-summary">{{ session.summary }}</p>
            </div>
            <span class="session-turns">{{ session.turnCount ?? '-' }} 回合</span>
          </article>
        </div>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { AiUsageDetailResponse } from '../../types/api';
import { fetchAiUsageDetail } from '../../api/client';

const router = useRouter();
const route = useRoute();
const detail = ref<AiUsageDetailResponse | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);

const moduleId = computed(() => route.params.moduleId as string);

const formatNumber = (value?: number | null) => {
  if (typeof value !== 'number') return '-';
  return new Intl.NumberFormat('ja-JP').format(value);
};

const formatDate = (value?: string | null) => {
  if (!value) return null;
  return new Date(value).toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const totalStage = computed(() =>
  detail.value?.breakdown.stage.reduce((sum, item) => sum + item.count, 0) ?? 0,
);
const totalLanguage = computed(() =>
  detail.value?.breakdown.language.reduce((sum, item) => sum + item.count, 0) ?? 0,
);

const stagePercentage = (count: number) => {
  if (!totalStage.value) return '0%';
  return `${Math.round((count / totalStage.value) * 100)}%`;
};

const languagePercentage = (count: number) => {
  if (!totalLanguage.value) return '0%';
  return `${Math.round((count / totalLanguage.value) * 100)}%`;
};

const goBack = () => {
  router.back();
};

const loadDetail = async () => {
  if (!moduleId.value) return;
  loading.value = true;
  error.value = null;
  try {
    detail.value = await fetchAiUsageDetail(moduleId.value);
  } catch (err) {
    console.error(err);
    error.value = '无法加载该模块的使用数据。';
  } finally {
    loading.value = false;
  }
};

watch(moduleId, () => {
  detail.value = null;
  loadDetail();
});

onMounted(() => {
  loadDetail();
});
</script>

<style scoped>
.ai-detail {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(80px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, #eef2ff 0%, #f9fbff 50%, #ffffff 100%);
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: #0f172a;
}

.hero {
  border-radius: 28px;
  padding: 24px;
  background: linear-gradient(140deg, #020617, #1d4ed8, #38bdf8);
  color: #fff;
  position: relative;
}

.ghost-button {
  position: absolute;
  top: 16px;
  left: 16px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hero-eyebrow {
  margin: 0.5rem 0 0;
  letter-spacing: 0.15em;
  font-size: 0.8rem;
  opacity: 0.85;
}

.hero h1 {
  margin: 0.4rem 0 0.5rem;
  font-size: 2rem;
}

.hero-desc {
  margin: 0;
  font-size: 1rem;
  opacity: 0.9;
}

.error-card,
.loading-card {
  border-radius: 18px;
  padding: 16px;
  background: #fff1f2;
  color: #b91c1c;
}

.loading-card {
  background: #ffffff;
  color: #475569;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.metrics-card {
  border-radius: 24px;
  padding: 18px;
  background: #fff;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

.metrics-card h2 {
  margin: 0 0 1rem;
  font-size: 1.3rem;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.metric {
  border-radius: 18px;
  padding: 0.85rem;
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
}

.card {
  border-radius: 22px;
  padding: 18px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.breakdown-card h3 {
  margin: 0.1rem 0 0;
}

.section-eyebrow {
  margin: 0;
  font-size: 0.8rem;
  letter-spacing: 0.15em;
  color: #94a3b8;
}

.breakdown {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.breakdown-row {
  display: grid;
  grid-template-columns: 90px 1fr 40px;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.9rem;
}

.bar {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.bar--secondary {
  background: #f3e8ff;
}

.fill {
  height: 100%;
  background: linear-gradient(120deg, #0ea5e9, #2563eb);
  border-radius: 999px;
}

.bar--secondary .fill {
  background: linear-gradient(120deg, #a855f7, #6366f1);
}

.session-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.session-row {
  border: 1px solid rgba(15, 23, 42, 0.05);
  border-radius: 18px;
  padding: 0.9rem;
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  background: #fdfdfd;
}

.session-community {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.session-user {
  margin: 0.1rem 0;
  color: #475569;
}

.session-meta {
  margin: 0;
  font-size: 0.8rem;
  color: #94a3b8;
}

.session-summary {
  margin: 0.4rem 0 0;
  font-size: 0.85rem;
  color: #0f172a;
}

.session-turns {
  font-size: 0.85rem;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
}
</style>
