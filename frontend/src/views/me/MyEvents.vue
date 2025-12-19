<template>
  <div class="my-events-page">
    <ConsoleTopBar v-if="!isLiffClientMode" class="topbar" title="マイイベント" @back="goBack" />
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
        <article v-if="!filteredEvents.length" class="state-card">
          <p class="state-card__title">{{ emptyStateTitle }}</p>
          <p class="state-card__message">{{ emptyStateMessage }}</p>
          <RouterLink class="ghost-btn" to="/events">イベントを探す</RouterLink>
        </article>

        <section class="disclosure-card">
          <p class="disclosure-title">返金・キャンセル / 法令リンク</p>
          <ul class="disclosure-list">
            <li>返金可否・割合・期限はイベント表示条件が優先されます。申請期限超過は返金不可の場合があります。</li>
            <li>返金手数料・為替差・振込手数料・チャージバック費用等が控除される場合があります。</li>
            <li>コンテンツ・安全性・履行は主催者の責任です。プラットフォームは中継・決済連携のみ提供します。</li>
          </ul>
          <div class="disclosure-links">
            <a href="/legal/docs/PAYMENT_NOTICE_FOR_UI.md" target="_blank" rel="noopener">支払案内</a>
            <span>・</span>
            <a href="/legal/docs/REFUND_NOTICE_FOR_UI.md" target="_blank" rel="noopener">返金案内</a>
            <span>・</span>
            <a href="/legal/terms" target="_blank" rel="noopener">利用規約</a>
            <span>・</span>
            <a href="/legal/privacy" target="_blank" rel="noopener">プライバシー</a>
          </div>
        </section>

        <div v-for="item in filteredEvents" :key="item.registrationId" class="ticket-card-wrapper">
          <article
            class="ticket-card ticket-card--with-cover"
            :class="{
              'ticket-card--validated': item.attended,
              'ticket-card--void': isVoidTicket(item),
            }"
            :style="ticketCoverStyle(item)"
          >
            <div v-if="item.attended && !isVoidTicket(item)" class="ticket-card__tear">
              <span>検証済み</span>
            </div>
            <div class="ticket-card__top">
              <div>
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
          <p class="ticket-card__meta">{{ displayLocation(item) }}</p>
          <p class="ticket-card__state-line">{{ stateSentence(item) }}</p>
          <div class="ticket-card__badges">
            <span class="ticket-card__badge ticket-card__badge--phase">{{ phaseLabel(item) }}</span>
            <span class="ticket-card__badge" :class="statusClass(item)">{{ statusLabel(item) }}</span>
            <span class="ticket-card__badge" :class="attendanceClass(item)">{{ attendanceLabel(item) }}</span>
            <span class="ticket-card__badge" :class="paymentClass(item)">{{ paymentLabel(item) }}</span>
          </div>
          <p v-if="refundNotice(item)" class="ticket-card__notice">{{ refundNotice(item) }}</p>
        </div>
            <footer class="ticket-card__footer">
              <button
                v-if="!isVoidTicket(item)"
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
      </template>
    </section>

    <Transition name="qr-fade">
      <section v-if="qrVisible && qrTicket" class="ticket-qr-overlay" @click.self="closeTicketQr">
        <article class="ticket-qr-modal">
          <button type="button" class="qr-close" @click="closeTicketQr">
            <span class="i-lucide-x"></span>
          </button>
          <p class="qr-title">QRコードを表示</p>
          <p class="qr-subtitle">{{ getLocalizedText(qrTicket.event.title) }}</p>
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
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { cancelMyRegistration, fetchMyEvents } from '../../api/client';
import type { MyEventItem } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import { resolveAssetUrl } from '../../utils/assetUrl';
import QRCode from 'qrcode';
import { useResourceConfig } from '../../composables/useResourceConfig';
import { useConfirm } from '../../composables/useConfirm';
import ConsoleTopBar from '../../components/console/ConsoleTopBar.vue';
import { isLiffClient } from '../../utils/device';
import { isLineInAppBrowser } from '../../utils/liff';
import { APP_TARGET } from '../../config';

type FilterTabId = 'upcoming' | 'past' | 'all';

