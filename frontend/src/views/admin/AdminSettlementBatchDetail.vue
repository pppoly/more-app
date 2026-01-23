<template>
  <main class="admin-settlement-detail">
    <header class="page-head">
      <div>
        <p class="eyebrow">Settlement Batch</p>
        <h1>{{ batchId }}</h1>
        <p v-if="batch" class="subhead">
          期間: {{ formatDate(batch.periodFrom) }} → {{ formatDate(batch.periodTo) }} / 転送: {{ batch.settlementEnabled ? '有効' : 'dry-run' }}
        </p>
      </div>
      <div class="head-actions">
        <button class="ghost" type="button" :disabled="loading" @click="load">
          <span class="i-lucide-refresh-cw"></span> 更新
        </button>
        <button class="ghost" type="button" :disabled="downloading" @click="download">エクスポート</button>
        <button class="ghost danger" type="button" :disabled="retrying || !batch" @click="retry">retry</button>
      </div>
    </header>

    <section class="card">
      <div v-if="loading" class="empty">読み込み中…</div>
      <div v-else-if="error" class="empty error">{{ error }}</div>
      <div v-else-if="!batch" class="empty">データがありません。</div>
      <div v-else class="summary-grid">
        <div class="summary-item">
          <p>ステータス</p>
          <span class="pill" :class="statusClass(batch.status)">{{ batch.status }}</span>
        </div>
        <div class="summary-item">
          <p>trigger</p>
          <strong>{{ batch.triggerType || '—' }}</strong>
        </div>
        <div class="summary-item">
          <p>作成</p>
          <strong>{{ formatDate(batch.createdAt) }}</strong>
        </div>
        <div class="summary-item">
          <p>実行</p>
          <strong>{{ formatDate(batch.runAt) }}</strong>
        </div>
      </div>
    </section>

    <section v-if="batch" class="card">
      <div v-if="!batch.items.length" class="empty">結算項目がありません。</div>
      <div v-else class="card-list">
        <article v-for="item in batch.items" :key="item.itemId" class="item-card">
          <div class="card-top">
            <div>
              <p class="eyebrow">{{ item.communityName || item.hostId }}</p>
              <h3>¥{{ formatNumber(item.settleAmount) }} <span class="muted">/ balance ¥{{ formatNumber(item.hostBalance) }}</span></h3>
              <p class="meta">carry: ¥{{ formatNumber(item.carryReceivable) }}</p>
              <p class="meta">hostId: {{ item.hostId }}</p>
            </div>
            <span class="pill" :class="statusClass(item.status)">{{ item.status }}</span>
          </div>

          <div v-if="item.status === 'blocked' && item.blockedReasonCodes.length" class="reason">
            <p class="meta"><strong>blocked</strong></p>
            <ul class="reason-list">
              <li v-for="code in item.blockedReasonCodes" :key="code" class="meta">{{ reasonLabel(code) }}</li>
            </ul>
          </div>
          <div v-if="item.status === 'skipped' && item.skipReasonCodes.length" class="reason">
            <p class="meta"><strong>skipped</strong></p>
            <ul class="reason-list">
              <li v-for="code in item.skipReasonCodes" :key="code" class="meta">{{ reasonLabel(code) }}</li>
            </ul>
          </div>

          <div v-if="item.blockedReasonCodes.includes('dispute_open') && item.disputedPayments.length" class="reason">
            <p class="meta"><strong>dispute</strong></p>
            <ul class="reason-list">
              <li v-for="p in item.disputedPayments" :key="p.paymentId" class="meta">
                payment={{ p.paymentId }} / charge={{ p.stripeChargeId || '—' }} / dispute={{ p.stripeDisputeId || '—' }} ({{ p.stripeDisputeStatus || '—' }})
              </li>
            </ul>
          </div>

          <div v-if="item.status === 'failed'" class="reason">
            <p class="meta"><strong>failed</strong></p>
            <p class="meta">error: {{ item.errorMessage || '—' }}</p>
            <p class="meta">attempts: {{ item.attempts }} / next: {{ item.nextAttemptAt ? formatDate(item.nextAttemptAt) : '—' }}</p>
          </div>

          <p v-if="item.stripeTransferId" class="meta">transfer: {{ item.stripeTransferId }}</p>
          <p v-if="item.ruleOverrides && (item.ruleOverrides.settlementDelayDaysOverride || item.ruleOverrides.settlementMinTransferAmountOverride)" class="meta">
            override: delayDays={{ item.ruleOverrides.settlementDelayDaysOverride ?? '—' }} / minTransfer={{ item.ruleOverrides.settlementMinTransferAmountOverride ?? '—' }}
          </p>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { AdminSettlementBatchDetailResponse } from '../../types/api';
