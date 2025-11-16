<template>
  <div class="pb-24" v-if="eventCard">
    <section class="bg-white rounded-2xl p-4 shadow-sm mx-3 mt-3">
      <div class="flex items-start justify-between">
        <div class="min-w-0">
          <h1 class="text-sm font-semibold text-slate-900 leading-snug line-clamp-2">
            {{ eventCard.title }}
          </h1>
          <p class="mt-1 text-[11px] text-slate-500 flex items-center">
            <span class="i-lucide-calendar mr-1"></span>{{ eventCard.dateTimeText }}
          </p>
          <p class="mt-0.5 text-[11px] text-slate-500 flex items-center">
            <span class="i-lucide-map-pin mr-1"></span>{{ eventCard.locationText }}
          </p>
        </div>
        <span class="ml-2 px-2 py-0.5 rounded-full text-[11px]" :class="statusBadgeClass(eventCard.status)">
          {{ statusLabel(eventCard.status) }}
        </span>
      </div>
      <div class="mt-3 flex gap-2 text-xs">
        <button class="flex-1 py-1.5 rounded-full border border-slate-200 text-slate-700" @click="openPublicPage">
          前台ページを見る
        </button>
        <button class="flex-1 py-1.5 rounded-full bg-slate-900 text-white" @click="editEvent">
          イベントを編集
        </button>
      </div>
    </section>

    <section class="mt-3 mx-3 bg-white rounded-2xl p-4 shadow-sm" v-if="summaryCard">
      <h2 class="text-xs font-semibold text-slate-600 mb-2">申込状況</h2>
      <div class="flex items-center justify-between text-[11px] text-slate-500 mb-1">
        <span>合計 {{ summaryCard.totalConfirmed }}/{{ summaryCard.capacity }} 人</span>
        <span class="text-slate-400">{{ summaryCard.paidCount }} 人 支払い済み</span>
      </div>
      <div class="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden mb-2">
        <div class="h-full bg-[#00B900]" :style="{ width: summaryCard.progressPercent + '%' }"></div>
      </div>
      <div class="space-y-1.5 mt-2">
        <div v-for="ticket in summaryCard.tickets" :key="ticket.id" class="flex items-center justify-between text-[11px]">
          <span class="text-slate-600">{{ ticket.name }}</span>
          <div class="flex-1 mx-2 h-1 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full bg-emerald-400" :style="{ width: ticket.progressPercent + '%' }"></div>
          </div>
          <span class="text-slate-900">{{ ticket.confirmed }}/{{ ticket.capacity }}</span>
        </div>
      </div>
      <div class="mt-3 flex items-center justify-between">
        <div class="flex -space-x-2">
          <img
            v-for="p in summaryCard.sampleParticipants"
            :key="p.id"
            :src="p.avatarUrl"
            class="w-6 h-6 rounded-full border border-white object-cover"
            alt="participant"
          />
        </div>
        <button class="text-[11px] text-[#00B900]" @click="scrollToMemberList">
          参加者一覧を見る
        </button>
      </div>
    </section>

    <section class="mt-3 mx-3 bg-white rounded-2xl p-4 shadow-sm" ref="memberListRef">
      <h2 class="text-xs font-semibold text-slate-600 mb-2">参加者一覧</h2>
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="flex items-center py-2 px-2 -mx-2 rounded-xl active:bg-slate-50"
        @click="openEntryAction(entry)"
      >
        <div class="w-8 h-8 rounded-full bg-slate-200 overflow-hidden mr-2 flex-shrink-0">
          <img v-if="entry.avatarUrl" :src="entry.avatarUrl" class="w-full h-full object-cover" alt="" />
          <span v-else class="w-full h-full flex items-center justify-center text-[11px] text-slate-600">
            {{ entry.initials }}
          </span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <p class="text-xs font-medium text-slate-900 truncate">{{ entry.name }}</p>
            <span class="ml-2 px-2 py-0.5 text-[10px] rounded-full" :class="entryStatusBadgeClass(entry)">
              {{ entryStatusLabel(entry) }}
            </span>
          </div>
          <p class="mt-0.5 text-[10px] text-slate-400">
            {{ entry.ticketName }} · {{ entry.createdAtText }}
          </p>
        </div>
      </div>
      <div v-if="!entries.length && !loading" class="mt-2 text-center text-[11px] text-slate-400">
        まだ参加者がいません。
      </div>
      <p v-if="loading" class="text-[11px] text-slate-400 text-center mt-2">読み込み中...</p>
    </section>

    <div v-if="activeEntry" class="fixed inset-0 bg-black/40 flex items-end z-50" @click.self="closeEntryAction">
      <div class="w-full bg-white rounded-t-2xl max-h-[70vh] p-4 overflow-y-auto">
        <div class="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3"></div>
        <div class="flex items-center mb-3">
          <div class="w-8 h-8 rounded-full bg-slate-200 overflow-hidden mr-2">
            <img v-if="activeEntry.avatarUrl" :src="activeEntry.avatarUrl" class="w-full h-full object-cover" alt="" />
            <span v-else class="w-full h-full flex items-center justify-center text-[11px] text-slate-600">
              {{ activeEntry.initials }}
            </span>
          </div>
          <div>
            <p class="text-sm font-semibold text-slate-900">{{ activeEntry.name }}</p>
            <p class="text-[11px] text-slate-400">
              {{ activeEntry.ticketName }} · {{ entryStatusLabel(activeEntry) }}
            </p>
          </div>
        </div>
        <button class="w-full py-2 text-sm text-left border-b" @click="viewEntryDetail">詳細を見る</button>
        <button class="w-full py-2 text-sm text-left border-b" @click="markCheckin">チェックインにする</button>
        <button class="w-full py-2 text-sm text-left border-b" @click="cancelEntry">申込を取消</button>
        <button class="w-full py-2 text-sm text-left text-rose-600" @click="startRefund">返金を開始</button>
        <button class="w-full mt-2 py-2 text-sm text-center rounded-full bg-slate-100 text-slate-600" @click="closeEntryAction">
          閉じる
        </button>
      </div>
    </div>
  </div>
  <div v-else class="p-6 text-center text-slate-400">読み込み中...</div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  fetchConsoleEvent,
  fetchEventRegistrations,
  fetchEventRegistrationsSummary,
} from '../../../api/client';
import type {
  ConsoleEventDetail,
  ConsoleEventRegistrationItem,
  EventRegistrationsSummary,
} from '../../../types/api';
import { getLocalizedText } from '../../../utils/i18nContent';

