<template>
  <main class="admin-users">
    <header class="page-head">
      <div>
        <p class="eyebrow">ユーザー管理</p>
        <h1>Users</h1>
        <p class="subhead">封禁/活性化・ロール確認</p>
      </div>
      <button class="ghost" type="button" :disabled="loading" @click="load">
        <span class="i-lucide-refresh-cw"></span> 更新
      </button>
    </header>

    <section class="filters card">
      <div class="filter-row">
        <label>
          Status
          <select v-model="filters.status">
            <option value="">すべて</option>
            <option value="active">active</option>
            <option value="banned">banned</option>
          </select>
        </label>
      </div>
      <button class="primary full" type="button" :disabled="loading" @click="load">適用</button>
    </section>

    <section class="card">
      <div v-if="loading" class="empty">読み込み中…</div>
      <div v-else-if="error" class="empty error">{{ error }}</div>
      <div v-else-if="!items.length" class="empty">データがありません。</div>
      <div v-else class="card-list">
        <article v-for="item in items" :key="item.id" class="user-card">
          <div class="card-top">
            <div>
              <p class="eyebrow">{{ item.email || '—' }}</p>
              <h3>{{ item.name || '—' }}</h3>
            </div>
            <span class="pill" :class="item.status === 'banned' ? 'pill-danger' : 'pill-live'">{{ item.status }}</span>
          </div>
          <div class="chips">
            <span class="pill" :class="item.isAdmin ? 'pill-live' : 'pill-info'">{{ item.isAdmin ? 'Admin' : 'User' }}</span>
            <span class="pill" :class="item.isOrganizer ? 'pill-live' : 'pill-info'">
              {{ item.isOrganizer ? 'Organizer' : 'Member' }}
            </span>
          </div>
          <p class="meta">作成: {{ formatDate(item.createdAt) }}</p>
          <div class="actions">
            <button
              class="ghost danger"
              type="button"
              :disabled="busyId === item.id"
              @click="updateStatus(item.id, item.status === 'banned' ? 'active' : 'banned')"
            >
              {{ item.status === 'banned' ? '解除' : '封禁' }}
            </button>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { adminListUsers, adminUpdateUserStatus } from '../../api/client';

interface AdminUserItem {
  id: string;
  name?: string | null;
  email?: string | null;
  isAdmin?: boolean;
  isOrganizer?: boolean;
  status?: string;
  createdAt: string;
}

const items = ref<AdminUserItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const filters = ref<{ status?: string }>({});
const busyId = ref<string | null>(null);

const formatDate = (val: string) =>
  new Date(val).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    items.value = await adminListUsers({ status: filters.value.status });
  } catch (err) {
    error.value = 'ロードに失敗しました';
  } finally {
    loading.value = false;
  }
};

const updateStatus = async (id: string, status: string) => {
  busyId.value = id;
  try {
    await adminUpdateUserStatus(id, status);
    await load();
  } catch (err) {
    error.value = '更新に失敗しました';
  } finally {
    busyId.value = null;
  }
};

onMounted(load);
</script>

<style scoped>
.admin-users {
  min-height: 100vh;
  padding: 16px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #0f172a;
}
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.page-head h1 {
  margin: 4px 0;
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
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
}
.card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.user-card {
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
  gap: 10px;
  align-items: flex-start;
}
.chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.meta {
  font-size: 12px;
  color: #475569;
}
.filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.filter-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}
.filters select {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px;
}
.primary {
  border: none;
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  border-radius: 10px;
  padding: 8px 12px;
  font-weight: 700;
  min-width: 120px;
}
.primary.full {
  width: 100%;
}
.empty {
  padding: 18px;
  color: #475569;
}
.empty.error {
  color: #b91c1c;
}
.pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
  margin-right: 4px;
}
.pill-live {
  background: #ecfdf3;
  color: #15803d;
}
.pill-info {
  background: #eef2ff;
  color: #312e81;
}
.pill-danger {
  background: #fef2f2;
  color: #b91c1c;
}
.danger {
  border-color: rgba(185, 28, 28, 0.4);
  color: #b91c1c;
}
</style>
