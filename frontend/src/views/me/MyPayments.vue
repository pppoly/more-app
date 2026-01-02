<template>
  <div class="my-payments-page">
    <ConsoleTopBar v-if="!isLiffClientMode" class="topbar" titleKey="me.payments.title" @back="goBack" />

    <section class="filters">
      <button
        v-for="tab in filterTabs"
        :key="tab.id"
        type="button"
        class="filter-chip"
        :class="{ 'filter-chip--active': tab.id === activeFilter }"
        @click="activeFilter = tab.id"
      >
        {{ tab.label }} ({{ tab.count }})
      </button>
    </section>

    <section class="list">
      <article v-if="loading" class="payment-card payment-card--skeleton" v-for="n in 3" :key="`s-${n}`"></article>

      <article v-else-if="error" class="state-card">
        <p class="state-title">支払い履歴を読み込めませんでした</p>
        <p class="state-message">{{ error }}</p>
        <button class="ghost-btn" type="button" @click="loadPayments">再読み込み</button>
      </article>

      <article v-else-if="!filteredRecords.length" class="state-card">
        <p class="state-title">表示できる記録がありません</p>
        <p class="state-message">フィルターを変えるか、イベントに参加するとここに表示されます。</p>
      </article>

      <details
        v-else
        v-for="record in filteredRecords"
        :key="record.registrationId"
        class="payment-card"
      >
        <summary class="payment-summary">
          <div class="summary-main">
            <p class="event-title">{{ record.eventTitle }}</p>
            <p class="event-date">{{ formatDate(record.eventDate) }}</p>
            <p class="event-chip">{{ record.phase }}</p>
          </div>
          <div class="summary-side">
            <p class="amount">¥{{ formatYen(record.amount) }}</p>
            <span class="status-chip" :class="statusClass(record)">{{ statusText(record) }}</span>
            <div v-if="debugMode" class="debug">
              <p>status: {{ record.status }}</p>
              <p>paymentStatus: {{ record.paymentStatus }}</p>
              <p>refundStatus: {{ record.refundStatus || '—' }}</p>
            </div>
          </div>
        </summary>
        <div class="payment-detail">
          <div class="detail-row">
            <span class="detail-label">支払い方法</span>
            <span class="detail-value">{{ record.method }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">支払い日時</span>
            <span class="detail-value">{{ formatDateTime(record.paidAt) }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">取引ID</span>
            <span class="detail-value monospace">{{ record.registrationId }}</span>
          </div>
          <div v-if="record.refundStatus" class="detail-refund">
            <div class="detail-row">
              <span class="detail-label">返金額</span>
              <span class="detail-value">¥{{ formatYen(record.refundedAmount ?? 0) }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">返金ステータス</span>
              <span class="detail-value">{{ refundStatusText(record) }}</span>
            </div>
            <div v-if="record.refundReason" class="detail-row">
              <span class="detail-label">返金理由</span>
              <span class="detail-value">{{ record.refundReason }}</span>
            </div>
          </div>
        </div>
      </details>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchMyEvents } from '../../api/client';
import type { MyEventItem } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import ConsoleTopBar from '../../components/console/ConsoleTopBar.vue';
import { isLiffClient } from '../../utils/device';
import { isLineInAppBrowser } from '../../utils/liff';
import { APP_TARGET } from '../../config';

type FilterId = 'all' | 'paid' | 'refunded';

interface PaymentRecord {
  registrationId: string;
  eventTitle: string;
  eventDate?: string | null;
  amount: number;
  status: string;
  paymentStatus?: string;
  refundStatus?: string | null;
  refundedAmount?: number | null;
  refundReason?: string | null;
  method: string;
  paidAt?: string | null;
  phase: string;
}

const router = useRouter();
const route = useRoute();
const isLiffClientMode = computed(() => APP_TARGET === 'liff' || isLineInAppBrowser() || isLiffClient());
const debugMode = computed(() => route.query.debug === '1');

const loading = ref(true);
const error = ref<string | null>(null);
const records = ref<PaymentRecord[]>([]);
const activeFilter = ref<FilterId>('all');

const formatYen = (value: number) => value.toLocaleString('ja-JP');
const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' });
};
const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const statusText = (rec: PaymentRecord) => {
  const total = rec.amount || 0;
  const refunded = rec.refundedAmount ?? 0;
  const paidLike = ['paid', 'succeeded', 'captured', 'completed'];
  const refundingLike = ['cancel_requested', 'cancelled', 'pending_refund', 'processing_refund'];
  if (refundingLike.includes(rec.status)) return '返金処理中';
  if (rec.status === 'cancel_requested') return '返金処理中';
  if (rec.status === 'cancelled' && total > 0) return '返金処理中';
  if (rec.refundStatus === 'pending' || rec.status === 'pending_refund') return '返金処理中';
  if (refunded > 0) {
    return refunded >= total && total > 0 ? '返金済み（全額）' : `返金済み（一部 ¥${formatYen(refunded)})`;
  }
  if (rec.paymentStatus === 'refunded') return '返金済み（全額）';
  if (paidLike.includes(rec.paymentStatus || '') || paidLike.includes(rec.status)) return '支払い完了';
  return '支払い待ち';
};

const refundStatusText = (rec: PaymentRecord) => {
  if (rec.refundStatus === 'pending' || rec.status === 'pending_refund') return '返金処理中';
  if (rec.refundedAmount && rec.refundedAmount > 0) return '返金済み';
  return '—';
};

const statusClass = (rec: PaymentRecord) => {
  const text = statusText(rec);
  if (text.includes('返金処理中')) return 'chip chip--warn';
  if (text.includes('返金済み')) return 'chip chip--info';
  if (text.includes('支払い完了')) return 'chip chip--ok';
  return 'chip';
};

const buildPhase = (event: MyEventItem['event'], lesson: MyEventItem['lesson']) => {
  const now = Date.now();
  const startStr = event?.startTime ?? lesson?.startAt ?? null;
  const endStr = event?.endTime ?? lesson?.endAt ?? null;
  if (!startStr) return '開催予定';
  const start = new Date(startStr).getTime();
  const end = endStr ? new Date(endStr).getTime() : start;
  if (isNaN(start)) return '開催予定';
  if (now < start) return '開催前';
  if (now >= start && now <= end) return '開催中';
  return '開催終了';
};

const mapToRecords = (items: MyEventItem[]): PaymentRecord[] =>
  items
    .map((item) => {
      try {
        const refund = item.refundRequest;
        const paymentMethod = (item as any).paymentMethod || 'Stripe';
        const createdAt = (item as any).createdAt ?? item.event?.startTime ?? item.lesson?.startAt ?? null;
        const sourceTitle = item.event
          ? getLocalizedText(item.event.title)
          : item.lesson?.class?.title
            ? getLocalizedText(item.lesson.class.title)
            : '—';
        const eventDate = item.event?.startTime ?? item.lesson?.startAt ?? null;
        return {
          registrationId: item.registrationId,
          eventTitle: sourceTitle || '—',
          eventDate,
          amount: item.amount ?? 0,
          status: item.status,
          paymentStatus: item.paymentStatus,
          refundStatus: refund?.status ?? null,
          refundedAmount: refund?.refundedAmount ?? null,
          refundReason: refund?.reason ?? null,
          method: paymentMethod,
          paidAt: createdAt,
          phase: buildPhase(item.event, item.lesson),
        };
      } catch (err) {
        console.warn('[payments] skip record', item?.registrationId, err);
        return null;
      }
    })
    .filter((item): item is PaymentRecord => Boolean(item));

const loadPayments = async () => {
  loading.value = true;
  error.value = null;
  try {
    const events = await fetchMyEvents();
    records.value = mapToRecords(events);
  } catch (err) {
    const message =
      (err as any)?.response?.data?.message ||
      (err instanceof Error ? err.message : 'ネットワークが不安定です。しばらくしてから再度お試しください。');
    error.value = Array.isArray(message) ? message.join(', ') : message;
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadPayments();
});

const filterTabs = computed(() => {
  const paidRecords = records.value.filter((rec) => (rec.amount ?? 0) > 0);
  const counts: Record<FilterId, number> = { all: paidRecords.length, paid: 0, refunded: 0 };
  paidRecords.forEach((rec) => {
    const text = statusText(rec);
    if (text.includes('支払い完了')) counts.paid += 1;
    if (text.includes('返金')) counts.refunded += 1;
  });
  return [
    { id: 'all' as FilterId, label: 'すべて', count: counts.all },
    { id: 'paid' as FilterId, label: '支払い完了', count: counts.paid },
    { id: 'refunded' as FilterId, label: '返金あり', count: counts.refunded },
  ];
});

const filteredRecords = computed(() => {
  const paidRecords = records.value.filter((rec) => (rec.amount ?? 0) > 0);
  if (activeFilter.value === 'all') return paidRecords;
  if (activeFilter.value === 'paid')
    return paidRecords.filter((rec) => statusText(rec).includes('支払い完了'));
  return paidRecords.filter((rec) => statusText(rec).includes('返金'));
});

const goBack = () => {
  const back = typeof window !== 'undefined' ? window.history.state?.back : null;
  if (back) {
    router.back();
    return;
  }
  router.replace({ name: 'MobileMe' });
};
</script>

<style scoped>
.my-payments-page {
  min-height: 100vh;
  background: #f5f7fb;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(64px + env(safe-area-inset-bottom, 0px)) 16px;
  padding-left: calc(16px + env(safe-area-inset-left, 0px));
  padding-right: calc(16px + env(safe-area-inset-right, 0px));
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
  overflow-x: hidden;
}
.topbar {
  margin-left: calc(-16px - env(safe-area-inset-left, 0px));
  margin-right: calc(-16px - env(safe-area-inset-right, 0px));
  margin-top: 0;
  margin-bottom: 12px;
}

.page-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 10px 0 12px;
}

