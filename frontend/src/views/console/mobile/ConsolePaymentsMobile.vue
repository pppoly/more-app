<template>
  <div class="payments">
    <ConsoleTopBar v-if="!isLiffClientMode" :title="headerTitle" @back="goBack" />

    <!-- コミュニティ取引ページではKPIを省略し、一覧操作に集中 -->

    <section class="card filters">
      <div class="filter-stack">
        <div class="input-field" v-if="!lockedEvent">
          <div class="input-row">
            <input
              v-model="eventId"
              type="text"
              placeholder="イベントIDで検索（空なら全件）"
              @keyup.enter="reload"
            />
            <button class="chip ghost" type="button" @click="reload">{{ loading ? '読込中…' : '検索' }}</button>
          </div>
        </div>
        <div class="chip-group">
          <div class="chips">
            <button type="button" class="chip" :class="{ active: status === 'paid' }" @click="status = 'paid'; reload()">
              支払い済み
            </button>
            <button
              type="button"
              class="chip"
              :class="{ active: status === 'pending' }"
              @click="status = 'pending'; reload()"
            >
              支払い待ち
            </button>
            <button
              type="button"
              class="chip"
              :class="{ active: status === 'refunded' }"
              @click="status = 'refunded'; reload()"
            >
              返金済み
            </button>
            <button type="button" class="chip" :class="{ active: status === '' }" @click="status = ''; reload()">
              すべて
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="card list" :aria-busy="loading">
      <div class="list-head">
        <h2>取引一覧</h2>
        <span class="muted">{{ visiblePayments.length }} 件</span>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-else-if="loading">読み込み中…</p>
      <p v-else-if="!visiblePayments.length" class="empty">表示できる取引がありません。</p>
      <ul v-else class="pay-list">
        <li v-for="item in visiblePayments" :key="item.id" class="pay-item">
          <div class="pay-main">
            <div class="pay-head">
              <p class="pay-user">{{ item.user.name }}</p>
              <span class="pill" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
            </div>
            <div class="pay-title-row">
              <span class="pay-tag" :class="infoTagClass(displayInfo(item).label)">{{ displayInfo(item).label }}</span>
              <p class="pay-title">{{ displayInfo(item).title }}</p>
            </div>
            <p class="pay-meta">{{ formatDate(item.createdAt) }} · {{ item.method }}</p>
          </div>
          <div class="pay-actions">
            <p class="pay-amount">{{ formatYen(item.amount) }}</p>
            <span v-if="item.refundRequest" class="pill" :class="refundStatusClass(item.refundRequest.status)">
              {{ refundStatusLabel(item.refundRequest, item.amount) }}
            </span>
          </div>
        </li>
      </ul>
      <div class="pager" v-if="payments.total > payments.pageSize">
        <button class="ghost" :disabled="page === 1" @click="setPage(page - 1)">前へ</button>
        <span class="muted">{{ page }} ページ目</span>
        <button class="ghost" :disabled="page * payments.pageSize >= payments.total" @click="setPage(page + 1)">
          次へ
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchCommunityPayments } from '../../../api/client';
import type { ConsolePaymentItem, ConsolePaymentList, ConsolePaymentRefundRequest } from '../../../types/api';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';
import { isLiffClient } from '../../../utils/device';
import { isLineInAppBrowser } from '../../../utils/liff';
import { APP_TARGET } from '../../../config';
import { getLocalizedText } from '../../../utils/i18nContent';
import { useScrollMemory } from '../../../composables/useScrollMemory';

const route = useRoute();
const router = useRouter();
const store = useConsoleCommunityStore();

const communityId = computed(() => (route.params.communityId as string) || store.activeCommunityId.value);
const lockedEventId = computed(() => (route.query.eventId as string | undefined) || '');
const initialEventId = computed(() => lockedEventId.value);

const payments = ref<ConsolePaymentList>({ items: [], page: 1, pageSize: 20, total: 0 });
const loading = ref(false);
const error = ref('');
const page = ref(1);
const status = ref<string>('paid');
const eventId = ref(initialEventId.value);
const lockedEvent = computed(() => !!lockedEventId.value);
const isLiffClientMode = computed(() => APP_TARGET === 'liff' || isLineInAppBrowser() || isLiffClient());
const visiblePayments = computed(() => payments.value.items);

