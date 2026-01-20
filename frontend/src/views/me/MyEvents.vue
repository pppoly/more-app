<template>
  <div class="my-events-page">
    <ConsoleTopBar v-if="!isLiffClientMode" class="topbar" title="マイチケット" @back="goBack" />
    <header class="page-header">
      <div class="segmented-control" role="tablist">
        <button
          v-for="tab in filterTabs"
          :key="tab.id"
          type="button"
          class="segmented-button"
          :class="{ 'segmented-button--active': tab.id === activeTab }"
          @click="activeTab = tab.id"
        >
          <span>{{ tab.label }}</span>
          <span class="segmented-button__count">{{ tab.count }}</span>
        </button>
      </div>
    </header>

    <section class="events-section">
      <p v-if="banner" class="feedback" :class="`feedback--${banner.type}`">{{ banner.message }}</p>

      <article v-if="loading" class="ticket-card ticket-card--skeleton" v-for="n in 3" :key="`s-${n}`"></article>

      <article v-else-if="error" class="state-card">
        <p class="state-card__title">イベントを読み込めませんでした</p>
        <p class="state-card__message">{{ error }}</p>
        <button type="button" class="ghost-btn" @click="loadEvents">再読み込み</button>
      </article>

      <template v-else>
        <article v-if="!groupedEvents.length" class="state-card">
          <p class="state-card__title">{{ emptyStateTitle }}</p>
          <p class="state-card__message">{{ emptyStateMessage }}</p>
          <RouterLink class="ghost-btn" to="/events">イベントを探す</RouterLink>
        </article>

        <div v-else>
          <div v-for="group in groupedEvents" :key="group.id" class="group-block">
            <p class="group-title">{{ group.title }}</p>
            <div v-for="item in group.items" :key="item.registrationId" class="ticket-card-wrapper">
              <article
            class="ticket-card ticket-card--with-cover"
              :class="{
                'ticket-card--validated': item.attended,
                'ticket-card--void': isVoidTicket(item),
                'ticket-card--refunding': isRefunding(item),
              }"
              :style="ticketCoverStyle(item)"
            >
              <span v-if="refundFlagLabel(item)" class="ticket-card__flag ticket-card__flag--refunding">
                {{ refundFlagLabel(item) }}
              </span>
              <div v-if="item.attended && !isVoidTicket(item)" class="ticket-card__tear">
                <span>検証済み</span>
              </div>
              <div class="ticket-card__top">
                <div class="ticket-card__meta-left">
                    <p class="ticket-card__date">{{ formatDate(displayStart(item)) }}</p>
                    <p class="ticket-card__community">{{ displayCommunity(item) }}</p>
                  </div>
                  <div class="ticket-card__qr">
                    <button
                      v-if="isUpcoming(item) && canCancel(item)"
                      type="button"
                      class="ticket-card__cancel ticket-card__cancel--ghost"
                      @click="cancelRegistration(item)"
                      :disabled="cancelingId === item.registrationId"
                    >
                      {{ cancelingId === item.registrationId ? '処理中…' : '参加をキャンセルする' }}
                    </button>
                    <span class="ticket-card__code">#{{ item.registrationId.slice(0, 8).toUpperCase() }}</span>
                  </div>
                </div>
                <div class="ticket-card__body">
                  <h2 class="ticket-card__title">{{ displayTitle(item) }}</h2>
                  <p v-if="isExpired(item)" class="ticket-card__expired-label">有効期限切れ（未チェックイン）</p>
                  <div class="ticket-card__badges">
                    <span class="ticket-card__badge ticket-card__badge--phase">{{ phaseLabel(item) }}</span>
                    <span class="ticket-card__badge" :class="statusClass(item)">{{ statusLabel(item) }}</span>
                    <span v-if="attendanceLabel(item)" class="ticket-card__badge" :class="attendanceClass(item)">{{ attendanceLabel(item) }}</span>
                    <span v-if="paymentBadgeLabel(item)" class="ticket-card__badge" :class="paymentClass(item)">
                      {{ paymentBadgeLabel(item) }}
                    </span>
                  </div>
                  <p v-if="refundNotice(item)" class="ticket-card__notice">{{ refundNotice(item) }}</p>
                </div>
                <footer class="ticket-card__footer">
                  <button
                    v-if="!isVoidTicket(item) && item.status !== 'cancel_requested' && !item.attended"
                    type="button"
                    class="ticket-btn"
                    @click="openTicketQr(item)"
                  >
                    QRコードを表示
                  </button>
                  <div v-else class="ticket-card__void-footer">無効なチケット</div>
                </footer>
              </article>
              <div v-if="isVoidTicket(item)" class="ticket-card__void-stamp">無効</div>
            </div>
          </div>
        </div>
      </template>
    </section>

    <Transition name="qr-fade">
      <section v-if="qrVisible && qrTicket" class="ticket-qr-overlay" @click.self="closeTicketQr">
        <article class="ticket-qr-modal">
          <button type="button" class="qr-close" @click="closeTicketQr">X</button>
          <p class="qr-title">QRコードを表示</p>
          <p class="qr-subtitle">
            {{ qrTicket.event ? getLocalizedText(qrTicket.event.title) : '' }}
          </p>
          <canvas ref="qrCanvas" class="qr-canvas"></canvas>
          <p class="qr-code">#{{ qrTicket.registrationId.slice(0, 8).toUpperCase() }}</p>
          <p class="qr-hint">スタッフにスキャンしてもらってください</p>
          <p v-if="qrError" class="qr-error">{{ qrError }}</p>
        </article>
      </section>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { cancelMyRegistration, fetchMyEvents } from '../../api/client';
