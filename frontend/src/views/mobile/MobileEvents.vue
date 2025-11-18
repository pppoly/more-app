<template>
  <div class="mobile-events-page">
    <header class="events-hero">
      <div class="hero-chip">MORE EVENTS</div>
      <h1>開催中のイベント</h1>
      <p>気になるイベントをタップして詳細を確認しよう。</p>
    </header>

    <section class="filter-tabs no-scrollbar">
      <button
        v-for="tag in tags"
        :key="tag.value"
        class="filter-tab"
        :class="{ 'filter-tab--active': tag.value === activeTag }"
        @click="activeTag = tag.value"
      >
        {{ tag.label }}
      </button>
    </section>

    <section v-if="loading" class="state-section">
      <article v-for="n in 3" :key="n" class="event-card event-card--skeleton" />
    </section>

    <section v-else-if="error" class="state-section">
      <article class="state-card">
        <p>イベントの読み込みに失敗しました。</p>
        <button type="button" @click="loadEvents">再読み込み</button>
      </article>
    </section>

    <section v-else class="card-list">
      <p v-if="!filteredEvents.length" class="state-empty">条件に合うイベントが見つかりません。</p>

      <article
        v-for="event in filteredEvents"
        :key="event.id"
        class="event-card"
        @click="goDetail(event.id)"
      >
        <figure class="event-card__cover" :style="{ backgroundImage: `url(${event.coverUrl})` }">
          <div class="event-card__cover-overlay"></div>
          <div class="event-card__date-pill">{{ event.dateText }}</div>
          <div class="event-card__status" :class="event.statusClass">{{ event.statusLabel }}</div>
        </figure>

        <div class="event-card__body">
          <h2 class="event-card__title">{{ event.title }}</h2>
          <p class="event-card__meta">
            <span class="i-lucide-calendar text-xs"></span>
            {{ event.timeText }}
          </p>
          <p class="event-card__location">
            <span class="i-lucide-map-pin text-xs"></span>
            {{ event.locationText }}
          </p>

          <div class="event-card__organizer">
            <div class="organizer-avatar">
              <img :src="event.clubAvatar" alt="organizer" />
            </div>
            <div class="organizer-info">
              <p class="organizer-name">{{ event.organizerName }}</p>
              <span class="organizer-status">{{ event.statusHint }}</span>
            </div>
            <div class="event-card__capacity">{{ event.capacityText }}</div>
          </div>

          <div class="event-card__attendees">
            <div class="avatar-stack">
              <img v-for="(avatar, idx) in event.attendees" :key="idx" :src="avatar" alt="attendee" />
            </div>
            <button class="event-card__cta" type="button">詳細を見る</button>
          </div>
        </div>
      </article>
    </section>

    <nav class="mobile-bottom-nav">
      <button
        v-for="item in navItems"
        :key="item.id"
        class="bottom-nav__item"
        :class="{ 'bottom-nav__item--active': item.id === activeNav }"
        @click="goNav(item.path)"
      >
        <span :class="['bottom-nav__icon', item.icon]"></span>
        <span class="bottom-nav__label">{{ item.label }}</span>
      </button>
    </nav>
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
const activeTag = ref('all');

const tags = [
  { value: 'all', label: 'すべて' },
  { value: 'parent', label: '親子' },
  { value: 'sports', label: 'スポーツ' },
  { value: 'language', label: '語学交換' },
  { value: 'work', label: '仕事・スキル' },
];

const navItems = [
  { id: 'home', label: 'トップ', path: '/', icon: 'i-lucide-home' },
  { id: 'events', label: '活動', path: '/events', icon: 'i-lucide-calendar-days' },
  { id: 'me', label: 'マイページ', path: '/me', icon: 'i-lucide-user-round' },
  { id: 'settings', label: '設定', path: '/settings', icon: 'i-lucide-cog' },
];

