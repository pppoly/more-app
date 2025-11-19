<template>
  <div class="mobile-events-page">

    <section v-if="loading" class="state-section">
      <article v-for="n in 3" :key="n" class="event-card event-card--skeleton" />
    </section>

    <section v-else-if="error" class="state-section">
      <article class="state-card state-card--error">
        <div class="state-card__icon">🚧</div>
        <div class="state-card__body">
          <p class="state-card__title">活動を取得できませんでした</p>
          <p class="state-card__message">{{ error }}</p>
        </div>
        <button type="button" class="state-card__action" @click="retryLoading" :disabled="retrying">
          {{ retrying ? 'リトライ中…' : '再読み込み' }}
        </button>
      </article>
    </section>

    <section v-else class="card-list">
      <p v-if="!formattedEvents.length" class="state-empty">条件に合うイベントが見つかりません。</p>

      <article v-for="event in formattedEvents" :key="event.id" class="event-card" @click="goDetail(event.id)">
        <figure class="event-card__cover" :style="event.coverStyle">
          <div class="event-card__cover-meta">
            <div class="event-card__avatar-stack">
              <template v-for="(avatar, idx) in event.attendees" :key="`${event.id}-attendee-${idx}`">
                <img :src="avatar" alt="attendee" />
              </template>
            </div>
            <span class="event-card__capacity-pill">{{ event.capacityText }}</span>
          </div>
        </figure>
        <div class="event-card__details">
          <h2 class="event-card__title">{{ event.title }}</h2>
          <p class="event-card__meta">
            <span class="i-lucide-clock-8 text-xs"></span>
            {{ event.timeText }}
          </p>
          <div class="event-card__community-row">
            <button type="button" class="event-card__community-avatar" @click.stop="goCommunity(event.communitySlug)">
              <span>{{ event.communityInitial }}</span>
            </button>
            <p class="event-card__community-name">{{ event.communityName }}</p>
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
import { resolveAssetUrl } from '../../utils/assetUrl';

const router = useRouter();
const events = ref<EventSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

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
    coverImageUrl: 'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=1200&q=80',
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
    coverImageUrl: 'https://images.unsplash.com/photo-1515168833906-d2a3b82b302a?auto=format&fit=crop&w=1200&q=80',
    category: 'language',
    community: { id: 'c-2', name: 'SOCIALMORE' } as any,
    ticketTypes: [{ price: 1500 } as any],
    config: { currentParticipants: 18, capacity: 20 },
  } as EventSummary,
];

const retrying = ref(false);
const loadEvents = async () => {
  loading.value = true;
  error.value = null;
  try {
    events.value = await fetchEvents();
    if (!events.value.length) {
      events.value = fallbackEvents;
    }
  } catch (err) {
    console.warn('fetchEvents failed, using fallback data', err);
    events.value = fallbackEvents;
    error.value = 'ネットワーク環境を確認して再試行してください。';
  } finally {
    loading.value = false;
  }
};

const retryLoading = async () => {
  retrying.value = true;
  await loadEvents();
  retrying.value = false;
};

const categoryLabel = (category?: string | null) => {
  const labelMap: Record<string, string> = {
    parent: '親子',
    sports: 'スポーツ',
    language: '語学',
    work: 'スキル',
    career: 'キャリア',
    kids: 'キッズ',
  };
  const key = (category ?? '').toLowerCase();
  return labelMap[key] ?? 'イベント';
};

const fallbackCoverImages = [
  'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1448932223592-d1fc686e76ea?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1515168833906-d2a3b82b302a?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1454165205744-3b78555e5572?auto=format&fit=crop&w=1200&q=80',
];

const hashToIndex = (value: string, length: number) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % length;
};

const coverStyleForEvent = (event: EventSummary) => {
  if (event.coverImageUrl) {
    return {
      backgroundImage: `url(${resolveAssetUrl(event.coverImageUrl)})`,
      backgroundPosition: 'center',
      backgroundSize: 'cover',
    };
  }
  const index = hashToIndex(event.id || event.title?.toString() || 'fallback', fallbackCoverImages.length);
  return {
    backgroundImage: `url(${fallbackCoverImages[index]})`,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
  };
};

