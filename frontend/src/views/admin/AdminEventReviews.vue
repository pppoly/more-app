<template>
  <main class="admin-reviews">
    <header class="page-head">
      <div>
        <p class="eyebrow">イベント審査</p>
        <h1>未承認イベント</h1>
        <p class="subhead">pending / rejected のイベントを確認し、承認または差し戻しできます。</p>
      </div>
      <button class="ghost" type="button" :disabled="loading" @click="load">
        <span class="i-lucide-refresh-cw"></span> 更新
      </button>
    </header>

    <section class="card">
      <div v-if="loading" class="empty">読み込み中…</div>
      <div v-else-if="error" class="empty error">{{ error }}</div>
      <div v-else-if="!items.length" class="empty">審査待ちのイベントはありません。</div>
      <div v-else class="card-list">
        <article v-for="item in items" :key="item.id" class="review-card">
          <div class="card-top">
            <div class="title-block">
              <p class="eyebrow">{{ item.community?.name || '—' }}</p>
              <h3>{{ getText(item.title) }}</h3>
            </div>
            <span class="pill" :class="statusClass(item.reviewStatus || item.status)">
              {{ statusLabel(item.reviewStatus || item.status) }}
            </span>
          </div>
          <p class="meta">更新: {{ formatDate(item.updatedAt) }}</p>
          <p class="reason" v-if="item.reviewReason">{{ item.reviewReason }}</p>
          <p class="reason muted" v-else>理由未記入</p>
          <div class="actions">
            <button class="primary ghost" type="button" :disabled="busyId === item.id" @click="approve(item.id)">
              承認
            </button>
            <button class="ghost danger" type="button" :disabled="busyId === item.id" @click="openReject(item.id)">
              差し戻し
            </button>
          </div>
        </article>
      </div>
    </section>

    <div v-if="rejectTarget" class="modal" @click.self="closeReject">
      <div class="modal-body">
        <h3>差し戻し理由</h3>
        <textarea v-model="rejectReason" rows="4" placeholder="例: 位置情報が不足しています。"></textarea>
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
import type { AdminEventReviewItem } from '../../types/api';
import { adminApproveEvent, adminRejectEvent, fetchAdminEventReviews } from '../../api/client';
import { getLocalizedText } from '../../utils/i18nContent';

const items = ref<AdminEventReviewItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const busyId = ref<string | null>(null);
const rejectTarget = ref<string | null>(null);
const rejectReason = ref('');

const getText = (val: any) => getLocalizedText(val) || '無題';
const formatDate = (val: string) =>
  new Date(val).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const statusLabel = (status?: string | null) => {
  switch (status) {
    case 'approved':
      return '承認';
    case 'rejected':
      return '差し戻し';
    case 'pending_review':
    default:
      return '審査中';
  }
};
const statusClass = (status?: string | null) => {
  if (status === 'approved') return 'pill-live';
  if (status === 'rejected') return 'pill-danger';
  return 'pill-pending';
};

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    items.value = await fetchAdminEventReviews();
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

onMounted(load);
</script>

<style scoped>
.admin-reviews {
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
.review-card {
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
  gap: 8px;
  align-items: flex-start;
}
.title-block h3 {
  margin: 4px 0 0;
  font-size: 16px;
  line-height: 1.4;
  color: #0f172a;
}
.meta {
  font-size: 12px;
  color: #475569;
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
.pill-danger {
  background: #fef2f2;
  color: #b91c1c;
}
.pill-pending {
  background: #fff7ed;
  color: #c2410c;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.reason {
  font-size: 13px;
  color: #0f172a;
}
.reason.muted {
  color: #94a3b8;
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
.primary {
  border: none;
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  border-radius: 10px;
  padding: 10px 16px;
  font-weight: 700;
}
.primary.danger {
  background: linear-gradient(135deg, #ef4444, #f97316);
}
</style>
