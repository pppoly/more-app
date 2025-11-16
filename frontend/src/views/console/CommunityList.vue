<template>
  <section class="console-section">
    <header class="section-header">
      <div>
        <h2>私のコミュニティ</h2>
        <p>管理中のコミュニティを一覧できます。</p>
      </div>
      <RouterLink class="primary" to="/console/communities/new">＋ 新規コミュニティ</RouterLink>
    </header>

    <p v-if="loading" class="status">読み込み中…</p>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <template v-else>
      <table class="community-table" v-if="communities.length">
        <thead>
          <tr>
            <th>名称</th>
            <th>Slug</th>
            <th>ラベル</th>
            <th>公開設定</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="community in communities" :key="community.id">
            <td>{{ community.name }}</td>
            <td>{{ community.slug }}</td>
            <td>{{ community.labels?.join(', ') }}</td>
            <td>{{ community.visibleLevel }}</td>
            <td class="actions">
              <RouterLink :to="`/console/communities/${community.id}/events`">管理</RouterLink>
              <RouterLink :to="`/console/communities/${community.id}/edit`">編集</RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">管理コミュニティがまだありません。まずは新規作成してみましょう。</div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
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
</script>

<style scoped>
.console-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.primary {
  padding: 0.4rem 0.9rem;
  border-radius: 0.5rem;
  background: #2563eb;
  color: #fff;
  text-decoration: none;
}

.community-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border-radius: 0.75rem;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.community-table th,
.community-table td {
  padding: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}

.community-table tbody tr:last-child td {
  border-bottom: none;
}

.actions a {
  margin-right: 0.5rem;
  color: #2563eb;
  text-decoration: none;
}

.status {
  color: #475569;
}

.error {
  color: #b91c1c;
}

.empty {
  border: 1px dashed #cbd5f5;
  padding: 1rem;
  border-radius: 0.5rem;
  color: #475569;
}
</style>