import { adminRetrySettlementBatch, fetchAdminSettlementBatch, fetchAdminSettlementBatchCsv } from '../../api/client';
import { useToast } from '../../composables/useToast';

const toast = useToast();
const route = useRoute();
const batchId = String(route.params.batchId || '');

const batch = ref<AdminSettlementBatchDetailResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const retrying = ref(false);
const downloading = ref(false);

const formatNumber = (val?: number | null) => new Intl.NumberFormat('ja-JP').format(val ?? 0);
const formatDate = (val: string) =>
  new Date(val).toLocaleString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const statusClass = (status: string) => {
  if (status === 'completed') return 'pill-live';
  if (status === 'pending' || status === 'processing') return 'pill-pending';
  if (status === 'dry_run') return 'pill-info';
  if (status === 'blocked') return 'pill-info';
  if (status === 'partial_failed') return 'pill-danger';
  if (status === 'failed') return 'pill-danger';
  return 'pill-info';
};

const reasonLabel = (code: string) => {
  if (code === 'account_not_onboarded') return 'Stripe onboarding 未完了のため保留';
  if (code === 'below_min_transfer_amount') return '最小振込額未満のため保留';
  if (code === 'frozen_by_ops') return '運営凍結のため保留';
  if (code === 'not_matured') return '結算待ち（event.endAt + N 日未到達）';
  if (code === 'dispute_open') return 'Dispute 未解決のため保留（該当 payment のみ）';
  if (code === 'missing_eligibility_source') return '紐付け情報不足（event/lesson endAt 不明）';
  if (code === 'blocked') return 'ルールにより保留';
  if (code === 'balance_non_positive') return '可転送残高が 0 以下のためスキップ';
  if (code === 'skipped') return '結算対象がないためスキップ';
  return code;
};

const load = async () => {
  if (!batchId) return;
  loading.value = true;
  error.value = null;
  try {
    batch.value = await fetchAdminSettlementBatch(batchId);
  } catch {
    error.value = 'ロードに失敗しました';
    toast.show('読み込みに失敗しました', 'error');
  } finally {
    loading.value = false;
  }
};

const retry = async () => {
  if (!batchId) return;
  retrying.value = true;
  try {
    await adminRetrySettlementBatch(batchId);
    toast.show('retry を実行しました', 'success');
    await load();
  } catch {
    toast.show('retry に失敗しました', 'error');
  } finally {
    retrying.value = false;
  }
};

const download = async () => {
  if (!batchId) return;
  downloading.value = true;
  try {
    const { blob, filename } = await fetchAdminSettlementBatchCsv(batchId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.show('エクスポートしました', 'success');
  } catch {
    toast.show('エクスポートに失敗しました', 'error');
  } finally {
    downloading.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.admin-settlement-detail {
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
  align-items: flex-start;
  gap: 12px;
}
.head-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
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
.ghost.danger {
  border-color: rgba(220, 38, 38, 0.35);
  color: #dc2626;
}
.card {
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}
.summary-item {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px;
}
.card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.item-card {
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
  gap: 10px;
}
.meta {
  margin: 0;
  font-size: 13px;
  color: #475569;
}
.muted {
  opacity: 0.75;
}
.empty {
  padding: 18px 0;
  text-align: center;
  color: #64748b;
}
.error {
  color: #dc2626;
}
.pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #f1f5f9;
}
.pill-live {
  background: rgba(34, 197, 94, 0.18);
  border-color: rgba(34, 197, 94, 0.35);
}
.pill-pending {
  background: rgba(37, 99, 235, 0.14);
  border-color: rgba(37, 99, 235, 0.28);
}
.pill-info {
  background: rgba(148, 163, 184, 0.22);
  border-color: rgba(148, 163, 184, 0.4);
}
.pill-danger {
  background: rgba(220, 38, 38, 0.16);
  border-color: rgba(220, 38, 38, 0.35);
}
.reason-list {
  margin: 6px 0 0;
  padding-left: 16px;
}
</style>
