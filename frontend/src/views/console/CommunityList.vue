<template>
  <section class="community-list">
    <header class="hero-card">
      <div class="hero-text">
        <p class="hero-eyebrow">社群一覧</p>
        <h1>My Communities</h1>
        <p class="hero-subtext">現在 {{ totalCommunities }} 件の社群を管理しています。</p>
      </div>
      <RouterLink class="hero-btn" :to="{ name: 'console-community-create' }">
        <span class="i-lucide-plus"></span>
        新規作成
      </RouterLink>
    </header>

    <section class="content">
      <div v-if="loading" class="skeleton-list">
        <article v-for="n in 3" :key="n" class="community-card community-card--skeleton"></article>
      </div>

      <article v-else-if="error" class="state-card state-card--error">
        <p class="state-title">社群情報を読み込めませんでした</p>
        <p class="state-message">{{ error }}</p>
        <button type="button" class="ghost-btn" @click="load">再読み込み</button>
      </article>

      <div v-else-if="communities.length" class="card-list">
        <article v-for="community in communities" :key="community.id" class="community-card">
          <header class="card-head">
            <div>
              <p class="community-name">{{ community.name }}</p>
              <p class="community-slug">@{{ community.slug }}</p>
            </div>
            <span class="badge" :class="`badge--${community.visibleLevel}`">{{ visibleLabel(community.visibleLevel) }}</span>
          </header>
          <p class="community-labels" v-if="community.labels?.length">{{ community.labels.join('、') }}</p>
          <p class="community-labels muted" v-else>ラベル未設定</p>
          <div class="card-actions">
            <RouterLink class="ghost-btn" :to="{ name: 'console-community-events', params: { communityId: community.id } }">
              イベント
            </RouterLink>
            <RouterLink class="ghost-btn" :to="{ name: 'console-community-edit', params: { communityId: community.id } }">
              編集
            </RouterLink>
          </div>
        </article>
      </div>

      <article v-else class="state-card">
        <p class="state-title">まだ社群がありません</p>
        <p class="state-message">まずは新しい社群を登録してAIアシスタントをスタートしましょう。</p>
        <RouterLink class="primary-btn" :to="{ name: 'console-community-create' }">新規作成</RouterLink>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { fetchManagedCommunities } from '../../api/client';
import type { ManagedCommunity } from '../../types/api';

const communities = ref<ManagedCommunity[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    communities.value = await fetchManagedCommunities();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'コミュニティを取得できませんでした';
  } finally {
    loading.value = false;
  }
};

onMounted(load);

const totalCommunities = computed(() => communities.value.length);

const visibleLabel = (level?: string | null) => {
  switch ((level || '').toLowerCase()) {
    case 'public':
      return '公開';
    case 'semi-public':
    case 'members':
      return '社群限定';
    case 'private':
      return '非公開';
    default:
      return '設定未定';
  }
};
</script>

<style scoped>
.community-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.hero-card {
  padding: 20px;
  border-radius: 20px;
  background: linear-gradient(135deg, #0f3057, #45aee2);
  color: #f0f9ff;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  box-shadow: 0 25px 45px rgba(15, 23, 42, 0.2);
}
.hero-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hero-eyebrow {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.2em;
  opacity: 0.85;
  text-transform: uppercase;
}
.hero-text h1 {
  margin: 0;
  font-size: 26px;
}
.hero-subtext {
  margin: 0;
  opacity: 0.9;
}
.hero-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  text-decoration: none;
  font-weight: 600;
}
.content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}
.community-card {
  background: #fff;
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 18px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.community-card--skeleton {
  height: 150px;
  background: linear-gradient(90deg, #eef1f6 25%, #e2e6ef 37%, #eef1f6 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.community-name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}
.community-slug {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}
.community-labels {
  margin: 0;
  font-size: 14px;
  color: #1f2937;
}
.community-labels.muted {
  color: #94a3b8;
}
.card-actions {
  display: flex;
  gap: 10px;
}
.badge {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.badge--public {
  background: #dcfce7;
  color: #15803d;
}
.badge--semi-public,
.badge--members {
  background: #fef3c7;
  color: #b45309;
}
.badge--private {
  background: #e2e8f0;
  color: #0f172a;
}
.ghost-btn,
.primary-btn {
  flex: 1;
  border-radius: 12px;
  padding: 10px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  text-align: center;
  text-decoration: none;
}
.ghost-btn {
  background: rgba(15, 23, 42, 0.05);
  color: #0f172a;
}
.primary-btn {
  background: #0ea5e9;
  color: #fff;
  box-shadow: 0 15px 30px rgba(14, 165, 233, 0.3);
}
.state-card {
  background: #fff;
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 12px 25px rgba(15, 23, 42, 0.08);
  text-align: center;
}
.state-card--error {
  border: 1px solid rgba(220, 38, 38, 0.2);
}
.state-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}
.state-message {
  margin: 8px 0 16px;
  color: #475569;
}
.skeleton-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

@keyframes shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>
