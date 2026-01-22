<template>
  <div class="events-page" data-scroll="main">
    <ConsoleTopBar v-if="showTopBar" titleKey="console.communityEvents.title" @back="goBack" />

    <div class="filter-row">
      <div class="segmented">
        <button
          v-for="filter in filters"
          :key="filter.value"
          class="seg-btn"
          :class="{ active: filter.value === activeFilter }"
          @click="activeFilter = filter.value"
        >
          {{ filter.label }}
        </button>
      </div>
    </div>

    <section class="card-list">
      <article v-for="item in filteredEvents" :key="item.id" class="event-card" @click="openManage(item.id, item.status)">
        <figure class="event-cover" :style="item.coverStyle"></figure>
        <div class="event-body">
          <p class="event-date">
            <span class="status-dot" :class="item.statusDotClass"></span>
            {{ item.statusLabel }}
          </p>
          <p class="event-time">{{ item.dateTimeText }}</p>
          <h3 class="event-title">{{ item.title }}</h3>
          <p class="event-meta">{{ item.entrySummary }}</p>
        </div>
      </article>

      <div v-if="!filteredEvents.length && !loading" class="empty">
        条件に合うイベントがありません。
      </div>
      <div v-if="loading" class="empty">読み込み中…</div>

      <div v-if="filteredEvents.length > 0 && filteredEvents.length < 3" class="next-steps">
        <p class="next-steps__title">次にできること</p>
        <div class="next-steps__actions">
          <button type="button" class="hint-btn" @click="createNew">新しいイベントを作成</button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchConsoleCommunityEvents } from '../../../api/client';
import type { ConsoleEventSummary } from '../../../types/api';
import { getLocalizedText } from '../../../utils/i18nContent';
import { getEventStatus } from '../../../utils/eventStatus';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import { useAuth } from '../../../composables/useAuth';
import { resolveAssetUrl } from '../../../utils/assetUrl';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';
import { isLineInAppBrowser } from '../../../utils/liff';
import { useScrollMemory } from '../../../composables/useScrollMemory';
const defaultEventCover =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQwIiBoZWlnaHQ9IjM2MCIgdmlld0JveD0iMCAwIDY0MCAzNjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImJnIiB4MT0iODAiIHkxPSI0MCIgeDI9IjU2MCIgeTI9IjMyMCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMjU2M0VCIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzIyQzU1RSIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iZ2xvdyIgeDE9IjE0MCIgeTE9IjYwIiB4Mj0iNTIwIiB5Mj0iMzAwIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IndoaXRlIiBzdG9wLW9wYWNpdHk9IjAuMzIiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJ3aGl0ZSIgc3RvcC1vcGFjaXR5PSIwLjA1Ii8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogIDwvZGVmcz4KICA8cmVjdCB4PSIyNCIgeT0iMjAiIHdpZHRoPSI1OTIiIGhlaWdodD0iMzIwIiByeD0iMjgiIGZpbGw9InVybCgjYmcpIi8+CiAgPHJlY3QgeD0iNDgiIHk9IjQ0IiB3aWR0aD0iNTQ0IiBoZWlnaHQ9IjI3MiIgcng9IjI0IiBmaWxsPSJ1cmwoI2dsb3cpIi8+CiAgPGNpcmNsZSBjeD0iMTgwIiBjeT0iMTQwIiByPSIyMCIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC41NSIvPgogIDxjaXJjbGUgY3g9IjI0MCIgY3k9IjE0MCIgcj0iMTIiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuNDUiLz4KICA8Y2lyY2xlIGN4PSIzNDAiIGN5PSIxNDAiIHI9IjMwIiBmaWxsPSJ3aGl0ZSIgZmlsbC1vcGFjaXR5PSIwLjQ4Ii8+CiAgPGNpcmNsZSBjeD0iNDIwIiBjeT0iMTQwIiByPSIxNiIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC40Ii8+CiAgPHJlY3QgeD0iMTcwIiB5PSIyMTAiIHdpZHRoPSIzMDAiIGhlaWdodD0iMTYiIHJ4PSI4IiBmaWxsPSJ3aGl0ZSIgZmlsbC1vcGFjaXR5PSIwLjkiLz4KICA8cmVjdCB4PSIyMjAiIHk9IjIzNiIgd2lkdGg9IjIwMCIgaGVpZ2h0PSIxMCIgcng9IjUiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuOCIvPgo8L3N2Zz4K';
const route = useRoute();
const router = useRouter();
const communityStore = useConsoleCommunityStore();
const { user } = useAuth();

const events = ref<ConsoleEventSummary[]>([]);
const loading = ref(false);
const lastFetchedAt = ref(0);
const STALE_MS = 60_000;
// デフォルトは「受付中」のイベントを表示
const activeFilter = ref('open');
const filterStorageKey = computed(() => `console-community-events-filter:${communityId.value || 'all'}`);
const filters = [
  { value: 'all', label: 'すべて' },
  { value: 'open', label: '受付中' },
  { value: 'closed', label: '終了' },
];
const keyword = ref('');
useScrollMemory();

const communityId = computed(() => route.params.communityId as string);
const isAdmin = computed(() => Boolean(user.value?.isAdmin));
const isLiffClientMode = computed(() => isLineInAppBrowser());
const showTopBar = computed(() => !isLiffClientMode.value);

