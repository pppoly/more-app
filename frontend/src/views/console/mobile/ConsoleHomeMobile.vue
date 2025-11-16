<template>
  <div class="px-3 py-3 pb-20 space-y-4">
    <section class="bg-white rounded-2xl p-4 shadow-sm">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="text-[11px] text-slate-400">現在のコミュニティ</p>
          <h1 class="text-sm font-semibold text-slate-900 truncate">
            {{ communityName || '未選択' }}
          </h1>
          <p class="mt-0.5 text-[11px] text-slate-400">役割：{{ roleLabel }}</p>
        </div>
        <button
          class="px-3 py-1.5 rounded-full border border-slate-200 text-[11px] text-slate-600 shrink-0"
          @click="openCommunityPicker"
        >
          社群を切り替え
        </button>
      </div>
      <div class="mt-3 grid grid-cols-3 gap-2 text-center">
        <div class="rounded-xl bg-slate-50 py-2">
          <p class="text-[11px] text-slate-400">今月の収入</p>
          <p class="text-sm font-semibold text-slate-900">{{ stats.monthRevenueText }}</p>
        </div>
        <div class="rounded-xl bg-slate-50 py-2">
          <p class="text-[11px] text-slate-400">今月のイベント</p>
          <p class="text-sm font-semibold text-slate-900">{{ stats.eventCount }}</p>
        </div>
        <div class="rounded-xl bg-slate-50 py-2">
          <p class="text-[11px] text-slate-400">申込数</p>
          <p class="text-sm font-semibold text-slate-900">{{ stats.registrationCount }}</p>
        </div>
      </div>
    </section>

    <section>
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-xs font-semibold text-slate-500">このコミュニティのイベント</h2>
        <button class="text-[11px] text-[#00B900]" @click="goAllEvents">一覧を見る</button>
      </div>
      <div class="bg-white rounded-2xl shadow-sm divide-y">
        <button
          v-for="item in displayEvents"
          :key="item.id"
          class="w-full px-3 py-2 flex items-center active:bg-slate-50"
          @click="openManage(item.id)"
        >
          <img :src="item.coverUrl" class="w-10 h-10 rounded-xl object-cover mr-3 flex-shrink-0" alt="" />
          <div class="flex-1 min-w-0 text-left">
            <p class="text-[13px] font-semibold text-slate-900 line-clamp-2">
              {{ item.title }}
            </p>
            <p class="mt-0.5 text-[11px] text-slate-400">
              {{ item.dateTimeText }} · {{ item.entrySummary }}
            </p>
          </div>
          <span class="ml-2 px-2 py-0.5 rounded-full text-[10px]" :class="statusBadgeClass(item.status)">
            {{ statusLabel(item.status) }}
          </span>
        </button>
        <div v-if="!displayEvents.length" class="px-3 py-4 text-center text-[11px] text-slate-400">
          まだイベントがありません。
        </div>
      </div>
    </section>

    <button
      class="fixed right-4 bottom-20 w-12 h-12 rounded-full bg-[#00B900] text-white flex items-center justify-center shadow-lg"
      @click="createEvent"
    >
      <span class="i-lucide-plus text-xl"></span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import { fetchConsoleCommunityEvents } from '../../../api/client';
import type { ConsoleEventSummary } from '../../../types/api';
import { getLocalizedText } from '../../../utils/i18nContent';

const router = useRouter();
const communityStore = useConsoleCommunityStore();
const events = ref<ConsoleEventSummary[]>([]);
const loading = ref(false);

const community = computed(() => communityStore.getActiveCommunity());
const communityName = computed(() => community.value?.name ?? '');
const communityId = computed(() => communityStore.activeCommunityId.value);
const roleLabel = computed(() => {
  const role = community.value?.role;
  switch (role) {
    case 'owner':
      return '主催者';
    case 'admin':
      return '管理者';
    default:
      return 'メンバー';
  }
});

const stats = computed(() => ({
  monthRevenueText: '¥0',
  eventCount: events.value.length,
  registrationCount: '--',
}));

const displayEvents = computed(() =>
  events.value.slice(0, 5).map((event) => ({
    id: event.id,
    title: getLocalizedText(event.title),
    status: event.status,
    dateTimeText: formatDate(event.startTime, event.endTime),
    entrySummary: event.visibility === 'public' ? '公開イベント' : '限定公開',
    coverUrl: 'https://placehold.co/120x120?text=Event',
  })),
);

const loadEvents = async () => {
  if (!communityId.value) return;
  loading.value = true;
  try {
    events.value = await fetchConsoleCommunityEvents(communityId.value);
  } catch (err) {
    console.error('Failed to load console events', err);
  } finally {
    loading.value = false;
  }
};

watch(communityId, () => {
  if (communityId.value) {
    loadEvents();
  }
});

const openCommunityPicker = () => {
  window.dispatchEvent(new CustomEvent('console:open-community-picker'));
};

const goAllEvents = () => {
  if (!communityId.value) return;
  router.push({ name: 'ConsoleMobileCommunityEvents', params: { communityId: communityId.value } });
};

const openManage = (eventId: string) => {
  router.push({ name: 'ConsoleMobileEventManage', params: { eventId } });
};

const createEvent = () => {
  if (!communityId.value) return;
  router.push({ path: `/console/communities/${communityId.value}/events/create` });
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

onMounted(async () => {
  await communityStore.loadCommunities();
  if (!communityId.value) {
    communityStore.ensureActiveCommunity();
  }
  if (communityId.value) {
    loadEvents();
  }
});
</script>
