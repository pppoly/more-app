<template>
  <main class="admin-payments">
    <header class="page-head">
      <div>
        <p class="eyebrow">決済モニター</p>
        <h1>Payments</h1>
        <p class="subhead">プラットフォーム手数料とステータスを一覧で確認できます。</p>
      </div>
      <button class="ghost" type="button" :disabled="loading" @click="load">
        <span class="i-lucide-refresh-cw"></span> 更新
      </button>
    </header>

    <section class="filters card">
      <div class="filter-row">
        <label>
          Community ID
          <input v-model="filters.communityId" type="text" placeholder="コミュニティID" />
        </label>
        <label>
          Status
          <select v-model="filters.status">
            <option value="">すべて</option>
            <option value="paid">paid</option>
            <option value="pending">pending</option>
            <option value="failed">failed</option>
            <option value="refunded">refunded</option>
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
        <article v-for="item in visibleItems" :key="item.id" class="payment-card">
          <div class="card-top">
            <div>
              <p class="eyebrow">{{ item.community?.name || item.community?.id || '—' }}</p>
              <h3>¥{{ formatNumber(item.amount) }}</h3>
              <p class="meta">方法: {{ item.method }}</p>
            </div>
            <span class="pill" :class="statusClass(item.status)">{{ item.status }}</span>
          </div>
          <p class="meta">イベント: {{ item.event?.title || '—' }}</p>
          <p class="meta">ユーザー: {{ item.user?.name || item.user?.id || '—' }}</p>
          <p class="meta">
            プラットフォーム手数料: ¥{{ formatNumber(item.platformFee) }}
            <span v-if="item.feePercent !== null" class="muted">({{ item.feePercent }}%)</span>
          </p>
          <p class="meta">
            結算: {{ item.eligibilityStatus || '—' }} / {{ item.payoutStatus || '—' }} / {{
              item.reasonCode || '—'
            }}
          </p>
          <p class="meta">作成: {{ formatDate(item.createdAt) }}</p>
          <div class="actions">
            <button class="ghost" type="button" :disabled="busyId === item.id" @click="diagnose(item.id)">診断</button>
            <button
              class="ghost danger"
              type="button"
              :disabled="busyId === item.id || item.status === 'refunded'"
              @click="openRefund(item)"
            >
              返金
            </button>
          </div>
        </article>
        <button v-if="canLoadMore" class="ghost full" type="button" :disabled="loading" @click="loadMore">
          さらに読み込む
        </button>
      </div>
    </section>

    <AdminConfirmModal
      :open="!!refundTarget"
      title="返金しますか？"
      :message="refundTarget ? `支払い ${refundTarget.id} を返金します。` : ''"
      :loading="busyId === refundTarget?.id"
      @close="refundTarget = null"
      @confirm="refund"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ConsolePaymentItem } from '../../types/api';
import { adminDiagnosePayment, adminRefundPayment, fetchAdminPayments } from '../../api/client';
import { useToast } from '../../composables/useToast';
import AdminConfirmModal from '../../components/admin/AdminConfirmModal.vue';

const toast = useToast();
const items = ref<ConsolePaymentItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const filters = ref<{ communityId?: string; status?: string }>({});
const busyId = ref<string | null>(null);
const refundTarget = ref<ConsolePaymentItem | null>(null);
const page = ref(1);
const pageSize = 10;
const visibleItems = computed(() => items.value.slice(0, page.value * pageSize));
const canLoadMore = computed(() => visibleItems.value.length < items.value.length);

const formatNumber = (val?: number | null) => new Intl.NumberFormat('ja-JP').format(val ?? 0);
const formatDate = (val: string) =>
  new Date(val).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const statusClass = (status: string) => {
  if (status === 'paid') return 'pill-live';
  if (status === 'pending') return 'pill-pending';
  if (status === 'refunded') return 'pill-info';
  return 'pill-danger';
};

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetchAdminPayments({
      communityId: filters.value.communityId,
      status: filters.value.status,
    });
    items.value = res.items || [];
    page.value = 1;
  } catch (err) {
    error.value = 'ロードに失敗しました';
    toast.show('読み込みに失敗しました', 'error');
  } finally {
    loading.value = false;
  }
};

const loadMore = () => {
  if (canLoadMore.value) page.value += 1;
};

const diagnose = async (id: string) => {
  busyId.value = id;
  try {
    await adminDiagnosePayment(id);
    await load();
    toast.show('診断を実行しました', 'success');
  } catch (err) {
    error.value = '診断に失敗しました';
    toast.show('診断に失敗しました', 'error');
  } finally {
    busyId.value = null;
  }
};

const openRefund = (item: ConsolePaymentItem) => {
  refundTarget.value = item;
};

const refund = async () => {
  if (!refundTarget.value) return;
  busyId.value = refundTarget.value.id;
  try {
    await adminRefundPayment(refundTarget.value.id);
    await load();
    toast.show('返金しました', 'success');
  } catch (err) {
    error.value = '返金に失敗しました';
    toast.show('返金に失敗しました', 'error');
  } finally {
    refundTarget.value = null;
    busyId.value = null;
  }
};

onMounted(load);
</script>

<style scoped>
.admin-payments {
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
.payment-card {
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
.filter-row input,
.filter-row select {
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
}
.primary.full {
  width: 100%;
}
.card-list .ghost.full {
  width: 100%;
  text-align: center;
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
  background: #fffbeb;
  color: #92400e;
}
.pill-info {
  background: #eff6ff;
  color: #1d4ed8;
}
.pill-danger {
  background: #fef2f2;
  color: #b91c1c;
}
.empty {
  padding: 18px;
  color: #475569;
}
.empty.error {
  color: #b91c1c;
}
.actions {
  display: flex;
  gap: 8px;
}
.actions .danger {
  color: #b91c1c;
  border-color: rgba(185, 28, 28, 0.3);
}
</style>