const normalizedEvents = computed(() =>
  events.value
    .filter((event) => event.status !== 'cancelled') // キャンセル済みは一覧に表示しない
    .map((event) => ({
      id: event.id,
      title: getLocalizedText(event.title),
      status: event.status,
      ...(() => {
        if (event.status === 'draft') return { statusState: 'draft', statusLabel: '下書き' };
        if (event.status === 'pending_review') return { statusState: 'draft', statusLabel: '審査中' };
        const { state, label } = getEventStatus(event);
        return { statusState: state, statusLabel: label };
      })(),
      dateTimeText: formatDate(event.startTime, event.endTime),
      entrySummary: event.visibility === 'public' ? '公開で募集しています' : '限定メンバー向けで募集しています',
      coverStyle: {
        backgroundImage: `url(${event.coverImageUrl ? resolveAssetUrl(event.coverImageUrl) : defaultEventCover})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      },
      statusDotClass: (() => {
        if (event.status === 'draft' || event.status === 'pending_review') return 'dot draft';
        const state = getEventStatus(event).state;
        return state === 'open' ? 'dot open' : 'dot closed';
      })(),
    })),
);

const filteredEvents = computed(() => {
  const base =
    activeFilter.value === 'all'
      ? normalizedEvents.value
      : normalizedEvents.value.filter((event) => {
          if (activeFilter.value === 'open') return event.statusState === 'open';
          if (activeFilter.value === 'closed') return event.statusState !== 'open';
          return event.status === activeFilter.value;
        });
  return base;
});

const loadEvents = async () => {
  if (!communityId.value) return;
  loading.value = true;
  try {
    events.value = await fetchConsoleCommunityEvents(communityId.value);
    lastFetchedAt.value = Date.now();
  } catch (err) {
    console.error('Failed to load community events', err);
  } finally {
    loading.value = false;
  }
};

const loadFilterFromStorage = () => {
  if (typeof sessionStorage === 'undefined') return;
  const saved = sessionStorage.getItem(filterStorageKey.value);
  if (saved) activeFilter.value = saved;
};

watch(
  () => activeFilter.value,
  (val) => {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(filterStorageKey.value, val);
  },
);

watch(
  () => communityId.value,
  () => {
    if (communityId.value) {
      loadFilterFromStorage();
      loadEvents();
    }
  },
);

const openManage = (eventId: string, status: string) => {
  if (communityId.value && status === 'draft') {
    router.push({
      name: 'ConsoleMobileEventForm',
      params: { communityId: communityId.value },
      query: { eventId },
    });
    return;
  }
  router.push({ name: 'ConsoleMobileEventManage', params: { eventId } });
};

const goBack = () => {
  router.replace({ name: 'ConsoleMobileHome' });
};

const createNew = () => {
  if (!communityId.value) return;
  router.push({ name: 'ConsoleMobileEventForm', params: { communityId: communityId.value } });
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


onMounted(async () => {
  await communityStore.loadCommunities();
  if (communityId.value) {
    loadFilterFromStorage();
    loadEvents();
  }
});

onActivated(() => {
  if (!lastFetchedAt.value || loading.value) return;
  if (Date.now() - lastFetchedAt.value < STALE_MS) return;
  void loadEvents();
});
</script>

<style scoped>
.events-page {
  min-height: 100vh;
  padding: 12px 16px 16px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.filter-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}
.segmented {
  display: inline-flex;
  gap: 12px;
  border-bottom: 1px solid #e2e8f0;
  padding: 2px 4px 6px;
  width: 100%;
}
.seg-btn {
  flex: 1;
  border: none;
  background: transparent;
  padding: 10px 4px;
  border-radius: 0;
  font-size: 13px;
  color: #94a3b8;
  font-weight: 700;
  position: relative;
}
.seg-btn.active {
  color: #0f172a;
}
.seg-btn.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -6px;
  height: 2px;
  border-radius: 999px;
  background: #0f172a;
}
.card-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 12px;
}
.event-card {
  background: #fff;
  color: #0f172a;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  box-shadow: none;
  overflow: hidden;
}
.event-cover {
  margin: 0;
  width: 100%;
  padding-top: 48%;
  background: #e2e8f0;
  background-size: cover;
  background-position: center;
}
.event-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 12px 14px 14px;
}
.event-date {
  color: #0f172a;
  font-size: 12px;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.event-time {
  margin: 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.5;
}
.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
  border: 1px solid transparent;
}
.dot.open {
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.12);
}
.dot.closed {
  background: #94a3b8;
  box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.12);
}
.dot.draft {
  background: #fbbf24;
  box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.14);
}
.event-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: #0f172a;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.event-meta {
  margin: 0;
  color: #475569;
  font-size: 13px;
}
.next-steps {
  margin-top: 4px;
  padding: 14px;
  border-radius: 14px;
  border: 1px dashed #e2e8f0;
  background: rgba(255, 255, 255, 0.9);
}
.next-steps__title {
  margin: 0 0 10px;
  font-weight: 600;
  color: #0f172a;
  font-size: 13px;
}
.next-steps__actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  width: 100%;
}
.hint-btn {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #cbd5f5;
  background: #f5f7ff;
  color: #0f172a;
  font-weight: 700;
  box-shadow: 0 6px 14px rgba(37, 99, 235, 0.12);
}
.hint-btn.ghost {
  background: #fff;
  color: #475569;
  border-color: #e2e8f0;
  font-weight: 600;
}
.empty {
  text-align: center;
  color: #94a3b8;
  padding: 16px;
  font-size: 13px;
}
</style>