const router = useRouter();
const events = ref<MyEventItem[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const banner = ref<{ type: 'success' | 'error'; message: string } | null>(null);
const cancelingId = ref<string | null>(null);
const activeTab = ref<FilterTabId>('upcoming');
const qrVisible = ref(false);
const qrTicket = ref<MyEventItem | null>(null);
const qrCanvas = ref<HTMLCanvasElement | null>(null);
const qrError = ref<string | null>(null);
const isLiffClientMode = computed(() => APP_TARGET === 'liff' || isLineInAppBrowser() || isLiffClient());
const resourceConfigStore = useResourceConfig();
const { confirm: confirmDialog } = useConfirm();
const { slotMap } = resourceConfigStore;
const fallbackCoverImages = computed(() => {
  const list = resourceConfigStore.getListValue('mobile.eventList.cardFallbacks');
  if (list.length) return list;
  return (slotMap['mobile.eventList.cardFallbacks'].defaultValue as string[]) ?? [];
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

onMounted(() => {
  loadEvents();
});

const isVoidTicket = (item: MyEventItem) =>
  ['cancelled', 'refunded', 'pending_refund', 'rejected'].includes(item.status);

const getStartTime = (item: MyEventItem) => {
  if (item.lesson?.startAt) return new Date(item.lesson.startAt);
  if (item.event?.startTime) return new Date(item.event.startTime);
  return new Date(0);
};

const isUpcoming = (item: MyEventItem) => !isVoidTicket(item) && getStartTime(item) > new Date();

const sortedEvents = computed(() =>
  [...events.value].sort((a, b) => getStartTime(b).getTime() - getStartTime(a).getTime()),
);

const filterDefinitions: Array<{ id: FilterTabId; label: string; matcher: (item: MyEventItem) => boolean }> = [
  { id: 'upcoming', label: 'これから', matcher: (item) => isUpcoming(item) },
  { id: 'past', label: '過去', matcher: (item) => !isUpcoming(item) },
  { id: 'all', label: 'すべて', matcher: () => true },
];

const filterCounts = computed(() => ({
  upcoming: sortedEvents.value.filter((item) => isUpcoming(item)).length,
  past: sortedEvents.value.filter((item) => !isUpcoming(item)).length,
  all: sortedEvents.value.length,
}));

const filterTabs = computed(() =>
  filterDefinitions.map((tab) => ({
    ...tab,
    count: filterCounts.value[tab.id],
  })),
);

const filteredEvents = computed(() => {
  const active = filterDefinitions.find((tab) => tab.id === activeTab.value);
  if (!active) return sortedEvents.value;
  return sortedEvents.value.filter((item) => active.matcher(item));
});

const displayStart = (item: MyEventItem) => item.lesson?.startAt || item.event?.startTime || '';
const displayCommunity = (item: MyEventItem) =>
  item.lesson?.class?.community?.name || item.event?.community.name || '';
const displayLocation = (item: MyEventItem) =>
  item.lesson?.class?.locationName || item.event?.locationText || '';
const displayTitle = (item: MyEventItem) => {
  if (item.lesson?.class?.title) return getLocalizedText(item.lesson.class.title);
  if (item.event) return getLocalizedText(item.event.title);
  return 'クラス';
};

const titleFor = (event: MyEventItem['event']) => getLocalizedText(event.title);
const statusLabel = (item: MyEventItem) => {
  const map: Record<string, string> = {
    pending: '審査待ち',
    approved: '確認済み',
    rejected: '却下',
    paid: '支払い完了',
    refunded: '返金済み',
    pending_refund: '返金処理中',
    cancelled: 'キャンセル',
  };
  return map[item.status] ?? item.status;
};

const statusClass = (item: MyEventItem) => {
  if (item.status === 'pending') return 'badge--pending';
  if (item.status === 'approved' || item.status === 'paid') return 'badge--paid';
  if (item.status === 'refunded') return 'badge--info';
  if (item.status === 'pending_refund') return 'badge--pending';
  if (item.status === 'cancelled' || item.status === 'rejected') return 'badge--void';
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
  if ((item.amount ?? 0) === 0) return '無料';
  if (item.paymentStatus === 'refunded') return '返金済み';
  if (item.paymentStatus === 'paid') return '支払い完了';
  return '支払い待ち';
};

const paymentClass = (item: MyEventItem) => {
  if ((item.amount ?? 0) === 0) return 'badge--free';
  if (item.paymentStatus === 'refunded') return 'badge--info';
  return item.paymentStatus === 'paid' ? 'badge--paid' : 'badge--pending';
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
  if (item.status === 'cancelled') return '参加はキャンセルされました';
  if (item.status === 'rejected') return '申込が却下されました';
  if (item.status === 'pending_refund' || item.status === 'refunded') return '返金処理中です';
  if (item.paymentStatus === 'refunded') return '返金が完了しています';
  if (item.paymentStatus === 'paid') return '参加が確定しています';
  if (item.status === 'pending') return '申込を審査中です';
  if (item.attended) return '参加済みです';
  if (item.noShow) return '欠席として記録されています';
  return '参加が進行中です';
};

const refundNotice = (item: MyEventItem) => {
  if (item.status === 'pending_refund') return '返金リクエストを処理しています';
  if (item.status === 'refunded') return '返金が完了しました';
  if (item.status === 'cancelled' && item.paymentStatus !== 'refunded') return 'キャンセル済みです。返金が必要な場合はご確認ください。';
  return '';
};

const attendanceLabel = (item: MyEventItem) => {
  if (item.status === 'cancelled') return 'キャンセル';
  if (item.status === 'refunded' || item.status === 'pending_refund') return '返金処理中';
  if (item.attended) return '出席済み';
  if (item.noShow) return '欠席';
  if (isUpcoming(item)) return '参加予定';
  return '記録中';
};

const attendanceClass = (item: MyEventItem) => {
  if (item.status === 'cancelled') return 'badge--void';
  if (item.status === 'refunded' || item.status === 'pending_refund') return 'badge--info';
  if (item.attended) return 'badge--attended';
  if (item.noShow) return 'badge--noshow';
  if (isUpcoming(item)) return 'badge--upcoming';
  return 'badge--pending';
};

const emptyStateTitle = computed(() => {
  if (activeTab.value === 'upcoming') return '参加予定がまだありません';
  if (activeTab.value === 'past') return 'まだ履歴がありません';
  return '申込記録がありません';
});

const emptyStateMessage = computed(() => {
  if (activeTab.value === 'upcoming') return 'イベントに申し込むとここで状態を追跡できます。';
  if (activeTab.value === 'past') return '参加済みのイベントがここに表示されます。';
  return '気になるイベントを探してみましょう。';
});

const showBanner = (type: 'success' | 'error' | 'info', message: string) => {
  banner.value = { type, message };
  window.setTimeout(() => {
    banner.value = null;
  }, 3000);
};

const openTicketQr = (item: MyEventItem) => {
  if (isVoidTicket(item)) return;
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
  const payload = JSON.stringify({
    registrationId: qrTicket.value.registrationId,
    eventId: qrTicket.value.event.id,
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

watch([qrVisible, qrTicket], async ([visible, ticket]) => {
  if (visible && ticket) {
    await nextTick();
    await generateQr();
  }
});

const cancelRegistration = async (item: MyEventItem) => {
  if (cancelingId.value) return;
  const sure = await confirmDialog('この参加をキャンセルしてもよろしいですか？');
  if (!sure) return;
  cancelingId.value = item.registrationId;
  try {
    const result = await cancelMyRegistration(item.registrationId);
    const nextStatus = result?.status || 'cancelled';
    events.value = events.value.map((event) =>
      event.registrationId === item.registrationId ? { ...event, status: nextStatus } : event,
    );
    if (nextStatus === 'cancel_requested') {
      showBanner('info', 'キャンセル申請を受け付けました。有料イベントは主催者確認後に処理されます。');
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
  return !['refunded', 'pending_refund', 'cancelled', 'rejected', 'cancel_requested'].includes(item.status);
};

const goBack = () => {
  router.push({ name: 'MobileMe' });
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
  const fallbacks = fallbackCoverImages.value.length
    ? fallbackCoverImages.value
    : ((slotMap['mobile.eventList.cardFallbacks'].defaultValue as string[]) ?? []);
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
  padding: 24px 0 8px;
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  background: #e2e8f0;
  padding: 6px;
  border-radius: 999px;
}

.segmented-button {
  border: none;
  border-radius: 999px;
  background: transparent;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 600;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.segmented-button__count {
  font-size: 12px;
  font-weight: 600;
  color: inherit;
  opacity: 0.8;
}

.segmented-button--active {
  background: #fff;
  color: #0f172a;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.15);
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

.disclosure-card {
  background: #f1f5f9;
  border-radius: 12px;
  padding: 12px;
  margin: 0 0 12px;
  font-size: 13px;
  color: #1f2a3d;
  line-height: 1.5;
  border: 1px solid rgba(15, 23, 42, 0.05);
}

.disclosure-title {
  margin: 0 0 6px;
  font-weight: 700;
  font-size: 14px;
}

.disclosure-list {
  margin: 0 0 6px;
  padding-left: 18px;
}

.disclosure-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 13px;
}

.disclosure-links a {
  color: #2563eb;
  text-decoration: underline;
}

.ticket-card-wrapper {
  position: relative;
}

.ticket-card {
  position: relative;
  background: #fff;
  border-radius: 24px;
  padding: 20px 18px 18px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.12);
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