const fallbackEvents: EventSummary[] = [
  {
    id: 'mock-001',
    status: 'open',
    title: { ja: '代々木公園ピクニック交流' } as any,
    description: null,
    locationText: '代々木公園',
    startTime: new Date().toISOString(),
    coverImageUrl: 'https://placehold.jp/640x360.png?text=MORE',
    category: 'parent',
    community: { id: 'c-1', name: 'Tokyo Language Lounge' } as any,
    ticketTypes: [{ price: 0 } as any],
    config: { currentParticipants: 24, capacity: 30 },
  } as EventSummary,
  {
    id: 'mock-002',
    status: 'closed',
    title: { ja: '語学交換ミートアップ' } as any,
    description: null,
    locationText: '渋谷スクランブルスクエア',
    startTime: new Date(Date.now() + 86400000).toISOString(),
    coverImageUrl: 'https://placehold.jp/640x360.png?text=Meetup',
    category: 'language',
    community: { id: 'c-2', name: 'SOCIALMORE' } as any,
    ticketTypes: [{ price: 1500 } as any],
    config: { currentParticipants: 18, capacity: 20 },
  } as EventSummary,
];

const loadEvents = async () => {
  loading.value = true;
  error.value = null;
  try {
    events.value = await fetchEvents();
  } catch (err) {
    console.warn('fetchEvents failed, using fallback data', err);
    events.value = fallbackEvents;
    error.value = '現在の環境ではデモデータを表示しています。';
  } finally {
    loading.value = false;
  }
};

const filteredEvents = computed(() =>
  events.value
    .map((event) => ({
      id: event.id,
      title: getLocalizedText(event.title),
      category: (event.category ?? '').toLowerCase(),
      coverUrl: event.coverImageUrl ?? 'https://placehold.jp/640x360.png?text=MORE',
      dateText: formatDateShort(event.startTime),
      timeText: formatDateTime(event.startTime),
      locationText: event.locationText,
      organizerName: event.community?.name ?? 'SOCIALMORE',
      statusLabel: statusLabel(event.status),
      statusClass: statusClass(event.status),
      statusHint: statusHint(event.status),
      capacityText: formatCapacity(event),
      clubAvatar: buildClubAvatar(event),
      attendees: attendeeAvatars(event),
    }))
    .filter((event) => activeTag.value === 'all' || event.category.includes(activeTag.value))
);

const goDetail = (eventId: string) => {
  router.push({ name: 'event-detail', params: { eventId } });
};

const goNav = (path: string) => {
  router.push(path);
};

const activeNav = computed(() => {
  const path = router.currentRoute.value.path;
  if (path.startsWith('/settings')) return 'settings';
  if (path.startsWith('/me')) return 'me';
  return path === '/' ? 'home' : 'events';
});

const statusLabel = (status: string) => {
  if (status === 'open') return '参加募集中';
  if (status === 'closed') return '受付終了';
  return '告知予定';
};

const statusHint = (status: string) => {
  if (status === 'open') return 'いま参加できます';
  if (status === 'closed') return '次回をお待ちください';
  return '予定調整中';
};

const statusClass = (status: string) => {
  if (status === 'open') return 'event-card__status--open';
  if (status === 'closed') return 'event-card__status--closed';
  return 'event-card__status--info';
};

