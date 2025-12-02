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
        <article v-for="item in items" :key="item.id" class="payment-card">
          <div class="card-top">
            <div>
              <p class="eyebrow">{{ item.community?.name || item.community?.id || '—' }}</p>
              <h3>¥{{ formatNumber(item.amount) }}</h3>
              <p class="meta">方法: {{ item.method }}</p>
            </div>
            <span class="pill" :class="statusClass(item.status)">{{ item.status }}</span>
          </div>
          <p class="meta">事件: {{ item.event?.title || '—' }}</p>
          <p class="meta">用户: {{ item.user?.name || item.user?.id || '—' }}</p>
          <p class="meta">
            平台费: ¥{{ formatNumber(item.platformFee) }}
            <span v-if="item.feePercent !== null" class="muted">({{ item.feePercent }}%)</span>
          </p>
          <p class="meta">创建: {{ formatDate(item.createdAt) }}</p>
          <div class="actions">
            <button class="ghost" type="button" :disabled="busyId === item.id" @click="diagnose(item.id)">診断</button>
            <button
              class="ghost danger"
              type="button"
              :disabled="busyId === item.id || item.status === 'refunded'"
              @click="refund(item.id)"
            >
              返金
            </button>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ConsolePaymentItem } from '../../types/api';
import { adminDiagnosePayment, adminRefundPayment, fetchAdminPayments } from '../../api/client';

const items = ref<ConsolePaymentItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const filters = ref<{ communityId?: string; status?: string }>({});
const busyId = ref<string | null>(null);

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
  } catch (err) {
    error.value = 'ロードに失敗しました';
  } finally {
    loading.value = false;
  }
};

const diagnose = async (id: string) => {
  busyId.value = id;
  try {
    await adminDiagnosePayment(id);
    await load();
  } catch (err) {
    error.value = '診断に失敗しました';
  } finally {
    busyId.value = null;
  }
};

const refund = async (id: string) => {
  busyId.value = id;
  try {
    await adminRefundPayment(id);
    await load();
  } catch (err) {
    error.value = '返金に失敗しました';
  } finally {
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
.filters label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
.filters input,
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
.pill-info {
  background: #eef2ff;
  color: #312e81;
}
.muted {
  color: #94a3b8;
  font-size: 12px;
}
</style>
