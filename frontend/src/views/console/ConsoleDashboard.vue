<template>
  <section class="console-dashboard">
    <header>
      <h2>Console Dashboard</h2>
      <p>所属コミュニティの指標をざっと確認できます。</p>
    </header>

    <div v-if="listLoading" class="status">読み込み中…</div>
    <div v-else-if="listError" class="status error">{{ listError }}</div>
    <div v-else class="dashboard-grid">
      <aside class="community-list">
        <h3>管理中のコミュニティ</h3>
        <p v-if="!communities.length" class="muted">まだ管理者権限のあるコミュニティがありません。</p>
        <ul v-else>
          <li
            v-for="community in communities"
            :key="community.id"
            :class="{ active: community.id === selectedCommunityId }"
            @click="onSelectCommunity(community.id)"
          >
            <strong>{{ community.name }}</strong>
            <small>{{ community.slug }}</small>
          </li>
        </ul>
      </aside>

      <section class="analytics" v-if="selectedCommunityId">
        <div v-if="analyticsLoading" class="status">Analytics 読み込み中…</div>
        <div v-else-if="analyticsError" class="status error">{{ analyticsError }}</div>
        <div v-else-if="analytics" class="cards">
          <div class="card">
            <p class="label">イベント総数</p>
            <p class="value">{{ analytics.totalEvents }}</p>
          </div>
          <div class="card">
            <p class="label">募集数</p>
            <p class="value">{{ analytics.totalRegistrations }}</p>
          </div>
          <div class="card">
            <p class="label">出席数</p>
            <p class="value">{{ analytics.totalAttended }}</p>
          </div>
          <div class="card">
            <p class="label">無断欠席</p>
            <p class="value">{{ analytics.totalNoShow }}</p>
          </div>
          <div class="card">
            <p class="label">出席率</p>
            <p class="value">{{ (analytics.attendanceRate * 100).toFixed(0) }}%</p>
          </div>
        </div>
        <p v-else class="muted">コミュニティを選択すると Analytics が表示されます。</p>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { fetchManagedCommunities, fetchCommunityAnalytics } from '../../api/client';
import type { ManagedCommunity, CommunityAnalytics } from '../../types/api';

const communities = ref<ManagedCommunity[]>([]);
const selectedCommunityId = ref<string | null>(null);
const analytics = ref<CommunityAnalytics | null>(null);
const listLoading = ref(true);
const analyticsLoading = ref(false);
const listError = ref<string | null>(null);
const analyticsError = ref<string | null>(null);

const loadCommunities = async () => {
  listLoading.value = true;
  listError.value = null;
  try {
    communities.value = await fetchManagedCommunities();
    if (communities.value.length) {
      await onSelectCommunity(communities.value[0].id);
    }
  } catch (err) {
    listError.value = err instanceof Error ? err.message : 'コミュニティ一覧を取得できませんでした';
  } finally {
    listLoading.value = false;
  }
};

const onSelectCommunity = async (communityId: string) => {
  if (selectedCommunityId.value === communityId && analytics.value) return;
  selectedCommunityId.value = communityId;
  analyticsLoading.value = true;
  analyticsError.value = null;
  analytics.value = null;
  try {
    analytics.value = await fetchCommunityAnalytics(communityId);
  } catch (err) {
    analyticsError.value = err instanceof Error ? err.message : 'Analytics を取得できませんでした';
  } finally {
    analyticsLoading.value = false;
  }
};

onMounted(() => {
  loadCommunities();
});
</script>

<style scoped>
.console-dashboard {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(220px, 260px) 1fr;
  gap: 1.5rem;
}

.community-list {
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1rem;
  background: #fff;
}

.community-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.community-list li {
  padding: 0.5rem;
  border-radius: 0.5rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
}

.community-list li:hover {
  background: #f1f5f9;
}

.community-list li.active {
  background: #2563eb;
  color: white;
}

.analytics .cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.card {
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1rem;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

.label {
  margin: 0;
  color: #64748b;
  font-size: 0.85rem;
}

.value {
  margin: 0.4rem 0 0;
  font-size: 1.6rem;
  font-weight: 600;
  color: #0f172a;
}

.status {
  color: #475569;
}

.error {
  color: #b91c1c;
}

.muted {
  color: #94a3b8;
}
</style>