const headerTitle = computed(() =>
  lockedEvent.value ? 'イベントの取引' : communityId.value ? 'コミュニティの取引' : '取引',
);
useScrollMemory();

const formatYen = (value: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value || 0);

const formatDate = (value: string) =>
  new Date(value).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const displayInfo = (item: ConsolePaymentItem) => {
  if (item.event?.title) {
    return { label: 'イベント', title: item.event.title };
  }
  return { label: 'レッスン', title: item.lesson?.class?.title ? getLocalizedText(item.lesson.class.title) : 'クラス' };
};
const infoTagClass = (label: string) => {
  return label === 'イベント' ? 'tag-event' : 'tag-lesson';
};

const statusLabel = (s: string) => {
  switch (s) {
    case 'paid':
      return '支払い済み';
    case 'pending':
      return '支払い待ち';
    case 'refund_requested':
      return '返金申請中';
    case 'refunded':
      return '返金済み';
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
    case 'refund_requested':
      return 'pill-warn';
    case 'refunded':
      return 'pill-muted';
    default:
      return 'pill-muted';
  }
};
const refundStatusLabel = (request: ConsolePaymentRefundRequest, fallbackAmount?: number) => {
  const amount =
    request.status === 'completed'
      ? request.refundedAmount ?? request.approvedAmount ?? request.requestedAmount ?? fallbackAmount
      : request.requestedAmount ?? fallbackAmount;
  const amountText = amount != null ? ` ${formatYen(amount)}` : '';
  switch (request.status) {
    case 'requested':
      return `返金申請中${amountText}`;
    case 'processing':
      return `返金処理中${amountText}`;
    case 'completed':
      return `返金済み${amountText}`;
    case 'rejected':
      return '返金却下';
    default:
      return `返金${request.status}`;
  }
};

const refundStatusClass = (status: string) => {
  switch (status) {
    case 'requested':
    case 'processing':
      return 'pill-warn';
    case 'completed':
      return 'pill-ok';
    case 'rejected':
      return 'pill-muted';
    default:
      return 'pill-muted';
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
    error.value = err instanceof Error ? err.message : '取引の取得に失敗しました';
  } finally {
    loading.value = false;
  }
};

const reload = () => {
  loadPayments();
};

const setPage = (value: number) => {
  page.value = value;
};

const goBack = () => {
  router.back();
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
.summary {
  padding: 12px;
  border-radius: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hero {
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  border-radius: 16px;
  padding: 16px 16px 18px;
  box-shadow: 0 16px 32px rgba(37, 99, 235, 0.2);
}
.hero-label {
  margin: 0;
  font-size: 13px;
  opacity: 0.9;
}
.hero-value {
  margin: 6px 0 4px;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: 0.5px;
}
.hero-sub {
  margin: 0;
  font-size: 13px;
  opacity: 0.9;
}
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.kpi {
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(15, 23, 42, 0.04);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.filters .filter-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.filter-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.input-field input {
  flex: 1;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px;
  font-size: 14px;
  background: #f8fafc;
}
.chip-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #0f172a;
  font-size: 13px;
}
.chip.active {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
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
.pay-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.pay-user {
  margin: 0;
  font-weight: 600;
  color: #0f172a;
}
.pay-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin: 2px 0 6px;
}
.pay-title {
  margin: 4px 0 2px;
  font-size: 14px;
  color: #0f172a;
}
.pay-tag {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid transparent;
  background: #e2e8f0;
  color: #334155;
}
.tag-event {
  background: #e0f2fe;
  color: #075985;
  border-color: #bae6fd;
}
.tag-lesson {
  background: #ecfdf3;
  color: #166534;
  border-color: #bbf7d0;
}
.tag-muted {
  background: #f8fafc;
  color: #94a3b8;
  border-color: #e2e8f0;
}
.pay-meta {
  margin: 4px 0;
  color: #94a3b8;
  font-size: 12px;
}
.pay-amount {
  margin: 0;
  font-weight: 800;
  font-size: 18px;
  color: #111827;
}
.pay-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.refund-action-row {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.action-btn {
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 10px;
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
