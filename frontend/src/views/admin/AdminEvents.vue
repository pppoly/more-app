<template>
  <main class="admin-events">
    <header class="page-head">
      <div>
        <p class="eyebrow">イベント管理</p>
        <h1>Events</h1>
        <p class="subhead">ステータス別にフィルタし、審査/クローズ/キャンセルが可能です。</p>
      </div>
      <button class="ghost" type="button" :disabled="loading" @click="load">
        <span class="i-lucide-refresh-cw"></span> 更新
      </button>
    </header>

    <section class="filters card">
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
      <button class="primary" type="button" :disabled="loading" @click="load">適用</button>
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
            <button class="ghost" type="button" :disabled="busyId === item.id" @click="approve(item.id)">承認</button>
            <button class="ghost danger" type="button" :disabled="busyId === item.id" @click="openReject(item.id)">
              差し戻し
            </button>
            <button class="ghost" type="button" :disabled="busyId === item.id" @click="closeEvent(item.id)">クローズ</button>
            <button class="ghost danger" type="button" :disabled="busyId === item.id" @click="cancelEvent(item.id)">
              キャンセル
            </button>
          </div>
        </article>
      </div>
    </section>

    <div v-if="rejectTarget" class="modal" @click.self="closeReject">
      <div class="modal-body">
        <h3>差し戻し理由</h3>
        <textarea v-model="rejectReason" rows="4" placeholder="例: 内容が不足しています"></textarea>
        <div class="modal-actions">
          <button class="ghost" type="button" @click="closeReject">キャンセル</button>
          <button class="primary danger" type="button" :disabled="busyId === rejectTarget" @click="submitReject">
            送信
          </button>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { adminApproveEvent, adminCancelEvent, adminCloseEvent, adminRejectEvent, fetchAdminEvents } from '../../api/client';
import { getLocalizedText } from '../../utils/i18nContent';

interface AdminEventItem {
  id: string;
  title: any;
  status: string;
  reviewStatus?: string | null;
  reviewReason?: string | null;
  updatedAt: string;
  community?: { id: string; name: string } | null;
}

const items = ref<AdminEventItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const busyId = ref<string | null>(null);
const filters = ref<{ status?: string }>({});
const rejectTarget = ref<string | null>(null);
const rejectReason = ref('');

const getText = (val: any) => getLocalizedText(val) || '無題';
const formatDate = (val: string) =>
  new Date(val).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const statusClass = (status?: string | null) => {
  if (status === 'approved') return 'pill-live';
  if (status === 'rejected') return 'pill-danger';
  if (status === 'pending_review') return 'pill-pending';
  return '';
};

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetchAdminEvents({ status: filters.value.status });
    items.value = res.items ?? res;
  } catch (err) {
    error.value = 'ロードに失敗しました';
  } finally {
    loading.value = false;
  }
};

const approve = async (id: string) => {
  busyId.value = id;
  try {
    await adminApproveEvent(id);
    await load();
  } catch (err) {
    error.value = '承認に失敗しました';
  } finally {
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
const submitReject = async () => {
  if (!rejectTarget.value) return;
  busyId.value = rejectTarget.value;
  try {
    await adminRejectEvent(rejectTarget.value, rejectReason.value || undefined);
    closeReject();
    await load();
  } catch (err) {
    error.value = '差し戻しに失敗しました';
  } finally {
    busyId.value = null;
  }
};

const closeEvent = async (id: string) => {
  busyId.value = id;
  try {
    await adminCloseEvent(id);
    await load();
  } catch (err) {
    error.value = 'クローズに失敗しました';
  } finally {
    busyId.value = null;
  }
};

const cancelEvent = async (id: string) => {
  busyId.value = id;
  try {
    await adminCancelEvent(id, '運営によるキャンセル');
    await load();
  } catch (err) {
    error.value = 'キャンセルに失敗しました';
  } finally {
    busyId.value = null;
  }
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
.event-card {
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
.title-block h3 {
  margin: 4px 0 0;
  font-size: 16px;
  line-height: 1.4;
}
.chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.filters {
  display: flex;
  gap: 10px;
  align-items: center;
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
.actions button {
  margin-left: 6px;
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
</style>
