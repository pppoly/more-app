<template>
  <div class="events-page">
    <header class="nav-bar">
      <button type="button" class="back-btn" @click="goBack">返回</button>
    </header>

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
          <div class="event-row">
            <p class="event-date">{{ item.dateTimeText }}</p>
            <span :class="statusBadgeClass(item.status)">{{ statusLabel(item.status) }}</span>
          </div>
          <h3 class="event-title">{{ item.title }}</h3>
          <p class="event-meta">{{ item.entrySummary }}</p>
        </div>
      </article>

      <div v-if="!filteredEvents.length && !loading" class="empty">
        没有符合条件的活动。
      </div>
      <div v-if="loading" class="empty">加载中...</div>
    </section>
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
const defaultEventCover =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQwIiBoZWlnaHQ9IjM2MCIgdmlld0JveD0iMCAwIDY0MCAzNjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImJnIiB4MT0iODAiIHkxPSI0MCIgeDI9IjU2MCIgeTI9IjMyMCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMjU2M0VCIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzIyQzU1RSIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iZ2xvdyIgeDE9IjE0MCIgeTE9IjYwIiB4Mj0iNTIwIiB5Mj0iMzAwIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IndoaXRlIiBzdG9wLW9wYWNpdHk9IjAuMzIiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJ3aGl0ZSIgc3RvcC1vcGFjaXR5PSIwLjA1Ii8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogIDwvZGVmcz4KICA8cmVjdCB4PSIyNCIgeT0iMjAiIHdpZHRoPSI1OTIiIGhlaWdodD0iMzIwIiByeD0iMjgiIGZpbGw9InVybCgjYmcpIi8+CiAgPHJlY3QgeD0iNDgiIHk9IjQ0IiB3aWR0aD0iNTQ0IiBoZWlnaHQ9IjI3MiIgcng9IjI0IiBmaWxsPSJ1cmwoI2dsb3cpIi8+CiAgPGNpcmNsZSBjeD0iMTgwIiBjeT0iMTQwIiByPSIyMCIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC41NSIvPgogIDxjaXJjbGUgY3g9IjI0MCIgY3k9IjE0MCIgcj0iMTIiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuNDUiLz4KICA8Y2lyY2xlIGN4PSIzNDAiIGN5PSIxNDAiIHI9IjMwIiBmaWxsPSJ3aGl0ZSIgZmlsbC1vcGFjaXR5PSIwLjQ4Ii8+CiAgPGNpcmNsZSBjeD0iNDIwIiBjeT0iMTQwIiByPSIxNiIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC40Ii8+CiAgPHJlY3QgeD0iMTcwIiB5PSIyMTAiIHdpZHRoPSIzMDAiIGhlaWdodD0iMTYiIHJ4PSI4IiBmaWxsPSJ3aGl0ZSIgZmlsbC1vcGFjaXR5PSIwLjkiLz4KICA8cmVjdCB4PSIyMjAiIHk9IjIzNiIgd2lkdGg9IjIwMCIgaGVpZ2h0PSIxMCIgcng9IjUiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuOCIvPgo8L3N2Zz4K';
const route = useRoute();
const router = useRouter();
const communityStore = useConsoleCommunityStore();
const { user } = useAuth();

const events = ref<ConsoleEventSummary[]>([]);
const loading = ref(false);
// 默认展示「受付中」的事件
const activeFilter = ref('open');
const filters = [
  { value: 'all', label: 'すべて' },
  { value: 'open', label: '受付中' },
  { value: 'closed', label: '終了' },
];
const keyword = ref('');

const communityId = computed(() => route.params.communityId as string);
const isAdmin = computed(() => Boolean(user.value?.isAdmin));

const normalizedEvents = computed(() =>
  events.value.map((event) => ({
    id: event.id,
    title: getLocalizedText(event.title),
    status: event.status,
    dateTimeText: formatDate(event.startTime, event.endTime),
    entrySummary: event.visibility === 'public' ? '公開イベント' : '限定公開',
    coverStyle: {
      backgroundImage: `url(${event.coverImageUrl ? resolveAssetUrl(event.coverImageUrl) : defaultEventCover})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    },
  })),
);

const filteredEvents = computed(() => {
  const base =
    activeFilter.value === 'all'
      ? normalizedEvents.value
      : normalizedEvents.value.filter((event) => event.status === activeFilter.value);
  if (activeFilter.value === 'open' && base.length === 0) {
    return normalizedEvents.value;
  }
  return base;
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

const openDashboard = () => {
  if (!communityId.value) return;
  router.push({ name: 'ConsoleMobileAssistantDashboard', params: { communityId: communityId.value } });
};

const goBack = () => {
  router.back();
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
      return 'pill open';
    case 'closed':
      return 'pill closed';
    default:
      return 'pill draft';
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
.events-page {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 64px) 14px 14px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nav-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 56px;
  padding: calc(env(safe-area-inset-top, 0px) + 8px) 16px 10px;
  margin: 0;
  background: #f8fafc;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
  z-index: 20;
}

.back-btn {
  border: none;
  background: transparent;
  display: inline-flex;
  align-items: center;
  padding: 8px 10px 8px 0;
  color: #0f172a;
  font-weight: 600;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: #0f172a;
}
.back-btn {
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.08);
}

.primary-btn {
  border: none;
  border-radius: 12px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #0090d9, #22bbaa);
  color: #fff;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 12px 24px rgba(0, 144, 217, 0.25);
}
.filter-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}
.segmented {
  display: inline-flex;
  background: #e2e8f0;
  border-radius: 12px;
  padding: 4px;
  width: 100%;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
}
.seg-btn {
  flex: 1;
  border: none;
  background: transparent;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 13px;
  color: #475569;
  font-weight: 600;
}
.seg-btn.active {
  background: #fff;
  color: #0f172a;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12);
}
.card-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.event-card {
  background: #fff;
  color: #0f172a;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  padding: 10px;
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 12px;
  text-align: left;
  align-items: center;
}
.event-date {
  color: #475569;
  font-size: 12px;
  margin: 0;
}
.event-cover {
  margin: 0;
  width: 100%;
  height: 80px;
  border-radius: 12px;
  background: #e2e8f0;
  background-size: cover;
  background-position: center;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.04);
  flex-shrink: 0;
}
.event-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.event-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.pill {
  padding: 0.32rem 0.65rem;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid rgba(15, 23, 42, 0.08);
}
.pill.open {
  background: rgba(34, 197, 94, 0.15);
  color: #15803d;
}
.pill.closed {
  background: rgba(148, 163, 184, 0.18);
  color: #475569;
}
.pill.draft {
  background: rgba(251, 191, 36, 0.2);
  color: #92400e;
}
.event-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.event-meta {
  margin: 0;
  color: #475569;
  font-size: 12px;
}
.empty {
  text-align: center;
  color: #94a3b8;
  padding: 16px;
  font-size: 13px;
}
</style>
