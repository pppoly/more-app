<template>
  <div class="page">
    <ConsoleTopBar titleKey="console.eventManage.title" @back="goBack" />

    <div v-if="showSkeleton" class="skeleton-overlay" aria-hidden="true">
      <div class="skeleton-stack">
        <section class="panel skeleton-panel">
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line long mt-2"></div>
          <div class="skeleton-line short mt-3"></div>
        </section>
        <section class="panel skeleton-panel">
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line long mt-2"></div>
          <div class="skeleton-line short mt-3"></div>
          <div class="skeleton-entry" v-for="i in 3" :key="'summary-'+i">
            <div class="skeleton-line medium"></div>
            <div class="skeleton-line short mt-2"></div>
          </div>
        </section>
        <section class="panel skeleton-panel">
          <div class="skeleton-line medium"></div>
          <div class="skeleton-entry" v-for="i in 4" :key="'entry-'+i">
            <div class="avatar-shell">
              <span class="avatar empty shimmer"></span>
            </div>
            <div class="entry-main">
              <div class="skeleton-line medium"></div>
              <div class="skeleton-line long mt-2"></div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <template v-else-if="error">
      <section class="panel error-panel">
        <p class="eyebrow">読み込みに失敗しました</p>
        <p class="panel-title">{{ error }}</p>
        <button class="btn neutral mt-3 w-full" @click="reload">再読み込み</button>
      </section>
    </template>

    <template v-else-if="eventCard">
      <section class="panel info-card">
        <div class="info-header">
          <div class="status-row">
            <span class="status-dot" :class="statusDotClass(eventCard.status)"></span>
            <span class="status-text">{{ statusLabel(eventCard.status) }}</span>
          </div>
          <h1 class="info-title line-clamp-2">{{ eventCard.title }}</h1>
          <p class="info-meta">
            <span class="i-lucide-calendar mr-1"></span>{{ eventCard.dateTimeText }}
          </p>
          <p v-if="eventCard.locationText" class="info-meta">
            <span class="i-lucide-map-pin mr-1"></span>{{ eventCard.locationText }}
          </p>
          <p class="info-id">ID: {{ eventCard.id }}</p>
        </div>
      </section>

      <section class="panel" v-if="summaryCard">
        <div class="panel-head">
          <div>
            <p class="eyebrow">参加状況</p>
            <h2 class="panel-title">{{ summaryCard.totalConfirmed }}/{{ summaryCard.capacity }} 人</h2>
            <p class="muted">支払い済み {{ summaryCard.paidCount }} 人</p>
          </div>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" :style="{ width: summaryCard.progressPercent + '%' }"></div>
        </div>
        <div class="ticket-breakdown" v-if="summaryCard.tickets.length">
          <div v-for="ticket in summaryCard.tickets.slice(0, 1)" :key="ticket.id" class="ticket-row">
            <div class="ticket-meta">
              <span class="ticket-dot"></span>
              <span class="ticket-name">{{ ticket.name }}</span>
            </div>
            <div class="ticket-progress">
              <div class="ticket-progress-bar" :style="{ width: ticket.progressPercent + '%' }"></div>
            </div>
            <span class="ticket-count">{{ ticket.confirmed }}/{{ ticket.capacity }}</span>
          </div>
        </div>
      </section>
      <section v-else class="section-block inline-empty">
        <p class="eyebrow">申込状況</p>
        <p class="muted">まだデータがありません。募集が始まるとここに表示されます。</p>
      </section>

      <section class="section-block" ref="memberListRef">
        <div class="panel-head">
          <div>
            <p class="eyebrow">参加者</p>
            <h2 class="panel-title">リスト</h2>
            <p class="count-text">{{ entries.length }} 人</p>
          </div>
          <button class="inline-link" type="button" @click="scrollToMemberList">
            一覧を見る<span class="i-lucide-chevron-right ml-1"></span>
          </button>
        </div>
        <div
          v-for="entry in entries"
          :key="entry.id"
          class="entry-row"
          @click="openEntryAction(entry)"
        >
          <div class="avatar-shell">
            <img v-if="entry.avatarUrl" :src="entry.avatarUrl" class="avatar" alt="" />
            <span v-else class="avatar empty">{{ entry.initials }}</span>
          </div>
          <div class="entry-main">
            <div class="entry-head">
              <p class="entry-name">{{ entry.name }}</p>
              <span class="entry-chip" :class="entryStatusBadgeClass(entry)">
                {{ entryStatusLabel(entry) }}
              </span>
            </div>
            <p class="entry-sub">
              {{ entry.ticketName }} · {{ entry.createdAtText }}
            </p>
          </div>
          <span class="i-lucide-chevron-right text-slate-300"></span>
        </div>
        <div v-if="!entries.length && !loading" class="empty-state">まだ参加者がいません。小さく始まっても大丈夫です。</div>
      </section>

      <div class="action-bar">
        <button class="action-secondary" type="button" @click="openPublicPage">
          公開ページを見る
        </button>
        <button class="action-primary" type="button" @click="editEvent">
          内容を編集
        </button>
        <button class="action-more" type="button" aria-label="その他操作" @click="openMoreActions">
          <img :src="moreIcon" alt="" aria-hidden="true" />
        </button>
      </div>

      <div v-if="showMoreSheet" class="sheet-mask" @click.self="closeMoreActions">
        <div class="sheet">
          <div class="sheet-handle"></div>
          <button class="sheet-action" type="button" :disabled="!communityId" @click="handlePayments">
            支払い・取引
          </button>
          <button class="sheet-action danger" type="button" :disabled="cancelling" @click="cancelEvent">
            {{ cancelling ? '取消中…' : 'イベントを取消' }}
          </button>
          <button class="sheet-close" type="button" @click="closeMoreActions">閉じる</button>
        </div>
      </div>

      <div v-if="activeEntry" class="sheet-mask" @click.self="closeEntryAction">
        <div class="sheet">
          <div class="sheet-handle"></div>
          <div class="flex items-center mb-3">
            <div class="avatar-shell">
              <img v-if="activeEntry.avatarUrl" :src="activeEntry.avatarUrl" class="avatar" alt="" />
              <span v-else class="avatar empty">{{ activeEntry.initials }}</span>
            </div>
            <div class="ml-2">
              <p class="sheet-name">{{ activeEntry.name }}</p>
              <p class="sheet-sub">
                {{ activeEntry.ticketName }} · {{ entryStatusLabel(activeEntry) }}
              </p>
            </div>
          </div>
          <button
            v-if="activeEntry.status === 'pending'"
            class="sheet-action"
            :disabled="entryActionLoading[activeEntry.id]"
            @click="approveEntry"
          >
            {{ entryActionLoading[activeEntry.id] ? '処理中…' : '承認する' }}
          </button>
          <button
            v-if="activeEntry.status === 'pending'"
            class="sheet-action danger"
            :disabled="entryActionLoading[activeEntry.id]"
            @click="rejectEntry"
          >
            {{ entryActionLoading[activeEntry.id] ? '処理中…' : '拒否する' }}
          </button>
          <button class="sheet-close" @click="closeEntryAction">閉じる</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  fetchConsoleEvent,
  fetchEventRegistrations,
  fetchEventRegistrationsSummary,
  approveEventRegistration,
  rejectEventRegistration,
  cancelConsoleEvent,
} from '../../../api/client';
import type {
  ConsoleEventDetail,
  ConsoleEventRegistrationItem,
  EventRegistrationsSummary,
} from '../../../types/api';
import { getLocalizedText } from '../../../utils/i18nContent';
import { useResourceConfig } from '../../../composables/useResourceConfig';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';
import moreIcon from '../../../assets/icons/more-horizontal.svg';

