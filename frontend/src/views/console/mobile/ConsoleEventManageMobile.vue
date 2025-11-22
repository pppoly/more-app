<template>
  <PageMarker label="P7" />
  <div class="page">
    <header class="nav-bar">
      <button type="button" class="back-btn" @click="goBack">返回</button>
    </header>

    <div v-if="showSkeleton" class="skeleton-overlay" aria-hidden="true">
      <div class="skeleton-stack">
        <section class="hero-card skeleton-card">
          <div class="hero-bg faded"></div>
          <div class="hero-content">
            <div class="skeleton-line short"></div>
            <div class="skeleton-line long mt-3"></div>
            <div class="chip-row mt-3">
              <span class="chip skeleton-chip"></span>
              <span class="chip skeleton-chip"></span>
            </div>
            <div class="hero-actions mt-4">
              <span class="btn ghost skeleton-line"></span>
              <span class="btn solid skeleton-line"></span>
            </div>
          </div>
        </section>
        <section class="panel skeleton-panel">
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line long mt-2"></div>
          <div class="progress mt-4">
            <div class="progress-bar shimmer" style="width: 65%"></div>
          </div>
          <div class="stat-grid mt-2">
            <div class="stat-card">
              <div class="skeleton-line medium"></div>
              <div class="skeleton-line short mt-3"></div>
            </div>
            <div class="stat-card">
              <div class="skeleton-line medium"></div>
              <div class="skeleton-line short mt-3"></div>
            </div>
          </div>
          <div class="ticket-breakdown mt-3">
            <div class="ticket-row" v-for="i in 2" :key="i">
              <div class="ticket-meta">
                <span class="ticket-dot"></span>
                <span class="skeleton-line short"></span>
              </div>
              <div class="ticket-progress shimmer"></div>
              <span class="skeleton-line tiny"></span>
            </div>
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
        <p class="eyebrow">加载失败</p>
        <p class="panel-title">{{ error }}</p>
        <button class="btn solid mt-3 w-full" @click="reload">重试加载</button>
      </section>
    </template>

    <template v-else-if="eventCard">
      <section class="hero-card">
        <div class="hero-bg"></div>
        <div class="hero-content">
          <div class="hero-head">
            <div class="hero-text">
              <p class="eyebrow">Console · イベント管理</p>
              <h1 class="hero-title line-clamp-2">{{ eventCard.title }}</h1>
              <div class="chip-row">
                <span class="chip">
                  <span class="i-lucide-calendar mr-1"></span>{{ eventCard.dateTimeText }}
                </span>
                <span class="chip">
                  <span class="i-lucide-map-pin mr-1"></span>{{ eventCard.locationText }}
                </span>
              </div>
            </div>
            <span class="status-chip" :class="statusBadgeClass(eventCard.status)">
              {{ statusLabel(eventCard.status) }}
            </span>
          </div>
          <div class="hero-actions">
            <button class="btn ghost" @click="openPublicPage">
              <span class="i-lucide-external-link mr-1.5"></span> 前台ページを見る
            </button>
            <button class="btn solid" @click="editEvent">
              <span class="i-lucide-pencil mr-1.5"></span> イベントを編集
            </button>
          </div>
        </div>
      </section>

      <section class="panel" v-if="summaryCard">
        <div class="panel-head">
          <div>
            <p class="eyebrow">申込状況</p>
            <h2 class="panel-title">合計 {{ summaryCard.totalConfirmed }}/{{ summaryCard.capacity }} 人</h2>
            <p class="muted">うち {{ summaryCard.paidCount }} 人が支払い済み</p>
          </div>
          <div class="pill">進捗 {{ summaryCard.progressPercent }}%</div>
        </div>
        <div class="progress">
          <div class="progress-bar" :style="{ width: summaryCard.progressPercent + '%' }"></div>
        </div>
        <div class="stat-grid">
          <div class="stat-card">
            <p class="stat-label">現在の確定</p>
            <p class="stat-value">{{ summaryCard.totalConfirmed }}</p>
            <p class="stat-hint">目標 {{ summaryCard.capacity }} 人</p>
          </div>
          <div class="stat-card">
            <p class="stat-label">支払い済み</p>
            <p class="stat-value">{{ summaryCard.paidCount }}</p>
            <p class="stat-hint">リアルタイム更新</p>
          </div>
        </div>
        <div class="ticket-breakdown" v-if="summaryCard.tickets.length">
          <p class="eyebrow mb-2">チケット別</p>
          <div v-for="ticket in summaryCard.tickets" :key="ticket.id" class="ticket-row">
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
        <div class="participants">
          <div class="avatar-stack">
            <img
              v-for="p in summaryCard.sampleParticipants"
              :key="p.id"
              :src="p.avatarUrl"
              class="avatar"
              alt="participant"
            />
          </div>
          <button class="link-btn" @click="scrollToMemberList">参加者一覧を見る</button>
        </div>
      </section>
      <section v-else class="panel muted-panel">
        <p class="eyebrow">申込状況</p>
        <h2 class="panel-title">まだデータがありません</h2>
        <p class="muted">发布或有报名后，会自动呈现进度和票种分布。</p>
      </section>

      <section class="panel" ref="memberListRef">
        <div class="panel-head">
          <div>
            <p class="eyebrow">参加者</p>
            <h2 class="panel-title">リスト</h2>
          </div>
          <span class="pill light">{{ entries.length }} 人</span>
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
        <div v-if="!entries.length && !loading" class="empty-state">まだ参加者がいません。</div>
      </section>

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
} from '../../../api/client';
import type {
  ConsoleEventDetail,
  ConsoleEventRegistrationItem,
  EventRegistrationsSummary,
} from '../../../types/api';
import { getLocalizedText } from '../../../utils/i18nContent';
import { useResourceConfig } from '../../../composables/useResourceConfig';
import PageMarker from '../../../components/PageMarker.vue';

