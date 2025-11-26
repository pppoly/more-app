<template>
  <div class="payments">
    <PageMarker label="P-pay" />
    <header class="top">
      <div>
        <p class="eyebrow">收款 / 交易</p>
        <h1>{{ headerTitle }}</h1>
        <p class="muted" v-if="eventTitle">当前筛选：{{ eventTitle }}</p>
      </div>
      <button class="ghost" type="button" @click="goBack">返回</button>
    </header>

    <section class="card" v-if="balance">
      <div class="stat-grid">
        <article class="stat">
          <p>总收款</p>
          <strong>{{ formatYen(balance.grossPaid) }}</strong>
        </article>
        <article class="stat">
          <p>可提现</p>
          <strong>{{ formatYen(balance.net) }}</strong>
          <small v-if="balance.stripeBalance">Stripe 可用：{{ formatYen(balance.stripeBalance.available) }}</small>
        </article>
        <article class="stat">
          <p>平台费</p>
          <strong>{{ formatYen(balance.platformFee) }}</strong>
        </article>
        <article class="stat">
          <p>已退款</p>
          <strong>{{ formatYen(balance.refunded) }}</strong>
        </article>
      </div>
    </section>

    <section class="card filters">
      <div class="filter-row">
        <label>
          事件筛选
          <input v-model="eventId" type="text" placeholder="留空表示全部活动" @keyup.enter="reload" />
        </label>
        <label>
          状态
          <select v-model="status" @change="reload">
            <option value="">全部</option>
            <option value="paid">已支付</option>
            <option value="pending">待支付</option>
            <option value="refunded">已退款</option>
          </select>
        </label>
      </div>
      <div class="actions">
        <button class="ghost" type="button" @click="clearFilters">清空</button>
        <button class="primary" type="button" :disabled="loading" @click="reload">刷新</button>
      </div>
    </section>

    <section class="card list" :aria-busy="loading">
      <div class="list-head">
        <h2>交易流水</h2>
        <span class="muted">{{ payments.total }} 笔</span>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-else-if="loading">加载中...</p>
      <p v-else-if="!payments.items.length" class="empty">暂无交易记录。</p>
      <ul v-else class="pay-list">
        <li v-for="item in payments.items" :key="item.id" class="pay-item">
          <div class="pay-main">
            <p class="pay-user">{{ item.user.name }}</p>
            <p class="pay-meta">
              {{ item.event?.title || '未关联活动' }} · {{ formatDate(item.createdAt) }} · {{ item.method }}
            </p>
            <p class="pay-amount">{{ formatYen(item.amount) }}</p>
            <p class="pay-fee">平台费 {{ formatYen(item.platformFee) }}</p>
          </div>
          <div class="pay-actions">
            <span class="pill" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
            <button
              v-if="item.status === 'paid'"
              class="danger"
              type="button"
              :disabled="refundLoading[item.id]"
              @click="requestRefund(item)"
            >
              {{ refundLoading[item.id] ? '处理中...' : '退款' }}
            </button>
          </div>
        </li>
      </ul>
      <div class="pager" v-if="payments.total > payments.pageSize">
        <button class="ghost" :disabled="page === 1" @click="setPage(page - 1)">上一页</button>
        <span class="muted">第 {{ page }} 页</span>
        <button class="ghost" :disabled="page * payments.pageSize >= payments.total" @click="setPage(page + 1)">
          下一页
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchCommunityBalance, fetchCommunityPayments, refundPayment } from '../../../api/client';
import type { ConsoleCommunityBalance, ConsolePaymentItem, ConsolePaymentList } from '../../../types/api';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import PageMarker from '../../../components/PageMarker.vue';

const route = useRoute();
const router = useRouter();
const store = useConsoleCommunityStore();

const communityId = computed(() => (route.params.communityId as string) || store.activeCommunityId.value);
const initialEventId = computed(() => (route.query.eventId as string | undefined) || '');

const payments = ref<ConsolePaymentList>({ items: [], page: 1, pageSize: 20, total: 0 });
const balance = ref<ConsoleCommunityBalance | null>(null);
const loading = ref(false);
const error = ref('');
const page = ref(1);
const status = ref<string>('');
const eventId = ref(initialEventId.value);
const refundLoading = ref<Record<string, boolean>>({});

const eventTitle = computed(() => {
  if (!eventId.value) return '';
  const target = payments.value.items.find((p) => p.event?.id === eventId.value);
  return target?.event?.title ?? '';
});