import type { MyEventItem } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { calculateRefundAmount, calculateRefundPercent, resolveRefundPolicyText } from '../../utils/refundPolicy';
import QRCode from 'qrcode';
import { useResourceConfig } from '../../composables/useResourceConfig';
import { useConfirm } from '../../composables/useConfirm';
import ConsoleTopBar from '../../components/console/ConsoleTopBar.vue';
import { isLiffClient } from '../../utils/device';
import { isLineInAppBrowser } from '../../utils/liff';
import { APP_TARGET } from '../../config';

type FilterTabId = 'upcoming' | 'past' | 'refund' | 'all';

const router = useRouter();
const events = ref<MyEventItem[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const banner = ref<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
const cancelingId = ref<string | null>(null);
const activeTab = ref<FilterTabId>('upcoming');
const qrVisible = ref(false);
const qrTicket = ref<MyEventItem | null>(null);
const qrCanvas = ref<HTMLCanvasElement | null>(null);
const qrError = ref<string | null>(null);
const isLiffClientMode = computed(() => isLiffClient());
const resourceConfigStore = useResourceConfig();
const { confirm: confirmDialog } = useConfirm();
const { slotMap } = resourceConfigStore;
const fallbackCoverImages = computed(() => {
  const list = resourceConfigStore.getListValue('mobile.eventList.cardFallbacks');
  if (list.length) return list;
  const fallback = slotMap['mobile.eventList.cardFallbacks'].defaultValue;
  return typeof fallback === 'string' ? [] : [...fallback];
});

const loadEvents = async () => {
  loading.value = true;
  error.value = null;
  try {
    events.value = await fetchMyEvents();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'ネットワークが不安定です。しばらくしてから再度お試しください。';
  } finally {
    loading.value = false;
  }
};

const refreshEventsSilent = async () => {
  try {
    events.value = await fetchMyEvents();
  } catch {
    // silent refresh should not interrupt UX
  }
};

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    void refreshEventsSilent();
  }
};

onMounted(() => {
  loadEvents();
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  if (qrPollingTimer) {
    window.clearInterval(qrPollingTimer);
    qrPollingTimer = null;
  }
});

const isVoidTicket = (item: MyEventItem) =>
  ['cancelled', 'refunded', 'pending_refund', 'rejected'].includes(item.status);

const getStartTime = (item: MyEventItem) => {
  if (item.lesson?.startAt) return new Date(item.lesson.startAt);
  if (item.event?.startTime) return new Date(item.event.startTime);
  return new Date(0);
};

const getEndTime = (item: MyEventItem) => {
  if (item.lesson?.endAt) return new Date(item.lesson.endAt);
  if (item.event?.endTime) return new Date(item.event.endTime);
  return getStartTime(item);
};

const isUpcoming = (item: MyEventItem) => !isVoidTicket(item) && getStartTime(item) > new Date();
const isExpired = (item: MyEventItem) => !item.attended && !isUpcoming(item) && !isVoidTicket(item);
const isPaidStatus = (item: MyEventItem) => {
  const amount = item.amount ?? 0;
  if (item.status === 'paid') return true;
  if (item.status !== 'approved') return false;
  if (amount <= 0) return true;
  const paidLike = ['paid', 'succeeded', 'captured', 'completed'];
  return paidLike.includes(item.paymentStatus || '');
};
const isRefundingStatus = (item: MyEventItem) => ['cancel_requested', 'pending_refund'].includes(item.status);
const isRefundedStatus = (item: MyEventItem) => item.status === 'refunded';
const isCancelledStatus = (item: MyEventItem) => ['cancelled', 'rejected'].includes(item.status);
const isPendingStatus = (item: MyEventItem) => item.status === 'pending';
const isPendingPaymentStatus = (item: MyEventItem) => item.status === 'pending_payment';
const isApprovedAwaitingPayment = (item: MyEventItem) =>
  item.status === 'approved' && (item.amount ?? 0) > 0 && item.paymentStatus !== 'paid';

const currencyFormatter = new Intl.NumberFormat('ja-JP', {
  maximumFractionDigits: 0,
});

const formatYen = (value: number) => currencyFormatter.format(Math.max(0, Math.round(value)));