const route = useRoute();
const router = useRouter();
const eventId = computed(() => route.params.eventId as string);
const communityId = computed(() => eventDetail.value?.communityId);

const loading = ref(true);
const error = ref('');
const showSkeleton = computed(() => loading.value || (!eventCard.value && !error.value));
const eventDetail = ref<ConsoleEventDetail | null>(null);
const summary = ref<EventRegistrationsSummary | null>(null);
const registrations = ref<ConsoleEventRegistrationItem[]>([]);
const activeEntry = ref<ReturnType<typeof mapEntry> | null>(null);
const memberListRef = ref<HTMLElement | null>(null);
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
    error.value = err instanceof Error ? err.message : '数据获取失败';
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
  if (!eventCard.value) return;
  router.push({ path: `/console/events/${eventCard.value.id}/edit` });
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'open':
      return '受付中';
    case 'closed':
      return '終了';
    default:
      return '下書き';
  }
};

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'open':
      return 'bg-emerald-100 text-emerald-700';
    case 'closed':
      return 'bg-slate-100 text-slate-500';
    default:
      return 'bg-amber-100 text-amber-700';
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
  padding: calc(env(safe-area-inset-top, 0px) + 64px) 12px 96px;
  background: radial-gradient(circle at 10% 20%, #ecfeff 0, #f8fafc 45%, #f8fafc 100%);
}

.nav-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  display: flex;
  align-items: center;
  padding: calc(env(safe-area-inset-top, 0px) + 8px) 14px 10px;
  background: #f8fafc;
  z-index: 20;
}

.back-btn {
  border: none;
  background: transparent;
  font-weight: 600;
  color: #0f172a;
  padding: 8px 10px 8px 0;
}

.skeleton-overlay {
  position: fixed;
  inset: 0;
  background: radial-gradient(circle at 10% 20%, #ecfeff 0, #f8fafc 45%, #f8fafc 100%);
  padding: 12px 12px 32px;
  overflow-y: auto;
  z-index: 60;
}

.skeleton-stack {
  display: grid;
  gap: 12px;
}

.hero-card {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  padding: 16px;
  margin-top: 8px;
  box-shadow: 0 20px 40px rgba(15, 118, 110, 0.12);
  background: #0f172a;
}

.hero-bg {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 20% 20%, rgba(94, 234, 212, 0.2), transparent 35%),
    radial-gradient(circle at 80% 0%, rgba(14, 165, 233, 0.25), transparent 40%),
    linear-gradient(120deg, rgba(14, 165, 233, 0.85), rgba(79, 70, 229, 0.8));
  filter: blur(2px);
}

.hero-content {
  position: relative;
  color: #e2e8f0;
}

.hero-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.hero-text {
  min-width: 0;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: #cbd5e1;
  text-transform: uppercase;
}

.hero-title {
  margin-top: 4px;
  font-size: 18px;
  font-weight: 700;
  color: #f8fafc;
}

.chip-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  background: rgba(226, 232, 240, 0.1);
  border: 1px solid rgba(226, 232, 240, 0.2);
  border-radius: 999px;
  font-size: 12px;
  color: #e2e8f0;
  backdrop-filter: blur(6px);
}

.status-chip {
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.08);
}

.hero-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 14px;
  border: 1px solid transparent;
}

.btn.ghost {
  color: #e2e8f0;
  border-color: rgba(226, 232, 240, 0.35);
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(6px);
}