const headerTitle = computed(() => (communityId.value ? '社区收款' : '收款'));

const formatYen = (value: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value || 0);

const formatDate = (value: string) =>
  new Date(value).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const statusLabel = (s: string) => {
  switch (s) {
    case 'paid':
      return '已支付';
    case 'pending':
      return '待支付';
    case 'refunded':
      return '已退款';
    default:
      return s;
  }
};
const statusClass = (s: string) => {
  switch (s) {
    case 'paid':
      return 'pill-ok';
    case 'pending':
      return 'pill-warn';
    case 'refunded':
      return 'pill-muted';
    default:
      return 'pill-muted';
  }
};

const loadBalance = async () => {
  if (!communityId.value) return;
  try {
    balance.value = await fetchCommunityBalance(communityId.value);
  } catch (err) {
    console.warn('Failed to load balance', err);
  }
};

const loadPayments = async () => {
  if (!communityId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const list = await fetchCommunityPayments(communityId.value, {
      page: page.value,
      pageSize: payments.value.pageSize,
      eventId: eventId.value || undefined,
      status: status.value || undefined,
    });
    payments.value = list;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '读取交易流水失败';
  } finally {
    loading.value = false;
  }
};

const reload = () => {
  loadBalance();
  loadPayments();
};

const setPage = (value: number) => {
  page.value = value;
};

const clearFilters = () => {
  eventId.value = '';
  status.value = '';
  page.value = 1;
  reload();
};

const goBack = () => {
  router.back();
};

const requestRefund = async (item: ConsolePaymentItem) => {
  const sure = window.confirm(`确认为「${item.user.name}」退款 ${formatYen(item.amount)} 吗？`);
  if (!sure) return;
  refundLoading.value = { ...refundLoading.value, [item.id]: true };
  try {
    await refundPayment(item.id, { reason: 'console_refund' });
    await loadPayments();
    await loadBalance();
  } catch (err) {
    alert(err instanceof Error ? err.message : '退款失败');
  } finally {
    refundLoading.value = { ...refundLoading.value, [item.id]: false };
  }
};

watch(page, () => {
  loadPayments();
});

watch(
  () => route.query.eventId,
  (next) => {
    eventId.value = (next as string) || '';
    page.value = 1;
    loadPayments();
  },
);

onMounted(async () => {
  if (!store.activeCommunityId.value) {
    await store.loadCommunities();
    store.ensureActiveCommunity();
  }
  await reload();
});
</script>

<style scoped>
.payments {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 12px calc(72px + env(safe-area-inset-bottom, 0px));
  background: #f7f9fb;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.eyebrow {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  letter-spacing: 0.04em;
}
h1 {
  margin: 4px 0;
  font-size: 20px;
}
.muted {
  color: #94a3b8;
  margin: 0;
  font-size: 13px;
}
.card {
  background: #fff;
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.stat p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}
.stat strong {
  display: block;
  margin-top: 4px;
  font-size: 18px;
  color: #0f172a;
}
.stat small {
  display: block;
  margin-top: 4px;
  color: #94a3b8;
}
.filters .filter-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.filters label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #334155;
}
.filters input,
.filters select {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px;
  font-size: 14px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.ghost,
.primary,
.danger {
  border: none;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
}
.ghost {
  background: #f8fafc;
  color: #0f172a;
  border: 1px solid #e2e8f0;
}
.primary {
  background: linear-gradient(135deg, #0090d9, #22bbaa);
  color: #fff;
}
.danger {
  background: #f87171;
  color: #fff;
}
.list-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.list-head h2 {
  margin: 0;
  font-size: 16px;
}
.pay-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pay-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.pay-user {
  margin: 0;
  font-weight: 600;
  color: #0f172a;
}
.pay-meta {
  margin: 4px 0;
  color: #94a3b8;
  font-size: 12px;
}
.pay-amount {
  margin: 0;
  font-weight: 700;
  color: #111827;
}
.pay-fee {
  margin: 2px 0 0;
  font-size: 12px;
  color: #94a3b8;
}
.pay-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid transparent;
}
.pill-ok {
  background: #ecfdf3;
  color: #15803d;
}
.pill-warn {
  background: #fff7ed;
  color: #ea580c;
}
.pill-muted {
  background: #f8fafc;
  color: #475569;
}
.empty,
.error {
  color: #94a3b8;
  margin: 8px 0;
}
.error {
  color: #ef4444;
}
.pager {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
}
</style>
