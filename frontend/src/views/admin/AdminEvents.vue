<template>
  <main class="admin-events">
    <header class="page-head">
      <div>
        <p class="eyebrow">イベント管理</p>
        <h1>Events</h1>
        <p class="subhead">ステータス別にフィルタし、審査/クローズ/キャンセルが可能です。</p>
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
            placeholder="event id / community name"
            @keyup.enter="load(true)"
          />
        </label>
        <label>
          Status
          <select v-model="filters.status">
            <option value="">すべて</option>
            <option value="draft">draft</option>
            <option value="pending_review">pending_review</option>
            <option value="rejected">rejected</option>
            <option value="open">open</option>
            <option value="closed">closed</option>
            <option value="cancelled">cancelled</option>
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
        <article v-for="item in items" :key="item.id" class="event-card">
          <div class="card-top">
            <div class="title-block">
              <p class="eyebrow">{{ item.community?.name || '—' }}</p>
              <h3>{{ getText(item.title) }}</h3>
            </div>
            <div class="chips">
              <span class="pill pill-soft">{{ item.status }}</span>
              <span class="pill" :class="statusClass(item.reviewStatus)">{{ item.reviewStatus || '—' }}</span>
            </div>
          </div>
          <p class="meta">更新: {{ formatDate(item.updatedAt) }}</p>
          <p v-if="item.reviewReason" class="muted small">{{ item.reviewReason }}</p>
          <div class="actions">
            <button class="ghost" type="button" @click="openDetail(item)">詳細を見る</button>
            <button class="ghost" type="button" :disabled="busyId === item.id" @click="openApprove(item)">承認</button>
            <button class="ghost danger" type="button" :disabled="busyId === item.id" @click="openReject(item.id)">
              差し戻し
            </button>
            <button class="ghost" type="button" :disabled="busyId === item.id" @click="openClose(item)">クローズ</button>
            <button class="ghost danger" type="button" :disabled="busyId === item.id" @click="openCancel(item)">
              キャンセル
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

    <div v-if="rejectTarget" class="modal" @click.self="closeReject">
      <div class="modal-body">
        <h3>差し戻し理由</h3>
        <textarea v-model="rejectReason" rows="4" placeholder="例: 内容が不足しています"></textarea>
        <div class="modal-actions">
          <button class="ghost" type="button" @click="closeReject">キャンセル</button>
          <button class="primary danger" type="button" :disabled="busyId === rejectTarget" @click="confirmReject">
            送信
          </button>
        </div>
      </div>
    </div>

    <AdminConfirmModal
      :open="!!confirmAction"
      :title="confirmAction?.title || ''"
      :message="confirmAction?.message || ''"
      :loading="busyId === confirmAction?.id"
      @close="confirmAction = null"
      @confirm="performConfirm"
    />

    <div v-if="detailTarget" class="modal" @click.self="closeDetail">
      <div class="modal-body detail">
        <div class="modal-head">
          <div>
            <p class="eyebrow">{{ detailTarget.community?.name || '—' }}</p>
            <h3>{{ getText(detailTarget.title) }}</h3>
            <p class="meta">更新: {{ formatDate(detailTarget.updatedAt) }}</p>
          </div>
          <button class="icon-button" type="button" @click="closeDetail" aria-label="close">
            <span class="i-lucide-x"></span>
          </button>
        </div>
        <p class="reason muted" v-if="detailTarget.reviewReason">レビュー: {{ detailTarget.reviewReason }}</p>
        <div class="chips">
          <span class="pill pill-soft">{{ detailTarget.status }}</span>
          <span class="pill" :class="statusClass(detailTarget.reviewStatus)">{{ detailTarget.reviewStatus || '—' }}</span>
        </div>
        <RouterLink
          class="ghost"
          :to="{ name: 'event-detail', params: { eventId: detailTarget.id } }"
          target="_blank"
          rel="noopener"
        >
          ユーザー表示で開く
        </RouterLink>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { adminApproveEvent, adminCancelEvent, adminCloseEvent, adminRejectEvent, fetchAdminEvents } from '../../api/client';
import { getLocalizedText } from '../../utils/i18nContent';
import { useToast } from '../../composables/useToast';
import AdminConfirmModal from '../../components/admin/AdminConfirmModal.vue';

interface AdminEventItem {
  id: string;
  title: any;
  status: string;
  reviewStatus?: string | null;
  reviewReason?: string | null;
  updatedAt: string;
  community?: { id: string; name: string } | null;
}