.btn.solid {
  color: #0f172a;
  background: linear-gradient(120deg, #a5f3fc, #22d3ee);
  box-shadow: 0 12px 25px rgba(34, 211, 238, 0.3);
}

.panel {
  background: #fff;
  border-radius: 18px;
  padding: 14px;
  margin-top: 14px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  border: 1px solid #e2e8f0;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.panel-title {
  margin-top: 4px;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.muted {
  font-size: 12px;
  color: #94a3b8;
}

.pill {
  padding: 6px 10px;
  border-radius: 999px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 700;
}

.pill.light {
  background: #f8fafc;
  color: #0f172a;
  border: 1px solid #e2e8f0;
}

.muted-panel {
  background: #f8fafc;
  border: 1px dashed #e2e8f0;
  min-height: 120px;
  display: grid;
  align-content: center;
  gap: 6px;
}

.progress {
  position: relative;
  width: 100%;
  height: 10px;
  background: #f8fafc;
  border-radius: 999px;
  overflow: hidden;
  margin: 12px 0;
  border: 1px solid #e2e8f0;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(120deg, #22c55e, #10b981);
  border-radius: 999px;
  transition: width 0.3s ease;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.stat-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
}

.stat-label {
  font-size: 12px;
  color: #64748b;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  margin: 4px 0;
}

.stat-hint {
  font-size: 11px;
  color: #94a3b8;
}

.ticket-breakdown {
  margin-top: 14px;
}

.ticket-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed #e2e8f0;
}

.ticket-row:last-child {
  border-bottom: none;
}

.ticket-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ticket-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(120deg, #22d3ee, #22c55e);
}

.ticket-name {
  font-size: 13px;
  color: #0f172a;
  font-weight: 600;
}

.ticket-progress {
  height: 8px;
  background: #f8fafc;
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.ticket-progress-bar {
  height: 100%;
  background: linear-gradient(120deg, #22c55e, #0ea5e9);
}

.ticket-count {
  font-size: 12px;
  color: #0f172a;
  font-weight: 600;
}

.participants {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.avatar-stack {
  display: flex;
  align-items: center;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #fff;
  margin-left: -10px;
  background: #e2e8f0;
}

.avatar:first-child {
  margin-left: 0;
}

.link-btn {
  color: #0ea5e9;
  font-size: 13px;
  font-weight: 600;
}

.entry-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
}

.entry-row:last-child {
  border-bottom: none;
}

.avatar-shell {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.avatar-shell .avatar {
  width: 100%;
  height: 100%;
  border: none;
  margin: 0;
}

.avatar.empty {
  display: grid;
  place-items: center;
  font-size: 14px;
  color: #475569;
  background: #e2e8f0;
}

.entry-main {
  min-width: 0;
}

.entry-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.entry-name {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-chip {
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid #e2e8f0;
}

.entry-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}

.empty-state {
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
  padding: 10px 0;
}

.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: flex-end;
  z-index: 50;
}

.sheet {
  background: #fff;
  width: 100%;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  max-height: 70vh;
  padding: 14px;
  overflow-y: auto;
  box-shadow: 0 -12px 32px rgba(15, 23, 42, 0.12);
}

.sheet-handle {
  width: 40px;
  height: 5px;
  background: #e2e8f0;
  border-radius: 999px;
  margin: 0 auto 12px;
}

.sheet-name {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.sheet-sub {
  font-size: 12px;
  color: #94a3b8;
}

.sheet-action {
  width: 100%;
  text-align: left;
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 14px;
  color: #0f172a;
  font-weight: 600;
}

.sheet-action:last-of-type {
  border-bottom: none;
}

.sheet-action.danger {
  color: #e11d48;
}

.sheet-close {
  margin-top: 8px;
  width: 100%;
  padding: 12px;
  text-align: center;
  border-radius: 12px;
  background: #f8fafc;
  color: #0f172a;
  font-weight: 700;
  border: 1px solid #e2e8f0;
}

/* Skeleton styles */
.skeleton-line {
  display: block;
  width: 100%;
  height: 12px;
  border-radius: 12px;
  background: #e2e8f0;
}

.skeleton-line.short {
  width: 40%;
}

.skeleton-line.medium {
  width: 65%;
}

.skeleton-line.long {
  width: 85%;
}

.skeleton-line.tiny {
  width: 24px;
  height: 10px;
}

.skeleton-card {
  box-shadow: none;
  background: #0f172a;
}

.skeleton-panel .stat-card {
  background: #f8fafc;
}

.skeleton-chip {
  width: 100px;
  height: 26px;
  padding: 0;
  background: #e2e8f0;
  border-color: #e2e8f0;
}

.skeleton-entry {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;
}

.skeleton-entry:last-child {
  border-bottom: none;
}

.shimmer {
  position: relative;
  overflow: hidden;
}

.shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent, rgba(255, 255, 255, 0.5), transparent);
  transform: translateX(-100%);
  animation: shimmer 1.4s infinite;
}

.hero-bg.faded {
  opacity: 0.5;
}

/* Error panel */
.error-panel {
  border: 1px solid #fecdd3;
  background: #fff1f2;
  color: #be123c;
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
</style>
