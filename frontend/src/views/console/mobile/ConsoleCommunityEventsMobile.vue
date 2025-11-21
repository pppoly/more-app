<template>
  <div class="events-page">
    <header class="hero-card">
      <div>
        <p class="eyebrow">社群 · {{ communityName }}</p>
        <h1>{{ heroTitle }}</h1>
        <p class="sub">集中管理活动，随时创建和更新。</p>
      </div>
      <div class="hero-actions">
        <button type="button" class="primary" @click="createEvent">
          <span class="i-lucide-plus mr-1"></span>
          新建活动
        </button>
        <button v-if="isAdmin" type="button" class="ghost" @click="openDashboard">
          <span class="i-lucide-activity mr-1"></span>
          助手仪表盘
        </button>
      </div>
    </header>

    <div class="filter-row">
      <div class="search-box">
        <span class="i-lucide-search"></span>
        <input v-model="keyword" type="search" placeholder="搜索活动名称" />
      </div>
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
      <article v-for="item in filteredEvents" :key="item.id" class="event-card" @click="openManage(item.id)">
        <div :class="statusBadgeClass(item.status)">{{ statusLabel(item.status) }}</div>
        <p class="event-date">{{ item.dateTimeText }}</p>
        <h3 class="event-title">{{ item.title }}</h3>
        <p class="event-meta">{{ item.entrySummary }}</p>
      </article>

      <div v-if="!filteredEvents.length && !loading" class="empty">
        还没有符合筛选的活动，去创建一个吧。
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
const communityName = computed(() => {
  const target = communityStore.communities.value.find((c) => c.id === communityId.value);
  return target?.name ?? '未選択';
});
const isAdmin = computed(() => Boolean(user.value?.isAdmin));
const heroTitle = computed(() => (communityName.value ? `${communityName.value} 的活动` : '社群活动'));

const normalizedEvents = computed(() =>
  events.value.map((event) => ({
    id: event.id,
    title: getLocalizedText(event.title),
    status: event.status,
    dateTimeText: formatDate(event.startTime, event.endTime),
    entrySummary: event.visibility === 'public' ? '公開イベント' : '限定公開',
  })),
);

const filteredEvents = computed(() => {
  const base =
    activeFilter.value === 'all'
      ? normalizedEvents.value
      : normalizedEvents.value.filter((event) => event.status === activeFilter.value);
  const searched = keyword.value
    ? base.filter((event) => event.title.toLowerCase().includes(keyword.value.toLowerCase()))
    : base;
  // 如果「受付中」为空，自动回落到全部列表
  if (activeFilter.value === 'open' && searched.length === 0) {
    return keyword.value
      ? normalizedEvents.value.filter((event) =>
          event.title.toLowerCase().includes(keyword.value.toLowerCase()),
        )
      : normalizedEvents.value;
  }
  return searched;
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
  padding: 16px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hero-card {
  padding: 14px;
  border-radius: 16px;
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #f8fafc;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  box-shadow: 0 16px 40px rgba(37, 99, 235, 0.22);
}
.eyebrow {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
  opacity: 0.9;
}
.hero-card h1 {
  margin: 2px 0 4px;
  font-size: 18px;
  font-weight: 800;
}
.sub {
  margin: 0;
  color: #e2f3ff;
  font-size: 13px;
}
.hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.primary,
.ghost {
  border: none;
  border-radius: 12px;
  padding: 8px 12px;
  font-weight: 700;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  color: #0f172a;
}
.primary {
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  box-shadow: 0 12px 28px rgba(37, 99, 235, 0.25);
}
.ghost {
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.4);
  color: #f8fafc;
}
.filter-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.02);
}
.search-box input {
  border: none;
  outline: none;
  flex: 1;
  font-size: 14px;
  background: transparent;
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
  display: grid;
  gap: 10px;
}
.event-card {
  background: rgba(247, 249, 251, 0.95);
  color: #0f172a;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.02), 0 10px 22px rgba(15, 23, 42, 0.06);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
}
.event-date {
  color: #475569;
  font-size: 12px;
  margin: 0;
}
.pill {
  padding: 0.35rem 0.6rem;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.pill.open {
  background: rgba(34, 197, 94, 0.18);
  color: #bbf7d0;
}
.pill.closed {
  background: rgba(148, 163, 184, 0.18);
  color: #e2e8f0;
}
.pill.draft {
  background: rgba(251, 191, 36, 0.2);
  color: #fde68a;
}
.event-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
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
