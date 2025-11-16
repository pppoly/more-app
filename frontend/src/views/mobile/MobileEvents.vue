<template>
  <div class="pb-20">
    <div class="mx-3 mt-3 flex items-center px-3 py-2 bg-slate-100 rounded-full">
      <span class="i-lucide-search text-slate-400 mr-2"></span>
      <input
        v-model="keyword"
        type="text"
        class="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
        placeholder="イベント名・場所・キーワード検索"
      />
    </div>

    <div class="mt-2 flex gap-2 px-3 overflow-x-auto no-scrollbar">
      <button
        v-for="tag in tags"
        :key="tag.value"
        class="px-3 py-1 rounded-full text-xs whitespace-nowrap border"
        :class="
          tag.value === activeTag
            ? 'bg-[#00B900] border-[#00B900] text-white'
            : 'bg-white border-slate-200 text-slate-600'
        "
        @click="activeTag = tag.value"
      >
        {{ tag.label }}
      </button>
    </div>

    <div class="mt-3 px-3" v-if="loading">
      <p class="text-sm text-slate-400">読み込み中...</p>
    </div>
    <div class="mt-3 px-3" v-else-if="error">
      <p class="text-sm text-rose-500 flex items-center gap-2">
        読み込みに失敗しました
        <button class="text-[#00B900] underline" @click="loadEvents">再試行</button>
      </p>
    </div>

    <div class="mt-3" v-else>
      <div v-if="!filteredEvents.length" class="text-center text-slate-400 text-sm mt-8">
        条件に合うイベントが見つかりません。
      </div>
      <div
        v-for="event in filteredEvents"
        :key="event.id"
        class="flex bg-white rounded-2xl shadow-sm my-3 mx-3 p-3 active:bg-slate-50"
        @click="goDetail(event.id)"
      >
        <img
          :src="event.coverUrl"
          class="w-28 h-20 rounded-xl object-cover flex-shrink-0"
          alt="cover"
        />
        <div class="ml-3 flex-1 flex flex-col">
          <div class="flex items-start justify-between">
            <h2 class="text-sm font-semibold line-clamp-2">
              {{ event.title }}
            </h2>
            <span class="ml-2 px-2 py-0.5 text-[11px] rounded-full" :class="badgeClass(event.status)">
              {{ statusLabel(event.status) }}
            </span>
          </div>
          <div class="mt-1 text-[11px] text-slate-500 flex items-center">
            <span class="i-lucide-calendar mr-1"></span>{{ event.timeText }}
          </div>
          <div class="mt-0.5 text-[11px] text-slate-500 flex items-center">
            <span class="i-lucide-map-pin mr-1"></span>{{ event.locationText }}
          </div>
          <div class="mt-2 flex justify-between items-center">
            <div class="text-[11px] text-slate-500">
              <span class="font-semibold text-[13px] text-slate-900">
                {{ event.priceText }}
              </span>
              <span class="ml-1 text-[11px] text-slate-400">
                {{ event.regSummary }}
              </span>
            </div>
            <button
              class="px-3 py-1.5 rounded-full text-xs bg-[#00B900] text-white"
              @click.stop="goDetail(event.id)"
            >
              詳細を見る
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fetchEvents } from '../../api/client';
import type { EventSummary } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';

const router = useRouter();
const events = ref<EventSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const keyword = ref('');
const activeTag = ref('all');
const tags = [
  { value: 'all', label: 'すべて' },
  { value: 'parent', label: '親子' },
  { value: 'sports', label: 'スポーツ' },
  { value: 'language', label: '語学交換' },
  { value: 'work', label: '仕事・スキル' },
  { value: 'newcomer', label: '新来日本' },
];

const loadEvents = async () => {
  loading.value = true;
  error.value = null;
  try {
    events.value = await fetchEvents();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'イベントを取得できませんでした';
  } finally {
    loading.value = false;
  }
};

const filteredEvents = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  return events.value
    .map((event) => ({
      id: event.id,
      status: event.status,
      title: getLocalizedText(event.title),
      category: event.category ?? '',
      timeText: formatDate(event.startTime),
      locationText: event.locationText,
      coverUrl: extractCover(event),
      priceText: formatPrice(event),
      regSummary: registrationSummary(event),
    }))
    .filter((event) => {
      const matchesTag =
        activeTag.value === 'all' ||
        event.category.toLowerCase().includes(activeTag.value.toLowerCase());
      const haystack = `${event.title} ${event.locationText}`.toLowerCase();
      const matchesKeyword = !query || haystack.includes(query);
      return matchesTag && matchesKeyword;
    });
});

const badgeClass = (status: string) => {
  if (status === 'open') return 'bg-emerald-100 text-emerald-600';
  if (status === 'closed') return 'bg-slate-100 text-slate-500';
  return 'bg-slate-100 text-slate-500';
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'open':
      return '受付中';
    case 'closed':
      return '終了';
    default:
      return '情報';
  }
};

const formatDate = (value: string) =>
  new Date(value).toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatPrice = (event: EventSummary) => {
  const price = event.ticketTypes?.[0]?.price ?? 0;
  return price > 0 ? `¥${price.toLocaleString()}` : '無料';
};

const registrationSummary = (event: EventSummary) => `${event.community.name ?? ''}`;

const extractCover = (event: EventSummary) => {
  const cover = event.coverImageUrl || (event as any).coverImageUrl;
  return cover || 'https://placehold.co/320x200/DEF/FFF?text=Event';
};

const goDetail = (id: string) => {
  router.push({ name: 'MobileEventDetail', params: { eventId: id } });
};

onMounted(loadEvents);
</script>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