const buildCancelPrompt = (item: MyEventItem) => {
  const base = 'この参加をキャンセルしてもよろしいですか？';
  const amount = item.amount ?? 0;
  if (!amount || amount <= 0) return base;
  const policyText = resolveRefundPolicyText((item.event?.config as Record<string, any>) ?? null);
  const percent = calculateRefundPercent(
    (item.event?.config as Record<string, any>)?.refundPolicyRules ?? null,
    item.event?.startTime ?? null,
  );
  if (percent === null) {
    return policyText
      ? `${base}\n\n返金ルール: ${policyText}\n返金は主催者の確認後に処理されます。`
      : `${base}\n\n返金は主催者の確認後に処理されます。`;
  }
  if (percent <= 0) {
    return policyText
      ? `${base}\n\n【重要】このキャンセルは返金対象外です。\n返金ルール: ${policyText}\n返金は行われません。`
      : `${base}\n\n【重要】このキャンセルは返金対象外です。\n返金は行われません。`;
  }
  const refundAmount = calculateRefundAmount(amount, percent);
  const refundLine = `返金額の目安: ¥${formatYen(refundAmount)}（${percent}%）`;
  const warningLine = percent < 100 ? '【重要】全額返金ではありません。' : '';
  return policyText
    ? `${base}\n\n${warningLine}\n返金ルール: ${policyText}\n${refundLine}`
    : `${base}\n\n${warningLine}\n${refundLine}`;
};

const sortedEvents = computed(() =>
  [...events.value].sort((a, b) => getStartTime(b).getTime() - getStartTime(a).getTime()),
);

const isPaymentCancelledTicket = (item: MyEventItem) =>
  item.status === 'cancelled' && item.paymentStatus === 'cancelled' && (item.amount ?? 0) > 0;

const isEligibleTicket = (item: MyEventItem) => {
  if (item.status === 'rejected') return false;
  if (isPaymentCancelledTicket(item)) return false;
  if (item.status === 'pending' || item.status === 'pending_payment' || item.status === 'approved') return true;
  const amount = item.amount ?? 0;
  const paymentOk = isPaidStatus(item) || isRefundedStatus(item) || isRefundingStatus(item) || item.status === 'cancelled';
  if (amount > 0) return paymentOk;
  return true;
};

const eligibleEvents = computed(() => sortedEvents.value.filter((item) => isEligibleTicket(item)));

const isRefundOrCancel = (item: MyEventItem) =>
  isRefundingStatus(item) || isRefundedStatus(item) || isCancelledStatus(item);

const filterDefinitions: Array<{ id: FilterTabId; label: string; matcher: (item: MyEventItem) => boolean }> = [
  { id: 'upcoming', label: 'これから', matcher: (item) => isUpcoming(item) && !item.attended },
  { id: 'past', label: '参加済み', matcher: (item) => Boolean(item.attended) && !isRefundOrCancel(item) },
  { id: 'refund', label: 'キャンセル', matcher: (item) => isRefundOrCancel(item) },
  { id: 'all', label: 'すべて', matcher: () => true },
];

const filterCounts = computed(() => ({
  upcoming: eligibleEvents.value.filter((item) => isUpcoming(item) && !item.attended).length,
  past: eligibleEvents.value.filter((item) => Boolean(item.attended) && !isRefundOrCancel(item)).length,
  refund: eligibleEvents.value.filter((item) => isRefundOrCancel(item)).length,
  all: eligibleEvents.value.length,
}));

const filterTabs = computed(() =>
  filterDefinitions.map((tab) => ({
    ...tab,
    count: filterCounts.value[tab.id],
  })),
);

const filteredEvents = computed(() => {
  const active = filterDefinitions.find((tab) => tab.id === activeTab.value);
  if (!active) return eligibleEvents.value;
  return eligibleEvents.value.filter((item) => active.matcher(item));
});

const groupTitleMap: Record<string, string> = {
  upcoming_paid: 'これから参加',
  pending_approval: '審査中',
  refunding: '返金・キャンセル処理中',
  refunded: '返金済み / キャンセル済み',
  attended: '参加済み',
  expired: '受付終了',
  unpaid: '支払い待ち',
};

const groupOrder: Array<{ id: string; title: string }> = [
  { id: 'upcoming_paid', title: groupTitleMap.upcoming_paid },
  { id: 'pending_approval', title: groupTitleMap.pending_approval },
  { id: 'refunding', title: groupTitleMap.refunding },
  { id: 'refunded', title: groupTitleMap.refunded },
  { id: 'attended', title: groupTitleMap.attended },
  { id: 'expired', title: groupTitleMap.expired },
  { id: 'unpaid', title: groupTitleMap.unpaid },
];

const groupIdFor = (item: MyEventItem): string => {
  const paidLike = isPaidStatus(item);
  const refundedLike = item.status === 'refunded' || item.status === 'cancelled';
  const refundingLike = isRefundingStatus(item);
  if (refundingLike) return 'refunding';
  if (refundedLike) return 'refunded';
  if (item.status === 'pending') return 'pending_approval';
  if (item.attended) return 'attended';
  if (isExpired(item)) return 'expired';
  if (!paidLike) return 'unpaid';
  if (isUpcoming(item)) return 'upcoming_paid';
  return 'attended';
};

