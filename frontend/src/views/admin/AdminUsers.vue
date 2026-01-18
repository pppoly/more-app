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
          キーワード
          <input
            v-model="filters.q"
            type="search"
            placeholder="name / email"
            @keyup.enter="load"
          />
        </label>
        <label>
          Status
          <select v-model="filters.status">
            <option value="">すべて</option>
            <option value="active">active</option>
            <option value="banned">banned</option>
          </select>
        </label>
        <label>
          主催者
          <select v-model="filters.isOrganizer">
            <option value="">すべて</option>
            <option value="true">主催者のみ</option>
            <option value="false">主催者以外</option>
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
            <button class="ghost" type="button" @click="openDetail(item)">詳細を見る</button>
            <button class="ghost danger" type="button" :disabled="busyId === item.id" @click="openConfirm(item)">
              {{ item.status === 'banned' ? '解除' : '封禁' }}
            </button>
            <button
              class="ghost"
              type="button"
              :disabled="busyId === item.id"
              @click="openOrganizerConfirm(item)"
            >
              {{ item.isOrganizer ? '主催者解除' : '主催者にする' }}
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

    <AdminConfirmModal
      :open="!!confirmTarget"
      :title="confirmTarget?.status === 'banned' ? '封禁を解除しますか？' : '封禁しますか？'"
      :message="confirmTarget ? `${confirmTarget.email || confirmTarget.name || confirmTarget.id}` : ''"
      :loading="busyId === confirmTarget?.id"
      @close="confirmTarget = null"
      @confirm="submitConfirm"
    />
    <AdminConfirmModal
      :open="!!organizerTarget"
      :title="organizerTarget?.isOrganizer ? '主催者権限を解除しますか？' : '主催者にしますか？'"
      :message="organizerTarget ? `${organizerTarget.email || organizerTarget.name || organizerTarget.id}` : ''"
      :loading="busyId === organizerTarget?.id"
      @close="organizerTarget = null"
      @confirm="submitOrganizerConfirm"
    />

    <div v-if="detailTarget" class="modal" @click.self="closeDetail">
      <div class="modal-body detail">
        <div class="modal-head">
          <div>
            <p class="eyebrow">{{ detailTarget.email || '—' }}</p>
            <h3>{{ detailTarget.name || '—' }}</h3>
            <p class="meta">作成: {{ formatDate(detailTarget.createdAt) }}</p>
          </div>
          <button class="icon-button" type="button" @click="closeDetail" aria-label="close">
            <span class="i-lucide-x"></span>
          </button>
        </div>
        <div class="chips">
          <span class="pill" :class="detailTarget.status === 'banned' ? 'pill-danger' : 'pill-live'">
            {{ detailTarget.status }}
          </span>
          <span class="pill" :class="detailTarget.isAdmin ? 'pill-live' : 'pill-info'">
            {{ detailTarget.isAdmin ? 'Admin' : 'User' }}
          </span>
          <span class="pill" :class="detailTarget.isOrganizer ? 'pill-live' : 'pill-info'">
            {{ detailTarget.isOrganizer ? 'Organizer' : 'Member' }}
          </span>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { adminListUsers, adminUpdateUserStatus, adminUpdateUserOrganizer } from '../../api/client';
import { useToast } from '../../composables/useToast';
import AdminConfirmModal from '../../components/admin/AdminConfirmModal.vue';

interface AdminUserItem {
  id: string;
  name?: string | null;
  email?: string | null;
  isAdmin?: boolean;
  isOrganizer?: boolean;
  status?: string;
  createdAt: string;
}

const toast = useToast();
const items = ref<AdminUserItem[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref<string | null>(null);
const filters = ref<{ status?: string; q?: string; isOrganizer?: string }>({});
const busyId = ref<string | null>(null);
const confirmTarget = ref<AdminUserItem | null>(null);
const detailTarget = ref<AdminUserItem | null>(null);
const organizerTarget = ref<AdminUserItem | null>(null);
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const hasMore = computed(() => items.value.length < total.value);

const formatDate = (val: string) =>
  new Date(val).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

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
    const res = await adminListUsers({
      status: filters.value.status,
      q: filters.value.q?.trim() || undefined,
      isOrganizer: filters.value.isOrganizer || undefined,
      page: page.value,
      pageSize,
    });
    const list = res.items ?? [];
    total.value = res.total ?? list.length;
    items.value = reset ? list : [...items.value, ...list];
    const fetched = list.length;
    if (items.value.length < total.value && fetched > 0) {
      page.value += 1;
    } else if (items.value.length >= total.value) {
      page.value = Math.max(1, page.value);
    }
  } catch (err) {
    error.value = 'ロードに失敗しました';
    toast.show('読み込みに失敗しました', 'error');
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const loadMore = () => {
  if (loading.value || loadingMore.value || !hasMore.value) return;
  void load(false);
};

const openConfirm = (item: AdminUserItem) => {
  confirmTarget.value = item;
};

const submitConfirm = async () => {
  if (!confirmTarget.value) return;
  const targetStatus = confirmTarget.value.status === 'banned' ? 'active' : 'banned';
  busyId.value = confirmTarget.value.id;
  try {
    await adminUpdateUserStatus(confirmTarget.value.id, targetStatus);
    await load();
    toast.show('更新しました', 'success');
  } catch (err) {
    error.value = '更新に失敗しました';
    toast.show('更新に失敗しました', 'error');
  } finally {
    confirmTarget.value = null;
    busyId.value = null;
  }
};

const openOrganizerConfirm = (item: AdminUserItem) => {
  organizerTarget.value = item;
};

const submitOrganizerConfirm = async () => {
  if (!organizerTarget.value) return;
  const next = !organizerTarget.value.isOrganizer;
  busyId.value = organizerTarget.value.id;
  try {
    await adminUpdateUserOrganizer(organizerTarget.value.id, next);
    await load();
    toast.show('更新しました', 'success');
  } catch (err) {
    error.value = '更新に失敗しました';
    toast.show('更新に失敗しました', 'error');
  } finally {
    organizerTarget.value = null;
    busyId.value = null;
  }
};

const openDetail = (item: AdminUserItem) => {
  detailTarget.value = item;
};
const closeDetail = () => {
  detailTarget.value = null;
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
.modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: grid;
  place-items: center;
  z-index: 20;
  padding: 16px;
}
.modal-body {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.icon-button {
  border: none;
  background: transparent;
  padding: 4px;
  cursor: pointer;
}
</style>
