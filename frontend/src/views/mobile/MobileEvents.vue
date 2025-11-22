<template>
  <div class="mobile-events-page">

    <section v-if="loading" class="state-section">
      <article v-for="n in 3" :key="n" class="event-card event-card--skeleton">
        <div class="skeleton block cover"></div>
        <div class="skeleton block line short"></div>
        <div class="skeleton block line"></div>
      </article>
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
                <img :src="avatar" alt="attendee avatar" :style="{ zIndex: event.attendees.length - idx }" />
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
              <img v-if="event.communityLogo" :src="event.communityLogo" alt="community logo" />
              <span v-else>{{ event.communityInitial }}</span>
            </button>
            <p class="event-card__community-name">{{ event.communityName }}</p>
          </div>
        </div>
      </article>
    </section>

  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fetchEvents } from '../../api/client';
import type { EventSummary } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { useResourceConfig } from '../../composables/useResourceConfig';

const router = useRouter();
const events = ref<EventSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const retrying = ref(false);
const loadEvents = async () => {
  loading.value = true;
  error.value = null;
  try {
    events.value = await fetchEvents();
  } catch (err) {
    console.warn('fetchEvents failed', err);
    events.value = [];
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

const resourceConfig = useResourceConfig();
const { slotMap } = resourceConfig;

const fallbackCoverImages = computed(() => {
  const list = resourceConfig.getListValue('mobile.eventList.cardFallbacks');
  if (list.length) return list;
  return (slotMap['mobile.eventList.cardFallbacks'].defaultValue as string[]) ?? [];
});

const defaultAvatarImage = computed(
  () =>
    resourceConfig.getStringValue('global.defaultAvatar') ||
    (slotMap['global.defaultAvatar'].defaultValue as string),
);

const hashToIndex = (value: string, length: number) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % length;
};

const coverStyleForEvent = (event: EventSummary) => {
  const fallbacks = fallbackCoverImages.value.length
    ? fallbackCoverImages.value
    : ((slotMap['mobile.eventList.cardFallbacks'].defaultValue as string[]) ?? []);
  if (event.coverImageUrl) {
    return {
      backgroundImage: `url(${resolveAssetUrl(event.coverImageUrl)})`,
      backgroundPosition: 'center',
      backgroundSize: 'cover',
    };
  }
  const index = hashToIndex(event.id || event.title?.toString() || 'fallback', fallbacks.length || 1);
  return {
    backgroundImage: `url(${fallbacks[index]})`,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
  };
};

const visibleEvents = computed(() => events.value.filter((event) => event.status === 'open'));

const formattedEvents = computed(() =>
  visibleEvents.value.map((event) => {
    const coverStyle = coverStyleForEvent(event);
    const currentParticipants = getCurrentParticipants(event);
    const capacity = getCapacity(event);
    const capacityPercent =
      capacity && capacity > 0 ? Math.min(100, Math.round((currentParticipants / capacity) * 100)) : null;
    return {
      id: event.id,
      title: getLocalizedText(event.title),
      categoryLabel: categoryLabel(event.category),
      dateText: formatDateShort(event.startTime),
      timeText: formatDateTime(event.startTime),
      locationText: event.locationText,
      communityName: event.community?.name ?? 'SOCIALMORE',
      communitySlug: (event.community as any)?.slug ?? event.community?.id ?? 'club',
      communityLogo: event.communityLogoUrl ? resolveAssetUrl(event.communityLogoUrl) : null,
      communityInitial: event.community?.name?.charAt(0)?.toUpperCase() ?? 'M',
      statusLabel: statusLabel(event.status),
      statusClass: statusClass(event.status),
      capacityText: formatCapacity(event),
      capacityPercent,
      hasCover: Boolean(event.coverImageUrl),
      coverStyle,
      attendees: attendeeAvatars(event),
    };
  }),
);

const goDetail = (eventId: string) => {
  router.push({ name: 'event-detail', params: { eventId } });
};

const goCommunity = (slugOrId: string) => {
  if (!slugOrId) return;
  router.push({ name: 'community-portal', params: { slug: slugOrId } });
};

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

const getEventConfig = (event: EventSummary) => ((event as any).config ?? {}) as Record<string, any>;

const getCurrentParticipants = (event: EventSummary) => {
  const config = getEventConfig(event);
  if (typeof config.currentParticipants === 'number') return config.currentParticipants;
  if (Array.isArray(config.participants)) return config.participants.length;
  return 0;
};

const getCapacity = (event: EventSummary) => {
  const config = getEventConfig(event);
  if (typeof config.capacity === 'number') return config.capacity;
  if (typeof event.maxParticipants === 'number') return event.maxParticipants;
  if (Array.isArray(event.ticketTypes) && event.ticketTypes[0]?.price !== undefined) {
    return (event.ticketTypes[0] as any)?.quota ?? null;
  }
  return null;
};

const formatCapacity = (event: EventSummary) => {
  const current = getCurrentParticipants(event);
  const capacity = getCapacity(event);
  if (capacity && capacity > 0) {
    return `${current}/${capacity}`;
  }
  return `${current}人参加中`;
};

const attendeeAvatars = (event: EventSummary) => {
  const config = getEventConfig(event);
  let avatars: string[] = [];
  if (Array.isArray(config.attendeeAvatars) && config.attendeeAvatars.length) {
    avatars = config.attendeeAvatars as string[];
  } else if (Array.isArray(config.participants)) {
    avatars = config.participants.map((participant: any) => participant?.avatarUrl || defaultAvatarImage.value);
  }
  if (!avatars.length && Array.isArray(config.attendeePreview)) {
    avatars = config.attendeePreview.map((item: any) => item?.avatarUrl || defaultAvatarImage.value);
  }
  if (!avatars.length) {
    avatars = [
      defaultAvatarImage.value,
      defaultAvatarImage.value,
      defaultAvatarImage.value,
    ];
  }
  return avatars.slice(0, 5).map((avatar) => resolveAssetUrl(avatar || defaultAvatarImage.value));
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
  gap: 0.65rem;
  padding: 0.5rem 0.6rem var(--space-lg);
}

.event-card {
  background: var(--color-surface);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
  overflow: hidden;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.event-card--skeleton {
  min-height: 190px;
}

.event-card__cover {
  width: 100%;
  height: clamp(150px, 44vw, 200px);
  background-size: cover;
  background-position: center;
  border-radius: 10px;
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
  right: 10px;
  bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.event-card__avatar-stack {
  display: flex;
  align-items: center;
  position: relative;
}

.event-card__avatar-stack img {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.95);
  margin-left: -10px;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.25);
  object-fit: cover;
  background: #f8fafc;
}

.event-card__avatar-stack img:first-child {
  margin-left: 0;
}

.event-card__capacity-pill {
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.82);
  color: #fff;
  font-size: 0.78rem;
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.skeleton.block {
  border-radius: 10px;
}

.skeleton.block.cover {
  width: 100%;
  aspect-ratio: 16 / 9;
}

.skeleton.block.line {
  height: 14px;
}

.skeleton.block.line.short {
  width: 60%;
}

.event-card__details {
  padding: 0.9rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
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
  margin: var(--space-xxs) 0 0;
  font-size: 1.05rem;
  line-height: 1.35;
  font-weight: 700;
  color: var(--color-text-main);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-card__meta,
.event-card__location {
  display: flex;
  align-items: center;
  gap: var(--space-xxs);
  margin: 0;
  font-size: 0.84rem;
  color: var(--color-text-muted);
}

.event-card__community-row {
  margin-top: var(--space-xs);
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0;
}

.event-card__community-avatar {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.08);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--font-weight-semibold);
  font-size: 0.78rem;
  flex-shrink: 0;
  cursor: pointer;
  overflow: hidden;
}

.event-card__community-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: inherit;
  padding: 0;
}

.event-card__community-name {
  margin: 0;
  padding-left: 0.15rem;
  font-size: 0.82rem;
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

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