const route = useRoute();
const router = useRouter();
const eventId = computed(() => route.params.eventId as string);

const loading = ref(true);
const eventDetail = ref<ConsoleEventDetail | null>(null);
const summary = ref<EventRegistrationsSummary | null>(null);
const registrations = ref<ConsoleEventRegistrationItem[]>([]);
const activeEntry = ref<ReturnType<typeof mapEntry> | null>(null);
const memberListRef = ref<HTMLElement | null>(null);

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
      avatarUrl: avatar.avatarUrl ?? 'https://placehold.co/64x64?text=Member',
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
  try {
    const [detail, summaryData, registrationData] = await Promise.all([
      fetchConsoleEvent(eventId.value),
      fetchEventRegistrationsSummary(eventId.value),
      fetchEventRegistrations(eventId.value),
    ]);
    eventDetail.value = detail;
    summary.value = summaryData;
    registrations.value = registrationData.items;
  } finally {
    loading.value = false;
  }
};

const openPublicPage = () => {
  if (!eventCard.value) return;
  window.open(`/events/${eventCard.value.id}`, '_blank');
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
  switch (entry.paymentStatus) {
    case 'paid':
      return '支払済み';
    case 'unpaid':
      return '未払い';
    default:
      return entry.paymentStatus;
  }
};

const entryStatusBadgeClass = (entry: ReturnType<typeof mapEntry>) => {
  if (entry.attended) return 'bg-emerald-100 text-emerald-700';
  if (entry.noShow) return 'bg-rose-100 text-rose-600';
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

const viewEntryDetail = () => {
  console.log('Viewing entry detail', activeEntry.value);
};

const markCheckin = () => {
  console.log('Mark check-in', activeEntry.value);
};

const cancelEntry = () => {
  console.log('Cancel entry', activeEntry.value);
};

const startRefund = () => {
  console.log('Start refund', activeEntry.value);
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
</script>