const groupedEvents = computed(() => {
  const groups: Record<string, MyEventItem[]> = {};
  groupOrder.forEach((g) => (groups[g.id] = []));
  filteredEvents.value.forEach((item) => {
    const gid = groupIdFor(item);
    if (!groups[gid]) groups[gid] = [];
    groups[gid].push(item);
  });
  const now = Date.now();
  Object.keys(groups).forEach((key) => {
    groups[key].sort((a, b) => {
      const aDiff = Math.abs(getStartTime(a).getTime() - now);
      const bDiff = Math.abs(getStartTime(b).getTime() - now);
      return aDiff - bDiff;
    });
  });
  const ordered = groupOrder
    .map((g) => ({ ...g, items: groups[g.id] || [] }))
    .filter((g) => g.items.length > 0);
  const extras = Object.keys(groups)
    .filter((id) => !groupOrder.find((g) => g.id === id))
    .map((id) => ({
      id,
      title: groupTitleMap[id] ?? 'その他',
      items: groups[id] || [],
    }))
    .filter((g) => g.items.length > 0);
  return [...ordered, ...extras];
});

const displayStart = (item: MyEventItem) => item.lesson?.startAt || item.event?.startTime || '';
const displayCommunity = (item: MyEventItem) =>
  item.lesson?.class?.community?.name || item.event?.community.name || '';
const displayLocation = (item: MyEventItem) =>
  item.lesson?.class?.locationName || item.event?.locationText || '';
const displayTitle = (item: MyEventItem) => {
  if (item.lesson?.class?.title) {
    const title = item.lesson.class.title;
    return typeof title === 'string' ? title : getLocalizedText(title);
  }
  if (item.event) return getLocalizedText(item.event.title);
  return 'クラス';
};

const titleFor = (event: MyEventItem['event']) => (event ? getLocalizedText(event.title) : '');
const refundOutcomeLabel = (item: MyEventItem) => {
  const total = item.amount ?? 0;
  if (total <= 0) return null;
  const refunded = item.refundRequest?.refundedAmount ?? null;
  if (refunded != null && refunded > 0) {
    return refunded < total ? '一部返金（ルール）' : '返金済み';
  }
  if (item.status === 'refunded') return '返金済み';
  if (item.status === 'cancelled') return '返金なし（ルール）';
  return null;
};
const statusLabel = (item: MyEventItem) => {
  const refundLabel = refundOutcomeLabel(item);
  if (refundLabel && (item.status === 'refunded' || item.status === 'cancelled')) return refundLabel;
  const map: Record<string, string> = {
    pending: '審査待ち',
    pending_payment: '支払い待ち',
    approved: '確認済み',
    rejected: '却下',
    paid: '支払い済み',
    refunded: '返金済み',
    pending_refund: '返金処理中',
    cancel_requested: 'キャンセル申請中',
    cancelled: 'キャンセル',
  };
  return map[item.status] ?? item.status;
};

const statusClass = (item: MyEventItem) => {
  if (isPendingStatus(item) || isPendingPaymentStatus(item)) return 'badge--pending';
  if (isPaidStatus(item)) return 'badge--paid';
  if (isRefundedStatus(item) || isRefundingStatus(item)) return 'badge--info';
  if (isCancelledStatus(item)) return 'badge--void';
  return 'badge--pending';
};

const formatDate = (value: string) =>
  value
    ? new Date(value).toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
      })
    : '';

const paymentLabel = (item: MyEventItem) => {
  const refundLabel = refundOutcomeLabel(item);
  if (refundLabel && (item.status === 'refunded' || item.status === 'cancelled')) return refundLabel;
  if (isRefundedStatus(item)) return '返金済み';
  if (isRefundingStatus(item)) return '返金処理中';
  if (isPendingPaymentStatus(item)) return '支払い待ち';
  if (isPendingStatus(item)) return '審査待ち';
  if (isApprovedAwaitingPayment(item)) return '支払い待ち';
  if (item.status === 'rejected') return '却下';
  if (item.status === 'cancelled') return 'キャンセル';
  if (isPaidStatus(item)) return (item.amount ?? 0) === 0 ? '無料' : '支払い済み';
  if ((item.amount ?? 0) === 0) return '無料';
  return '支払い状況確認中';
};

const paymentClass = (item: MyEventItem) => {
  if (isRefundedStatus(item) || isRefundingStatus(item)) return 'badge--info';
  if (isCancelledStatus(item)) return 'badge--void';
  if (isPendingStatus(item) || isPendingPaymentStatus(item)) return 'badge--pending';
  if (isPaidStatus(item)) return (item.amount ?? 0) === 0 ? 'badge--free' : 'badge--paid';
  if ((item.amount ?? 0) === 0) return 'badge--free';
  return 'badge--pending';
};