.page-eyebrow {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
}

.page-subtext {
  margin: 0;
  font-size: 13px;
  color: #475569;
}

.filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 8px 0 16px;
}

.filter-chip {
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 13px;
  color: #0f172a;
  cursor: pointer;
}

.filter-chip--active {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}

.disclosure {
  background: #f1f5f9;
  border-radius: 12px;
  padding: 12px;
  margin: 8px 0 12px;
  font-size: 13px;
  color: #1f2a3d;
  line-height: 1.5;
}

.disclosure-title {
  margin: 0 0 6px;
  font-weight: 600;
  font-size: 13px;
}

.disclosure ul {
  padding-left: 18px;
  margin: 0 0 6px;
}

.disclosure-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 13px;
}

.disclosure a {
  color: #2563eb;
  text-decoration: underline;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 48px;
}

.payment-card {
  background: #fff;
  border-radius: 18px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.payment-card summary {
  list-style: none;
  cursor: pointer;
}

.payment-card summary::-webkit-details-marker {
  display: none;
}

.payment-summary {
  padding: 14px 14px 10px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.summary-main {
  flex: 1;
}

.event-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.event-date {
  margin: 4px 0 0;
  font-size: 12px;
  color: #475569;
}

.event-chip {
  margin: 6px 0 0;
  font-size: 12px;
  color: #0f172a;
  background: #e2e8f0;
  border-radius: 999px;
  padding: 3px 10px;
  display: inline-block;
}

.summary-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.amount {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.status-chip {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: #e2e8f0;
  color: #0f172a;
}

.chip {
  background: #e2e8f0;
  color: #0f172a;
}

.chip--ok {
  background: #d1fae5;
  color: #047857;
}

.chip--info {
  background: #e0f2fe;
  color: #075985;
}

.chip--warn {
  background: #fef9c3;
  color: #854d0e;
}

.payment-detail {
  padding: 0 14px 14px;
  border-top: 1px solid rgba(15, 23, 42, 0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #0f172a;
}

.detail-label {
  color: #475569;
}

.detail-value {
  font-weight: 600;
}

.monospace {
  font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 12px;
}

.detail-refund {
  padding: 10px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.05);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.state-card {
  background: #fff;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  text-align: center;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
}

.state-title {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.state-message {
  margin: 0 0 10px;
  font-size: 13px;
  color: #475569;
}

.ghost-btn {
  border: 1px solid rgba(15, 23, 42, 0.14);
  background: #fff;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
  color: #0f172a;
}

.payment-card--skeleton {
  height: 120px;
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 37%, #f1f5f9 63%);
  background-size: 400% 100%;
  border-radius: 18px;
  animation: shimmer 1.3s ease infinite;
}

.debug {
  margin-top: 4px;
  font-size: 11px;
  color: #94a3b8;
  text-align: right;
}

@keyframes shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: 0 0;
  }
}
</style>
