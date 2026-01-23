<template>
  <main class="admin-communities">
    <header class="page-head">
      <div>
        <p class="eyebrow">コミュニティ管理</p>
        <h1>Communities</h1>
        <p class="subhead">プラン・Stripe連携・公開状態の確認と停用/有効化</p>
      </div>
      <button class="ghost" type="button" :disabled="loading" @click="load(true)">
        <span class="i-lucide-refresh-cw"></span> 更新
      </button>
    </header>

    <section class="filters card">
      <div class="filter-row">
        <label>
          キーワード
          <input
            v-model="filters.q"
            type="search"
            placeholder="name / slug / id"
            @keyup.enter="load(true)"
          />
        </label>
        <label>
          Status
          <select v-model="filters.status">
            <option value="">すべて</option>
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
        </label>
      </div>
      <button class="primary full" type="button" :disabled="loading" @click="load(true)">適用</button>
    </section>

    <section class="card">
      <div v-if="loading" class="empty">読み込み中…</div>
      <div v-else-if="error" class="empty error">{{ error }}</div>
      <div v-else-if="!items.length" class="empty">データがありません。</div>
      <div v-else class="card-list">
        <article v-for="item in items" :key="item.id" class="community-card">
          <div class="card-top">
            <div>
              <p class="eyebrow">{{ item.slug }}</p>
              <h3>{{ item.name }}</h3>
            </div>
            <span class="pill" :class="item.status === 'disabled' ? 'pill-danger' : 'pill-live'">{{ item.status }}</span>
          </div>
          <div class="chips">
            <span class="pill pill-info">プラン: {{ planLabel(item.pricingPlanId) }}</span>
            <span class="pill" :class="item.stripeAccountOnboarded ? 'pill-live' : 'pill-pending'">
              {{ item.stripeAccountOnboarded ? 'Onboarded' : '未連携' }}
            </span>
          </div>
          <p class="meta">作成: {{ formatDate(item.createdAt) }}</p>
          <div class="actions">
            <button
              class="ghost danger"
              type="button"
              :disabled="busyId === item.id"
              @click="toggleStatus(item)"
            >
              {{ item.status === 'disabled' ? '有効化' : '停用' }}
            </button>
          </div>
        </article>
        <button
          v-if="hasMore"
          class="ghost full"
          type="button"
          :disabled="loading || loadingMore"
          @click="loadMore"
        >
          さらに読み込む
        </button>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { adminListCommunities, adminUpdateCommunityStatus } from '../../api/client';

interface AdminCommunityItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  pricingPlanId?: string | null;
  stripeAccountId?: string | null;
  stripeAccountOnboarded?: boolean | null;
  createdAt: string;
}

const items = ref<AdminCommunityItem[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref<string | null>(null);
const filters = ref<{ status?: string; q?: string }>({});
const busyId = ref<string | null>(null);
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const hasMore = computed(() => items.value.length < total.value);

const formatDate = (val: string) =>
  new Date(val).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const planLabel = (planId?: string | null) => {
  const key = (planId || '').toLowerCase();
  if (key.includes('pro')) return 'Pro';
  if (key.includes('starter')) return 'Starter';
  if (key.includes('free')) return 'Free';
  return planId || 'Free';
};

const load = async (reset = true) => {
  if (reset) {
    loading.value = true;
    page.value = 1;
    items.value = [];
    total.value = 0;
  } else {
    loadingMore.value = true;
  }
  error.value = null;
  try {
    const res = await adminListCommunities({
      status: filters.value.status,
      q: filters.value.q?.trim() || undefined,
      page: page.value,
      pageSize,
    });
    const list = res.items ?? [];
    total.value = res.total ?? list.length;
    items.value = reset ? list : [...items.value, ...list];
    const fetched = list.length;
    if (items.value.length < total.value && fetched > 0) {
      page.value += 1;
    }
  } catch (err) {
    error.value = 'ロードに失敗しました';
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const loadMore = () => {
  if (loading.value || loadingMore.value || !hasMore.value) return;
  void load(false);
};

const toggleStatus = async (item: AdminCommunityItem) => {
  busyId.value = item.id;
  const next = item.status === 'disabled' ? 'active' : 'disabled';
  try {
    await adminUpdateCommunityStatus(item.id, next);
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
.admin-communities {
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
.ghost {
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  border-radius: 10px;
  padding: 8px 12px;
}
.ghost.full {
  width: 100%;
  text-align: center;
}
.card {
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
}
.card-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 10px;
}
.community-card {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.card-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}
.card-top h3 {
  margin: 2px 0 0;
  font-size: 15px;
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
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}
.filters input,
.filters select {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px;
  width: 100%;
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
}
.pill-live {
  background: #ecfdf3;
  color: #15803d;
}
.pill-pending {
  background: #fff7ed;
  color: #c2410c;
}
.pill-danger {
  background: #fef2f2;
  color: #b91c1c;
}
.actions button {
  margin-left: 6px;
}
.actions {
  display: flex;
  justify-content: flex-end;
}
.danger {
  border-color: rgba(185, 28, 28, 0.4);
  color: #b91c1c;
}
</style>