const route = useRoute();
const router = useRouter();
const eventId = computed(() => route.params.eventId as string);
const communityId = computed(() => eventDetail.value?.communityId);

const loading = ref(true);
const error = ref('');
const cancelling = ref(false);
const showSkeleton = computed(() => loading.value || (!eventCard.value && !error.value));
const eventDetail = ref<ConsoleEventDetail | null>(null);
const summary = ref<EventRegistrationsSummary | null>(null);
const registrations = ref<ConsoleEventRegistrationItem[]>([]);
const activeEntry = ref<ReturnType<typeof mapEntry> | null>(null);
const memberListRef = ref<HTMLElement | null>(null);
const showMoreSheet = ref(false);
const entryActionLoading = ref<Record<string, boolean>>({});

const eventCard = computed(() => {
  if (!eventDetail.value) return null;
  return {
    id: eventDetail.value.id,
    title: getLocalizedText(eventDetail.value.title),
    status: eventDetail.value.status,
    dateTimeText: formatDate(eventDetail.value.startTime, eventDetail.value.endTime),
    locationText: eventDetail.value.locationText,
  };
});

const resourceConfig = useResourceConfig();
const { slotMap } = resourceConfig;
const memberAvatarFallback = computed(
  () =>
    resourceConfig.getStringValue('mobile.console.memberAvatar') ||
    (slotMap['mobile.console.memberAvatar'].defaultValue as string),
);