const phaseLabel = (item: MyEventItem) => {
  const now = Date.now();
  const startVal = displayStart(item);
  if (!startVal) return '開催予定';
  const start = new Date(startVal).getTime();
  const end = item.lesson?.endAt
    ? new Date(item.lesson.endAt).getTime()
    : item.event?.endTime
      ? new Date(item.event.endTime).getTime()
      : start;
  if (now < start) return '開催前';
  if (now >= start && now <= end) return '開催中';
  return '開催終了';
};

const stateSentence = (item: MyEventItem) => {
  if (item.status === 'cancel_requested') return 'キャンセル申請中です。主催者の確認をお待ちください。';
  if (item.status === 'pending_refund') return '返金処理中です';
  if (item.status === 'refunded') {
    return refundOutcomeLabel(item) === '一部返金（ルール）'
      ? '返金が完了しています（返金ルールによる一部返金）'
      : '返金が完了しています';
  }
  if (item.status === 'cancelled') return '参加はキャンセルされました（返金ルールによる返金なし）';
  if (item.status === 'rejected') return '申込が却下されました';
  if (item.status === 'pending_payment') return '支払い待ちです';
  if (item.status === 'pending') return '申込を審査中です';
  if (isApprovedAwaitingPayment(item)) return '申込が承認されました。支払いを完了してください。';
  if (isPaidStatus(item)) return '参加が確定しています';
  if (item.attended) return '参加済みです';
  if (item.noShow) return '欠席として記録されています';
  return '参加が進行中です';
};

const refundNotice = (item: MyEventItem) => {
  if (item.status === 'cancel_requested') return 'キャンセル申請を受け付けました。主催者の確認中です。';
  if (item.status === 'pending_refund') return '返金リクエストを処理しています';
  if (item.status === 'refunded') {
    return refundOutcomeLabel(item) === '一部返金（ルール）'
      ? '返金が完了しました（返金ルールによる一部返金）'
      : '返金が完了しました';
  }
  if (item.status === 'cancelled') return 'キャンセル済みです（返金ルールにより返金なし）。';
  return '';
};

const attendanceLabel = (item: MyEventItem) => {
  if (item.status === 'cancelled') return '';
  if (item.status === 'rejected') return '却下';
  if (item.status === 'refunded') return '返金済み';
  if (item.status === 'pending_refund' || item.status === 'cancel_requested') return '返金処理中';
  if (item.status === 'pending_payment') return '支払い待ち';
  if (item.status === 'pending') return '審査待ち';
  if (item.attended) return '出席済み';
  if (item.noShow) return '欠席';
  if (isExpired(item)) return '有効期限切れ';
  if (isUpcoming(item)) return '参加予定';
  return '記録中';
};

const attendanceClass = (item: MyEventItem) => {
  if (isCancelledStatus(item)) return 'badge--void';
  if (item.status === 'refunded' || item.status === 'pending_refund' || item.status === 'cancel_requested')
    return 'badge--info';
  if (isPendingStatus(item) || isPendingPaymentStatus(item)) return 'badge--pending';
  if (item.attended) return 'badge--attended';
  if (item.noShow) return 'badge--noshow';
  if (isExpired(item)) return 'badge--void';
  if (isUpcoming(item)) return 'badge--upcoming';
  return 'badge--pending';
};

const paymentBadgeLabel = (item: MyEventItem) => {
  const label = paymentLabel(item);
  if (!label) return '';
  if (label === statusLabel(item)) return '';
  if (label === attendanceLabel(item)) return '';
  return label;
};

const emptyStateTitle = computed(() => {
  if (activeTab.value === 'upcoming') return '参加予定がまだありません';
  if (activeTab.value === 'past') return 'まだ履歴がありません';
  if (activeTab.value === 'refund') return 'キャンセルの記録がありません';
  return '申込記録がありません';
});

const emptyStateMessage = computed(() => {
  if (activeTab.value === 'upcoming') return '申し込みイベントの最新状況を追跡できます。';
  if (activeTab.value === 'past') return '参加済みのイベントがここに表示されます。';
  if (activeTab.value === 'refund') return 'キャンセルの状況がここに表示されます。';
  return '気になるイベントを探してみましょう。';
});

const showBanner = (type: 'success' | 'error' | 'info', message: string) => {
  banner.value = { type, message };
  window.setTimeout(() => {
    banner.value = null;
  }, 3000);
};

const openTicketQr = (item: MyEventItem) => {
  if (isVoidTicket(item) || item.attended) return;
  qrTicket.value = item;
  qrVisible.value = true;
};

const closeTicketQr = () => {
  qrVisible.value = false;
  qrTicket.value = null;
  qrError.value = null;
};

