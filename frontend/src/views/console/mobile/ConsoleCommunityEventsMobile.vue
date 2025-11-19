<template>
  <div class="px-3 py-3 pb-20">
    <header class="mb-3">
      <p class="text-[11px] text-slate-400">コミュニティ</p>
      <h1 class="text-sm font-semibold text-slate-900">
        {{ communityName }}
      </h1>
      <p class="mt-0.5 text-[11px] text-slate-400">全てのイベント一覧</p>
      <button v-if="isAdmin" type="button" class="dashboard-link" @click="openDashboard">
        <span class="i-lucide-activity mr-1"></span>
        AI助手仪表盘
      </button>
    </header>

    <div class="flex gap-2 mb-3 overflow-x-auto no-scrollbar">
      <button
        v-for="filter in filters"
        :key="filter.value"
        class="px-3 py-1 rounded-full text-xs border whitespace-nowrap"
        :class="
          filter.value === activeFilter
            ? 'bg-[#00B900] border-[#00B900] text-white'
            : 'bg-white border-slate-200 text-slate-600'
        "
        @click="activeFilter = filter.value"
      >
        {{ filter.label }}
      </button>
    </div>

    <div class="bg-white rounded-2xl shadow-sm divide-y">
      <button
        v-for="item in filteredEvents"
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
      <div v-if="!filteredEvents.length && !loading" class="px-3 py-4 text-center text-[11px] text-slate-400">
        条件に合うイベントがありません。
      </div>
      <div v-if="loading" class="px-3 py-4 text-center text-[11px] text-slate-400">読み込み中...</div>
    </div>
    <div class="mt-4">
      <button type="button" class="create-event-button" @click="createEvent">
        <span class="i-lucide-plus mr-2 text-lg"></span>
        新しいイベントを作成
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchConsoleCommunityEvents } from '../../../api/client';
import type { ConsoleEventSummary } from '../../../types/api';
import { getLocalizedText } from '../../../utils/i18nContent';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import { useAuth } from '../../../composables/useAuth';
import { resolveAssetUrl } from '../../../utils/assetUrl';

const route = useRoute();
const router = useRouter();
const communityStore = useConsoleCommunityStore();
const { user } = useAuth();

const events = ref<ConsoleEventSummary[]>([]);
const loading = ref(false);
const activeFilter = ref('all');
const filters = [
  { value: 'all', label: 'すべて' },
  { value: 'open', label: '受付中' },
  { value: 'closed', label: '終了' },
];

const communityId = computed(() => route.params.communityId as string);
const communityName = computed(() => {
  const target = communityStore.communities.value.find((c) => c.id === communityId.value);
  return target?.name ?? '未選択';
});
const isAdmin = computed(() => Boolean(user.value?.isAdmin));

const DEFAULT_EVENT_COVER = 'https://raw.githubusercontent.com/moreard/dev-assets/main/socialmore/default-event.png';

const normalizedEvents = computed(() =>
  events.value.map((event) => ({
    id: event.id,
    title: getLocalizedText(event.title),
    status: event.status,
    dateTimeText: formatDate(event.startTime, event.endTime),
    entrySummary: event.visibility === 'public' ? '公開イベント' : '限定公開',
    coverUrl: event.coverImageUrl ? resolveAssetUrl(event.coverImageUrl) : DEFAULT_EVENT_COVER,
  })),
);

const filteredEvents = computed(() => {
  if (activeFilter.value === 'all') return normalizedEvents.value;
  return normalizedEvents.value.filter((event) => event.status === activeFilter.value);
});

const loadEvents = async () => {
  if (!communityId.value) return;
  loading.value = true;
  try {
    events.value = await fetchConsoleCommunityEvents(communityId.value);
  } catch (err) {
    console.error('Failed to load community events', err);
  } finally {
    loading.value = false;
  }
};

watch(
  () => communityId.value,
  () => {
    if (communityId.value) loadEvents();
  },
);

const openManage = (eventId: string) => {
  router.push({ name: 'ConsoleMobileEventManage', params: { eventId } });
};

const createEvent = () => {
  if (!communityId.value) return;
  router.push({ name: 'ConsoleMobileEventForm', params: { communityId: communityId.value } });
};

const openDashboard = () => {
  if (!communityId.value) return;
  router.push({ name: 'ConsoleMobileAssistantDashboard', params: { communityId: communityId.value } });
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
  if (communityId.value) {
    loadEvents();
  }
});
</script>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.dashboard-link {
  margin-top: 8px;
  border: 1px solid #d4e4ff;
  color: #2563eb;
  border-radius: var(--app-border-radius);
  padding: 4px 10px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.create-event-button {
  width: 100%;
  border: none;
  border-radius: var(--app-border-radius);
  padding: 0.75rem;
  background: linear-gradient(135deg, #0ea5e9, #22d3ee);
  color: #fff;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 15px 25px rgba(14, 165, 233, 0.3);
}
</style>