const summaryCard = computed(() => {
  if (!summary.value) return null;
  const total = summary.value.totalRegistrations;
  const capacity = summary.value.capacity ?? total;
  const progressPercent = capacity ? Math.min(100, Math.round((total / capacity) * 100)) : 0;
  const avatars = summary.value.avatars?.slice(0, 5) ?? [];
  const groups = summary.value.groups ?? [];
  return {
    totalConfirmed: total,
    capacity,
    paidCount: summary.value.paidRegistrations,
    progressPercent,
    sampleParticipants: avatars.map((avatar) => ({
      id: avatar.userId,
      avatarUrl: avatar.avatarUrl ?? memberAvatarFallback.value,
    })),
    tickets: groups.map((group) => ({
      id: group.label,
      name: group.label,
      confirmed: group.count,
      capacity: group.capacity ?? capacity,
      progressPercent: group.capacity
        ? Math.min(100, Math.round((group.count / group.capacity) * 100))
        : progressPercent,
    })),
  };
});

const entries = computed(() => registrations.value.map(mapEntry));

function mapEntry(reg: ConsoleEventRegistrationItem) {
  return {
    id: reg.registrationId,
    name: reg.user.name || 'ゲスト',
    avatarUrl: reg.user.avatarUrl ?? undefined,
    initials: reg.user.name?.charAt(0).toUpperCase() ?? 'U',
    ticketName: reg.ticket?.name ?? '未設定',
    status: reg.status,
    paymentStatus: reg.paymentStatus,
    attended: reg.attended,
    noShow: reg.noShow,
    createdAtText: new Date(reg.createdAt).toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

const loadData = async () => {
  if (!eventId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const [detail, summaryData, registrationData] = await Promise.all([
      fetchConsoleEvent(eventId.value),
      fetchEventRegistrationsSummary(eventId.value),
      fetchEventRegistrations(eventId.value),
    ]);
    eventDetail.value = detail;
    summary.value = summaryData;
    registrations.value = registrationData.items;
  } catch (err) {
    console.error('Failed to load event manage page', err);
    error.value = err instanceof Error ? err.message : 'データの取得に失敗しました';
  } finally {
    loading.value = false;
  }
};

const openPublicPage = () => {
  if (!eventCard.value) return;
  window.open(`/events/${eventCard.value.id}`, '_blank');
};

const goBack = () => {
  if (communityId.value) {
    router.push({
      name: 'ConsoleMobileCommunityEvents',
      params: { communityId: communityId.value },
    });
    return;
  }
  router.back();
};

const editEvent = () => {
  if (!eventCard.value || !communityId.value) return;
  router.push({
    name: 'ConsoleMobileEventForm',
    params: { communityId: communityId.value },
    query: { eventId: eventCard.value.id },
  });
};

const openPayments = () => {
  if (!communityId.value || !eventCard.value) return;
  router.push({
    name: 'ConsoleMobilePayments',
    params: { communityId: communityId.value },
    query: { eventId: eventCard.value.id },
  });
};

const openMoreActions = () => {
  showMoreSheet.value = true;
};
const closeMoreActions = () => {
  showMoreSheet.value = false;
};
const handlePayments = () => {
  openPayments();
  closeMoreActions();
};

const cancelEvent = async () => {
  if (!eventCard.value || cancelling.value) return;
  const sure = window.confirm('キャンセルすると支払い済みの参加者に返金処理を試みます。続行しますか？');
  if (!sure) return;
  cancelling.value = true;
  error.value = '';
  try {
    await cancelConsoleEvent(eventCard.value.id, { notify: false });
    await reload();
  } catch (err) {
    console.error('Cancel event failed', err);
    error.value = err instanceof Error ? err.message : 'キャンセルに失敗しました。時間をおいて再試行してください。';
  } finally {
    cancelling.value = false;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'open':
      return '受付中';
    case 'closed':
      return '終了';
    case 'cancelled':
      return '取消済み';
    default:
      return '下書き';
  }
};

const statusDotClass = (status: string) => {
  switch (status) {
    case 'open':
      return 'dot open';
    case 'closed':
      return 'dot closed';
    case 'cancelled':
      return 'dot cancelled';
    default:
      return 'dot draft';
  }
};

const entryStatusLabel = (entry: ReturnType<typeof mapEntry>) => {
  if (entry.attended) return '出席済み';
  if (entry.noShow) return '無断欠席';
  switch (entry.status) {
    case 'pending':
      return '審査待ち';
    case 'approved':
      return '承認済み';
    case 'rejected':
      return '拒否';
    case 'paid':
      return '支払済み';
    case 'refunded':
      return '返金済み';
    case 'pending_refund':
      return '返金待ち';
    case 'cancelled':
      return 'キャンセル';
    default:
      switch (entry.paymentStatus) {
        case 'paid':
          return '支払済み';
        case 'unpaid':
          return '未払い';
        default:
          return entry.paymentStatus;
      }
  }
};

const entryStatusBadgeClass = (entry: ReturnType<typeof mapEntry>) => {
  if (entry.attended) return 'bg-emerald-100 text-emerald-700';
  if (entry.noShow) return 'bg-rose-100 text-rose-600';
  if (entry.status === 'pending') return 'bg-amber-100 text-amber-700';
  if (entry.status === 'approved' || entry.status === 'paid') return 'bg-slate-800 text-white';
  if (entry.status === 'refunded') return 'bg-blue-100 text-blue-700';
  if (entry.status === 'pending_refund') return 'bg-amber-100 text-amber-700';
  if (entry.status === 'rejected' || entry.status === 'cancelled') return 'bg-slate-100 text-slate-500';
  if (entry.paymentStatus === 'paid') return 'bg-slate-800 text-white';
  return 'bg-slate-100 text-slate-500';
};

const scrollToMemberList = () => {
  memberListRef.value?.scrollIntoView({ behavior: 'smooth' });
};

const openEntryAction = (entry: ReturnType<typeof mapEntry>) => {
  activeEntry.value = entry;
};

const closeEntryAction = () => {
  activeEntry.value = null;
};

const approveEntry = async () => {
  if (!activeEntry.value) return;
  entryActionLoading.value = { ...entryActionLoading.value, [activeEntry.value.id]: true };
  try {
    await approveEventRegistration(eventId.value, activeEntry.value.id);
    registrations.value = registrations.value.map((reg) =>
      reg.registrationId === activeEntry.value?.id ? { ...reg, status: 'approved' } : reg,
    );
    closeEntryAction();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '承認に失敗しました';
  } finally {
    entryActionLoading.value = { ...entryActionLoading.value, [activeEntry.value.id]: false };
  }
};

const rejectEntry = async () => {
  if (!activeEntry.value) return;
  entryActionLoading.value = { ...entryActionLoading.value, [activeEntry.value.id]: true };
  try {
    await rejectEventRegistration(eventId.value, activeEntry.value.id);
    registrations.value = registrations.value.map((reg) =>
      reg.registrationId === activeEntry.value?.id ? { ...reg, status: 'rejected' } : reg,
    );
    closeEntryAction();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '拒否に失敗しました';
  } finally {
    entryActionLoading.value = { ...entryActionLoading.value, [activeEntry.value.id]: false };
  }
};

const formatDate = (start: string, end?: string) => {
  const startText = new Date(start).toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (!end) return startText;
  const endText = new Date(end).toLocaleString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${startText}〜${endText}`;
};

onMounted(() => {
  loadData();
});

const reload = () => loadData();
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f8fafc;
  padding: calc(env(safe-area-inset-top, 0px) + 48px) 12px 80px;
}
.skeleton-overlay {
  position: fixed;
  inset: 0;
  background: #f8fafc;
  padding: calc(env(safe-area-inset-top, 0px) + 52px) 12px 16px;
  overflow-y: auto;
  z-index: 60;
}
.skeleton-stack { display: grid; gap: 12px; }
.skeleton-panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  box-shadow: none;
}
.skeleton-line { display: block; height: 14px; background: #e2e8f0; border-radius: 10px; }
.skeleton-line.short { width: 40%; }
.skeleton-line.medium { width: 60%; }
.skeleton-line.long { width: 90%; }
.skeleton-entry { margin-top: 8px; }
.avatar.empty.shimmer, .skeleton-panel, .skeleton-line { position: relative; overflow: hidden; }
.shimmer::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent); transform: translateX(-100%); animation: shimmer 1.2s ease infinite; }
@keyframes shimmer { 100% { transform: translateX(100%); } }

.panel {
  background: #fff;
  border-radius: 12px;
  padding: 10px;
  margin-top: 8px;
  border: 1px solid #e2e8f0;
  box-shadow: none;
}
.info-card { display: grid; gap: 6px; }
.info-header { display: grid; gap: 6px; }
.status-row { display: inline-flex; align-items: center; gap: 6px; color: #0f172a; font-weight: 700; font-size: 13px; }
.status-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dot.open { background: #22c55e; box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.12); }
.dot.closed { background: #94a3b8; box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.12); }
.dot.cancelled { background: #f87171; box-shadow: 0 0 0 4px rgba(248, 113, 113, 0.12); }
.dot.draft { background: #fbbf24; box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.12); }
.info-title { margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; line-height: 1.4; }
.info-meta { margin: 0; color: #475569; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; }
.info-id { margin: 0; font-size: 11px; color: #9ca3af; }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 12px; border-radius: 12px; font-weight: 600; font-size: 14px; border: 1px solid transparent; background: #fff; color: #0f172a; border-color: #e2e8f0; }
.btn.neutral { background: #f8fafc; color: #0f172a; border-color: #e2e8f0; }
.btn.ghost { background: #fff; }
.btn.text-danger { background: #fff; color: #b91c1c; border-color: #f1d5d5; }

.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.panel-title { margin-top: 4px; font-size: 16px; font-weight: 700; color: #0f172a; }
.muted { font-size: 12px; color: #94a3b8; }
.eyebrow { font-size: 11px; letter-spacing: 0.04em; color: #94a3b8; text-transform: uppercase; }
.count-text { margin: 2px 0 0; font-size: 12px; color: #94a3b8; }
.pill { padding: 4px 8px; border-radius: 999px; background: #f8fafc; color: #0f172a; font-size: 12px; font-weight: 700; border: 1px solid #e2e8f0; }
.pill.light { background: #fff; }

.ticket-breakdown { margin-top: 8px; display: grid; gap: 8px; }
.progress-bar-wrap {
  width: 100%;
  height: 6px;
  background: #f1f5f9;
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  margin-top: 8px;
}
.progress-bar-fill {
  height: 100%;
  background: linear-gradient(120deg, #22c55e, #0ea5e9);
  border-radius: 999px;
  transition: width 0.25s ease;
}
.ticket-row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; }
.ticket-meta { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.ticket-dot { width: 10px; height: 10px; border-radius: 50%; background: linear-gradient(120deg, #22d3ee, #22c55e); }
.ticket-name { font-size: 13px; color: #0f172a; font-weight: 600; }
.ticket-progress { height: 6px; background: #f8fafc; border-radius: 999px; overflow: hidden; border: 1px solid #e2e8f0; }
.ticket-progress-bar { height: 100%; background: linear-gradient(120deg, #22c55e, #0ea5e9); }
.ticket-count { font-size: 12px; color: #0f172a; font-weight: 600; }
.participants { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.avatar-stack { display: flex; align-items: center; }
.avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid #fff; margin-left: -10px; background: #e2e8f0; }
.avatar:first-child { margin-left: 0; }
.link-btn { color: #0ea5e9; font-size: 13px; font-weight: 600; }
.inline-link { border: none; background: transparent; display: inline-flex; align-items: center; padding: 0; }

.inline-empty { padding: 8px 0; color: #9ca3af; font-size: 12px; background: transparent; border: none; margin-top: 8px; box-shadow: none; border-radius: 0; text-align: center; }

.entry-row { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
.entry-row:last-child { border-bottom: none; }
.avatar-shell { width: 46px; height: 46px; border-radius: 14px; background: #f8fafc; border: 1px solid #e2e8f0; display: grid; place-items: center; overflow: hidden; }
.avatar-shell .avatar { width: 100%; height: 100%; border: none; margin: 0; }
.avatar.empty { display: grid; place-items: center; font-size: 14px; color: #475569; background: #e2e8f0; }
.entry-main { min-width: 0; }
.entry-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.entry-name { font-size: 14px; font-weight: 700; color: #0f172a; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entry-chip { padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; border: 1px solid #e2e8f0; }
.entry-sub { margin-top: 4px; font-size: 12px; color: #94a3b8; }
.empty-state { text-align: center; font-size: 12px; color: #94a3b8; padding: 10px 0; line-height: 1.5; }

.action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 8px 12px calc(env(safe-area-inset-bottom, 0px) + 8px);
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  background: rgba(255, 255, 255, 0.96);
  border-top: 1px solid #e2e8f0;
  backdrop-filter: blur(10px);
  z-index: 25;
}
.action-primary {
  border: none;
  border-radius: 12px;
  background: #2563eb;
  color: #fff;
  font-weight: 700;
  padding: 12px;
}
.action-secondary {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  color: #0f172a;
  font-weight: 700;
  padding: 12px;
  
}
.action-more {
  width: 46px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  color: #0f172a;
  font-weight: 700;
}
.action-more img {
  width: 18px;
  height: 18px;
}

.sheet-mask { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); display: flex; align-items: flex-end; z-index: 50; }
.sheet { background: #fff; border-radius: 18px 18px 0 0; padding: 12px 16px 18px; width: 100%; box-shadow: 0 -12px 30px rgba(15, 23, 42, 0.16); }
.sheet-handle { width: 48px; height: 5px; background: #e2e8f0; border-radius: 999px; margin: 0 auto 12px; }
.sheet-name { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; }
.sheet-sub { margin: 2px 0 0; font-size: 12px; color: #94a3b8; }
.sheet-action { width: 100%; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; color: #0f172a; font-weight: 700; margin-top: 8px; }
.sheet-action.danger { color: #b91c1c; background: #fff1f2; border-color: #fecdd3; }
.sheet-close { width: 100%; padding: 12px; border-radius: 12px; border: none; background: #0f172a; color: #fff; font-weight: 700; margin-top: 10px; }

.error-panel { text-align: center; gap: 6px; }
.w-full { width: 100%; }

.mt-2 { margin-top: 8px; }
.mt-3 { margin-top: 10px; }
.line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
</style>