const formattedEvents = computed(() =>
  events.value.map((event) => {
    const coverStyle = coverStyleForEvent(event);
    return {
      id: event.id,
      title: getLocalizedText(event.title),
      categoryLabel: categoryLabel(event.category),
      dateText: formatDateShort(event.startTime),
      timeText: formatDateTime(event.startTime),
      locationText: event.locationText,
      communityName: event.community?.name ?? 'SOCIALMORE',
      communitySlug: (event.community as any)?.slug ?? event.community?.id ?? 'club',
      communityInitial: event.community?.name?.charAt(0)?.toUpperCase() ?? 'M',
      statusLabel: statusLabel(event.status),
      statusClass: statusClass(event.status),
      capacityText: formatCapacity(event),
      hasCover: Boolean(event.coverImageUrl),
      coverStyle,
      attendees: attendeeAvatars(event),
    };
  })
);

const goDetail = (eventId: string) => {
  router.push({ name: 'event-detail', params: { eventId } });
};

const goCommunity = (slugOrId: string) => {
  if (!slugOrId) return;
  router.push({ name: 'community-portal', params: { slug: slugOrId } });
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
  if (capacity) {
    return `${current}/${capacity}`;
  }
  return '10/50';
};

const attendeeAvatars = (event: EventSummary) => {
  const config = (event.config as any) ?? {};
  const avatars =
    config.attendeeAvatars ??
    [
      'https://randomuser.me/api/portraits/women/19.jpg',
      'https://randomuser.me/api/portraits/men/32.jpg',
      'https://randomuser.me/api/portraits/women/45.jpg',
      'https://randomuser.me/api/portraits/men/52.jpg',
      'https://randomuser.me/api/portraits/women/21.jpg',
    ];
  return avatars.slice(0, 10);
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

.card-list {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 0.5rem 0.5rem var(--space-xl);
}

.event-card {
  background: var(--color-surface);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.event-card--skeleton {
  height: 240px;
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
  width: 100%;
  aspect-ratio: 16 / 9;
  background-size: cover;
  background-position: center;
  border-radius: 12px 12px 0 0;
  margin: 0;
  position: relative;
}

.event-card__cover-fallback {
  font-size: 2.2rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
}

.event-card__cover-meta {
  position: absolute;
  right: var(--space-sm);
  bottom: var(--space-sm);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-xs);
}

.event-card__avatar-stack {
  display: flex;
  align-items: center;
}

.event-card__avatar-stack img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.9);
  margin-left: -10px;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.25);
}

.event-card__avatar-stack img:first-child {
  margin-left: 0;
}

.event-card__capacity-pill {
  padding: 0.2rem 0.6rem;
  border-radius: var(--radius-pill);
  background: rgba(15, 23, 42, 0.75);
  color: #fff;
  font-size: 0.8rem;
  font-weight: var(--font-weight-semibold);
}

.event-card__details {
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.event-card__meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.event-card__category {
  padding: var(--space-xxs) var(--space-sm);
  border-radius: var(--radius-pill);
  background: rgba(15, 23, 42, 0.05);
  color: var(--color-text-main);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.event-card__title {
  margin: var(--space-xs) 0 0;
  font-size: 1.3rem;
  line-height: 1.35;
  font-weight: 700;
  color: var(--color-text-main);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-card__meta,
.event-card__location {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.event-card__community-row {
  margin-top: var(--space-sm);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) 0;
}

.event-card__community-avatar {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.85), rgba(59, 130, 246, 0.65));
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--font-weight-semibold);
  font-size: 0.8rem;
  flex-shrink: 0;
  border: none;
  cursor: pointer;
}

.event-card__community-name {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-main);
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

.state-card--error {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  text-align: left;
}

.state-card__icon {
  font-size: 2rem;
}

.state-card__title {
  margin: 0;
  font-weight: 600;
  color: #0f172a;
}

.state-card__message {
  margin: 0;
  color: #475569;
  font-size: 0.9rem;
}

.state-card__action {
  align-self: flex-start;
  background: linear-gradient(135deg, #0ea5e9, #22d3ee);
  color: #fff;
  padding: 0.4rem 0.9rem;
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