const formatDateShort = (value: string) => {
  const date = new Date(value);
  return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return date.toLocaleString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCapacity = (event: EventSummary) => {
  const config = (event.config as any) ?? {};
  const current = config.currentParticipants ?? 0;
  const capacity = config.capacity ?? event.ticketTypes?.[0]?.quota ?? 0;
  return capacity ? `${current}/${capacity}` : `${current}/∞`;
};

const attendeeAvatars = (event: EventSummary) => {
  const config = (event.config as any) ?? {};
  const avatars = config.attendeeAvatars ?? [
    'https://randomuser.me/api/portraits/women/1.jpg',
    'https://randomuser.me/api/portraits/men/2.jpg',
    'https://randomuser.me/api/portraits/women/3.jpg',
  ];
  return avatars.slice(0, 4);
};

const buildClubAvatar = (event: EventSummary) => {
  const initial = event.community?.name?.[0] ?? 'S';
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(initial)}`;
};

onMounted(loadEvents);
</script>

<style scoped>
@import '../../assets/styles/mobile-tokens.css';

.mobile-events-page {
  min-height: 100vh;
  padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
  background: var(--color-page-bg);
  font-family: var(--font-family-base);
}

.events-hero {
  padding: var(--space-xl) var(--space-lg) var(--space-md);
  text-align: left;
}

.hero-chip {
  display: inline-flex;
  padding: var(--space-xxs) var(--space-sm);
  border-radius: var(--radius-pill);
  background: var(--color-badge-bg);
  color: var(--color-text-main);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  letter-spacing: var(--letter-spacing-tight);
}

.events-hero h1 {
  margin: var(--space-xs) 0 0;
  font-size: 22px;
  color: var(--color-text-main);
  line-height: 1.3;
}

.events-hero p {
  margin: var(--space-xxs) 0 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.filter-tabs {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-md);
  overflow-x: auto;
}

.filter-tab {
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-pill);
  padding: var(--space-xs) var(--space-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-main);
  background: var(--color-surface);
  line-height: var(--line-height-sm);
}

.filter-tab--active {
  background: var(--color-primary);
  color: var(--color-text-on-primary);
  border-color: transparent;
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  padding: 0 var(--space-md) var(--space-xl);
}

.event-card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.event-card--skeleton {
  height: 260px;
  animation: card-skeleton 1.6s ease-in-out infinite;
}

@keyframes card-skeleton {
  0% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.6;
  }
}

.event-card__cover {
  position: relative;
  height: 200px;
  background-size: cover;
  background-position: center;
}

.event-card__cover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 30%, rgba(0, 0, 0, 0.45) 100%);
}

.event-card__date-pill {
  position: absolute;
  left: var(--space-md);
  top: var(--space-md);
  padding: var(--space-xxs) var(--space-sm);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-sm);
  color: var(--color-text-on-primary);
  background: var(--color-tag-dark-bg);
  border-radius: var(--radius-tag);
  z-index: 1;
}

.event-card__status {
  position: absolute;
  right: var(--space-md);
  top: var(--space-md);
  padding: var(--space-xxs) var(--space-sm);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  z-index: 1;
}

.event-card__status--open {
  background: rgba(34, 187, 170, 0.15);
  color: #22bbaa;
}

.event-card__status--closed {
  background: rgba(148, 163, 184, 0.2);
  color: #64748b;
}

.event-card__status--info {
  background: rgba(12, 31, 51, 0.2);
  color: var(--color-text-main);
}

.event-card__body {
  padding: var(--space-md);
}

.event-card__title {
  margin: 0;
  font-size: var(--font-size-xl);
  line-height: var(--line-height-xl);
  color: var(--color-text-main);
  font-weight: var(--font-weight-medium);
}

.event-card__meta,
.event-card__location {
  margin: var(--space-xs) 0 0;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-sm);
  color: var(--color-text-muted);
}

.event-card__organizer {
  margin-top: var(--space-lg);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.organizer-avatar img {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-card);
}

.organizer-info {
  flex: 1;
}

.organizer-name {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-main);
}

.organizer-status {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.event-card__capacity {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-primary);
}

.event-card__attendees {
  margin-top: var(--space-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.avatar-stack {
  display: flex;
  align-items: center;
}

.avatar-stack img {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  border: 2px solid var(--color-surface);
  margin-left: -8px;
  box-shadow: var(--shadow-subtle);
}

.avatar-stack img:first-child {
  margin-left: 0;
}

.event-card__cta {
  border: none;
  border-radius: var(--radius-pill);
  padding: var(--space-xs) var(--space-lg);
  background: var(--color-primary);
  color: var(--color-text-on-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.state-section {
  padding: var(--space-md);
}

.state-card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: var(--space-lg);
  text-align: center;
  box-shadow: var(--shadow-card);
}

.state-card button {
  margin-top: var(--space-md);
  border: none;
  border-radius: var(--radius-pill);
  padding: var(--space-xs) var(--space-lg);
  background: var(--color-primary);
  color: var(--color-text-on-primary);
}

.state-empty {
  text-align: center;
  color: var(--color-text-muted);
  padding: var(--space-xl) 0;
}

.mobile-bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: var(--space-sm) var(--space-md) calc(var(--space-sm) + env(safe-area-inset-bottom, 0px));
  background: var(--color-surface);
  border-top: 1px solid var(--color-divider-soft);
  box-shadow: var(--shadow-subtle);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
}

.bottom-nav__item {
  border: none;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xxs);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-disabled);
}

.bottom-nav__item--active {
  color: var(--color-primary);
}

.bottom-nav__icon {
  font-size: 20px;
}

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