const toast = useToast();
const items = ref<AdminEventItem[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref<string | null>(null);
const busyId = ref<string | null>(null);
const filters = ref<{ status?: string; q?: string }>({});
const rejectTarget = ref<string | null>(null);
const rejectReason = ref('');
const confirmAction = ref<
  { id: string; action: 'approve' | 'reject' | 'close' | 'cancel'; title: string; message: string } | null
>(null);
const detailTarget = ref<AdminEventItem | null>(null);
const page = ref(1);
const pageSize = 12;
const total = ref(0);
const hasMore = computed(() => items.value.length < total.value);

const getText = (val: any) => getLocalizedText(val) || '無題';
const formatDate = (val: string) =>
  new Date(val).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const statusClass = (status?: string | null) => {
  if (status === 'approved') return 'pill-live';
  if (status === 'rejected') return 'pill-danger';
  if (status === 'pending_review') return 'pill-pending';
  return '';
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
    const res = await fetchAdminEvents({
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

const openApprove = (item: AdminEventItem) => {
  confirmAction.value = {
    id: item.id,
    action: 'approve',
    title: '承認しますか？',
    message: `「${getText(item.title)}」を承認します。`,
  };
};
const openClose = (item: AdminEventItem) => {
  confirmAction.value = {
    id: item.id,
    action: 'close',
    title: 'クローズしますか？',
    message: `「${getText(item.title)}」をクローズします。`,
  };
};
const openCancel = (item: AdminEventItem) => {
  confirmAction.value = {
    id: item.id,
    action: 'cancel',
    title: 'キャンセルしますか？',
    message: `「${getText(item.title)}」をキャンセルします。`,
  };
};

const performConfirm = async () => {
  if (!confirmAction.value) return;
  const { id, action } = confirmAction.value;
  busyId.value = id;
  try {
    if (action === 'approve') await adminApproveEvent(id);
    if (action === 'close') await adminCloseEvent(id);
    if (action === 'cancel') await adminCancelEvent(id, '管理操作によるキャンセル');
    if (action === 'reject') await adminRejectEvent(id, rejectReason.value || '管理操作');
    await load();
    toast.show('処理が完了しました', 'success');
  } catch (err) {
    error.value = '処理に失敗しました';
    toast.show('処理に失敗しました', 'error');
  } finally {
    confirmAction.value = null;
    busyId.value = null;
  }
};

const openReject = (id: string) => {
  rejectTarget.value = id;
  rejectReason.value = '';
};
const closeReject = () => {
  rejectTarget.value = null;
  rejectReason.value = '';
};
const confirmReject = () => {
  if (!rejectReason.value.trim()) {
    error.value = '理由を入力してください';
    toast.show('理由を入力してください', 'error');
    return;
  }
  confirmAction.value = {
    id: rejectTarget.value as string,
    action: 'reject',
    title: '差し戻しますか？',
    message: rejectReason.value,
  };
};
const submitReject = async () => {
  if (!rejectTarget.value || !rejectReason.value.trim()) {
    error.value = '理由を入力してください';
    toast.show('理由を入力してください', 'error');
    return;
  }
  busyId.value = rejectTarget.value;
  try {
    await adminRejectEvent(rejectTarget.value, rejectReason.value.trim());
    closeReject();
    await load();
    toast.show('差し戻しました', 'success');
  } catch (err) {
    error.value = '差し戻しに失敗しました';
    toast.show('差し戻しに失敗しました', 'error');
  } finally {
    busyId.value = null;
  }
};

const openDetail = (item: AdminEventItem) => {
  detailTarget.value = item;
};
const closeDetail = () => {
  detailTarget.value = null;
};

onMounted(load);
</script>

<style scoped>
.admin-events {
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
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 10px;
}
.event-card {
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
  align-items: flex-start;
  gap: 8px;
}
.title-block h3 {
  margin: 4px 0 0;
  font-size: 15px;
  line-height: 1.35;
}
.chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.filters {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.filter-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
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
.pill-soft {
  background: #f1f5f9;
  color: #0f172a;
}
.pill-danger {
  background: #fef2f2;
  color: #b91c1c;
}
.pill-pending {
  background: #fff7ed;
  color: #c2410c;
}
.pill-live {
  background: #ecfdf3;
  color: #15803d;
}
.muted {
  color: #94a3b8;
  font-size: 12px;
}
.small {
  font-size: 13px;
}
.actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.actions .danger {
  color: #b91c1c;
  border-color: rgba(185, 28, 28, 0.3);
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
  gap: 12px;
}
.modal-body.detail {
  gap: 8px;
}
.modal-body textarea {
  width: 100%;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  padding: 10px;
  font-size: 14px;
  min-height: 120px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.primary.danger {
  background: linear-gradient(135deg, #ef4444, #f97316);
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