const generateQr = async () => {
  if (!qrVisible.value || !qrTicket.value || !qrCanvas.value) return;
  qrError.value = null;
  const eventId = qrTicket.value.event?.id;
  if (!eventId) {
    qrError.value = 'イベント情報が見つかりません';
    return;
  }
  const payload = JSON.stringify({
    registrationId: qrTicket.value.registrationId,
    eventId,
  });
  try {
    await QRCode.toCanvas(qrCanvas.value, payload, {
      width: 240,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  } catch (err) {
    qrError.value = err instanceof Error ? err.message : 'QRコードの生成に失敗しました';
  }
};

let qrPollingTimer: number | null = null;

watch([qrVisible, qrTicket], async ([visible, ticket]) => {
  if (visible && ticket) {
    await nextTick();
    await generateQr();
  }
  if (visible && ticket) {
    if (!qrPollingTimer) {
      qrPollingTimer = window.setInterval(async () => {
        await refreshEventsSilent();
        const updated = events.value.find((event) => event.registrationId === ticket.registrationId);
        if (updated?.attended) {
          showBanner('success', 'チェックインが完了しました。');
          closeTicketQr();
        }
      }, 8000);
    }
  } else if (qrPollingTimer) {
    window.clearInterval(qrPollingTimer);
    qrPollingTimer = null;
  }
});

const cancelRegistration = async (item: MyEventItem) => {
  if (cancelingId.value) return;
  const sure = await confirmDialog(buildCancelPrompt(item));
  if (!sure) return;
  cancelingId.value = item.registrationId;
  try {
    const result = await cancelMyRegistration(item.registrationId);
    const nextStatus = result?.status || 'cancelled';
    events.value = events.value.map((event) =>
      event.registrationId === item.registrationId ? { ...event, status: nextStatus } : event,
    );
    await refreshEventsSilent();
    if (nextStatus === 'cancel_requested') {
      showBanner('info', 'キャンセル申請を受け付けました。有料イベントは主催者確認後に処理されます。');
    } else if (nextStatus === 'pending_refund') {
      showBanner('info', 'キャンセルしました。返金処理中です。');
    } else if (nextStatus === 'refunded') {
      showBanner('success', 'キャンセルしました。返金を実行しました。');
    } else {
      showBanner('success', 'キャンセルしました。');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'キャンセルに失敗しました。しばらくして再試行してください。';
    showBanner('error', message);
  } finally {
    cancelingId.value = null;
  }
};

const canCancel = (item: MyEventItem) => {
  if (isVoidTicket(item)) return false;
  if (!isUpcoming(item)) return false;
  if (item.attended) return false;
  return !['refunded', 'pending_refund', 'cancelled', 'rejected', 'cancel_requested'].includes(item.status);
};

const goBack = () => {
  const back = typeof window !== 'undefined' ? window.history.state?.back : null;
  if (back) {
    router.back();
    return;
  }
  router.replace({ name: 'MobileMe' });
};

const hashToIndex = (value: string, length: number) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % length;
};

const coverUrlFor = (item: MyEventItem) => {
  if (item.event?.coverImageUrl) return item.event.coverImageUrl;
  const fallbacks = fallbackCoverImages.value;
  const hashId = item.event?.id || item.lesson?.id || 'fallback';
  const index = hashToIndex(hashId, fallbacks.length || 1);
  return fallbacks[index];
};

const ticketCoverStyle = (item: MyEventItem) => {
  const cover = coverUrlFor(item);
  const resolved = resolveAssetUrl(cover);
  return {
    backgroundImage: `linear-gradient(135deg, rgba(5, 9, 23, 0.9), rgba(9, 14, 34, 0.65)), url(${resolved})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
};

const refundFlagLabel = (item: MyEventItem) => {
  if (item.status === 'cancel_requested') return 'キャンセル申請中';
  if (item.status === 'pending_refund') return '返金処理中';
  return '';
};

const isRefunding = (item: MyEventItem) => isRefundingStatus(item);
</script>

<style scoped>
.my-events-page {
  min-height: 100vh;
  background: #f5f7fb;
  padding: calc(env(safe-area-inset-top, 0px) + 8px) 16px calc(64px + env(safe-area-inset-bottom, 0px)) 16px;
  padding-left: calc(16px + env(safe-area-inset-left, 0px));
  padding-right: calc(16px + env(safe-area-inset-right, 0px));
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
  overflow-x: hidden;
  touch-action: pan-y;
  overscroll-behavior-x: none;
}
.topbar {
  margin-left: calc(-16px - env(safe-area-inset-left, 0px));
  margin-right: calc(-16px - env(safe-area-inset-right, 0px));
  margin-top: calc(-8px - env(safe-area-inset-top, 0px));
}

.page-header {
  width: 100%;
  padding: 12px 0 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-x: hidden;
  box-sizing: border-box;
}

.page-header__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-eyebrow {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}

.page-header h1 {
  margin: 0;
  font-size: 24px;
  color: #0f172a;
  font-weight: 700;
}

.page-subtext {
  margin: 0;
  color: #475569;
  font-size: 14px;
}

.segmented-control {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  background: #e2e8f0;
  padding: 6px;
  border-radius: 999px;
  box-shadow: none;
}

.segmented-button {
  border: none;
  border-radius: 999px;
  background: transparent;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  white-space: nowrap;
}

.segmented-button__count {
  font-size: 11px;
  font-weight: 600;
  color: inherit;
  opacity: 0.8;
}

.segmented-button--active {
  background: #fff;
  color: #0f172a;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12);
}

.events-section {
  width: 100%;
  padding: 8px 0 48px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-x: hidden;
  box-sizing: border-box;
}
.group-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.group-title {
  margin: 8px 0 4px;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.feedback {
  margin: 0;
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
}

.feedback--success {
  background: #dcfce7;
  color: #166534;
}

.feedback--error {
  background: #fee2e2;
  color: #b91c1c;
}

.feedback--info {
  background: #eff6ff;
  color: #1d4ed8;
}

.ticket-card-wrapper {
  position: relative;
  padding-bottom: 8px;
}

.ticket-card {
  position: relative;
  background: #fff;
  border-radius: 24px;
  padding: 20px 18px 18px;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(15, 23, 42, 0.04);
  overflow: hidden;
}

.ticket-card--with-cover {
  color: #f8fafc;
}

.ticket-card--validated {
  filter: saturate(0.8);
}

.ticket-card--void {
  filter: grayscale(0.85);
  opacity: 0.7;
}
.ticket-card--refunding {
  border: 1px dashed rgba(234, 88, 12, 0.8);
  box-shadow: none;
}

.ticket-card__void-stamp {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-11deg);
  padding: 12px 36px;
  border: 2px solid #ff1e1e;
  color: #ff1e1e;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.32rem;
  text-transform: uppercase;
  border-radius: 10px;
  background: transparent;
  z-index: 9999;
  pointer-events: none;
}

.ticket-card::before,
.ticket-card::after {
  content: '';
  position: absolute;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #f5f7fb;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.04);
  top: 50%;
  transform: translateY(-50%);
}

.ticket-card__tear {
  position: absolute;
  top: 0;
  right: 0;
  width: 90px;
  height: 90px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0));
  clip-path: polygon(0 0, 100% 0, 0 100%);
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 10px;
  pointer-events: none;
}

.ticket-card__tear span {
  font-size: 12px;
  font-weight: 700;
  color: #ea580c;
  transform: rotate(-15deg);
}

.ticket-card::before {
  left: -12px;
}

.ticket-card::after {
  right: -12px;
}

.ticket-card--skeleton {
  min-height: 160px;
  background: linear-gradient(90deg, #eef1f6 25%, #e2e6ef 37%, #eef1f6 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

.ticket-card__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #64748b;
  padding-bottom: 12px;
  border-bottom: 1px dashed rgba(148, 163, 184, 0.5);
  position: relative;
  z-index: 1;
  gap: 12px;
}

.ticket-card__meta-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.ticket-card--with-cover .ticket-card__top {
  color: rgba(248, 250, 252, 0.85);
  border-bottom-color: rgba(255, 255, 255, 0.3);
}

.ticket-card__date,
.ticket-card__code {
  margin: 0;
}

.ticket-card--with-cover .ticket-card__date,
.ticket-card--with-cover .ticket-card__code {
  color: rgba(248, 250, 252, 0.82);
}

.ticket-card__qr {
  padding: 6px 10px;
  border-radius: 12px;
  border: 1px dashed rgba(148, 163, 184, 0.6);
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.ticket-card--with-cover .ticket-card__qr {
  border-color: rgba(255, 255, 255, 0.6);
  color: rgba(255, 255, 255, 0.88);
}

.ticket-card__cancel {
  border: 1px solid rgba(15, 23, 42, 0.15);
  background: rgba(15, 23, 42, 0.05);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 10px;
  color: rgba(15, 23, 42, 0.7);
  cursor: pointer;
  white-space: nowrap;
}

.ticket-card__cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ticket-card--with-cover .ticket-card__cancel {
  border-color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.88);
}

.ticket-qr-overlay {
  position: fixed;
  inset: 0;
  background: rgba(3, 6, 17, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.ticket-qr-modal {
  width: min(360px, 90vw);
  background: #fff;
  border-radius: 24px;
  padding: 24px 20px 28px;
  position: relative;
  text-align: center;
  box-shadow: 0 25px 60px rgba(3, 7, 18, 0.45);
}

.qr-close {
  position: absolute;
  top: 12px;
  right: 12px;
  border: none;
  background: rgba(15, 23, 42, 0.05);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #0f172a;
  cursor: pointer;
}

.qr-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.qr-subtitle {
  margin: 4px 0 14px;
  font-size: 14px;
  color: #475569;
}

.qr-canvas {
  width: 240px;
  height: 240px;
  margin: 0 auto 12px;
  display: block;
  border-radius: 18px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, 0.4);
  padding: 12px;
  box-sizing: border-box;
}

.qr-code {
  margin: 0;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: #0f172a;
}

.qr-hint {
  margin: 8px 0 0;
  font-size: 13px;
  color: #475569;
}

.qr-error {
  margin-top: 12px;
  color: #b91c1c;
  font-size: 13px;
}

.qr-primary {
  margin-top: 16px;
  width: 100%;
  border: none;
  border-radius: 16px;
  padding: 12px;
  background: #0ea5e9;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  box-shadow: 0 18px 30px rgba(14, 165, 233, 0.35);
}

.qr-fade-enter-active,
.qr-fade-leave-active {
  transition: opacity 0.2s ease;
}

.qr-fade-enter-from,
.qr-fade-leave-to {
  opacity: 0;
}

.ticket-card__title {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
  font-weight: 700;
}

.ticket-card--with-cover .ticket-card__title {
  color: #fff;
}

.ticket-card__community {
  margin: 0;
  font-size: 15px;
  color: #334155;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ticket-card--with-cover .ticket-card__community {
  color: rgba(248, 250, 252, 0.9);
}

.ticket-card--void .ticket-card__community {
  color: rgba(248, 250, 252, 0.72);
}

.ticket-card__meta {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.ticket-card--with-cover .ticket-card__meta {
  color: rgba(248, 250, 252, 0.8);
}

.ticket-card--void .ticket-card__title,
.ticket-card--void .ticket-card__meta,
.ticket-card--void .ticket-card__date {
  color: rgba(248, 250, 252, 0.75);
}

.ticket-card__state-line {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.ticket-card--with-cover .ticket-card__state-line {
  color: rgba(248, 250, 252, 0.95);
}

.ticket-card__badges {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.ticket-card__expired-label {
  margin: 4px 0;
  font-size: 12px;
  color: #9f1239;
  font-weight: 700;
}
.ticket-card__flag {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: rgba(234, 88, 12, 0.9);
  color: #fff;
  z-index: 2;
}
.ticket-card__flag--refunding {
  background: rgba(234, 88, 12, 0.9);
  border: 1px solid rgba(234, 88, 12, 0.7);
}

.ticket-card__badge {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.ticket-card__badge--phase {
  background: #e2e8f0;
  color: #0f172a;
}

.ticket-card--with-cover .ticket-card__badge {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.4);
}

.ticket-card--void .ticket-card__badge {
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.25);
}

.badge--free {
  background: #e2e8f0;
  color: #0f172a;
}
.badge--paid {
  background: #dcfce7;
  color: #15803d;
}
.badge--pending {
  background: #fef3c7;
  color: #b45309;
}
.badge--info {
  background: #dbeafe;
  color: #1d4ed8;
}
.badge--attended {
  background: #bbf7d0;
  color: #15803d;
}
.badge--noshow {
  background: #fee2e2;
  color: #b91c1c;
}
.badge--upcoming {
  background: #dbeafe;
  color: #1d4ed8;
}
.badge--void {
  background: #f1f5f9;
  color: #475569;
}

.ticket-card__footer {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  border-top: 1px dashed rgba(148, 163, 184, 0.5);
  padding-top: 12px;
  position: relative;
  z-index: 1;
}

.ticket-card--with-cover .ticket-card__footer {
  border-top-color: rgba(255, 255, 255, 0.3);
}

.ticket-card__void-footer {
  flex: 1;
  text-align: center;
  padding: 10px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(15, 23, 42, 0.8);
  border: 1px dashed rgba(15, 23, 42, 0.2);
  border-radius: 12px;
}

.ticket-card--with-cover .ticket-card__void-footer {
  color: rgba(255, 255, 255, 0.85);
  border-color: rgba(255, 255, 255, 0.35);
}

.ghost-btn,
.ticket-btn {
  flex: 1;
  border-radius: 14px;
  padding: 12px;
  font-size: 14px;
  font-weight: 600;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  color: #0f172a;
}

.ticket-btn {
  background: #ea580c;
  color: #fff;
  border: none;
  box-shadow: 0 12px 25px rgba(234, 88, 12, 0.25);
}

.ghost-btn--muted {
  background: rgba(15, 23, 42, 0.04);
  border-color: rgba(15, 23, 42, 0.12);
  color: #0f172a;
}

.ticket-card--with-cover .ghost-btn,
.ticket-card--with-cover .ticket-btn {
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.ticket-card--with-cover .ghost-btn {
  background: rgba(255, 255, 255, 0.16);
}

.ticket-card--with-cover .ticket-btn {
  background: rgba(255, 255, 255, 0.24);
  box-shadow: none;
}

.ticket-btn:disabled {
  opacity: 0.7;
  box-shadow: none;
}

.ticket-card__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  z-index: 1;
}

.state-card {
  padding: 24px;
  border-radius: 20px;
  background: #fff;
  text-align: center;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.05);
}

.state-card__title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.state-card__message {
  margin: 8px 0 16px;
  color: #475569;
  font-size: 14px;
}

@keyframes shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>
<style scoped>
.ticket-card__void-mask {
  display: none;
}
</style>
.ticket-card__void-mask {
  position: absolute;
  inset: 0;
  border-radius: 24px;
  background: rgba(9, 12, 24, 0.65);
  pointer-events: none;
}
