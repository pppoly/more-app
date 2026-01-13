<template>
  <div class="events-page" data-scroll="main">
    <!-- App Bar -->
    <header v-if="!showBrandBar" class="app-bar">
      <div class="app-bar__left">
        <img :src="logoImage" alt="MORE logo" class="logo-img" />
      </div>
      <div class="app-bar__title">MORE</div>
      <div class="app-bar__actions"></div>
    </header>

    <main class="content">
      <!-- カテゴリーチップ -->
      <div class="chip-row">
        <button
          v-for="cat in categories"
          :key="cat.id"
          type="button"
          class="chip"
          :class="{ 'chip--active': cat.id === activeCategoryId }"
          @click="selectCategory(cat.id)"
        >
          {{ cat.label }}
        </button>
      </div>
      <!-- Loading -->
      <section v-if="loading" class="state-list">
        <article v-for="n in 3" :key="n" class="card">
          <div class="cover skeleton"></div>
          <div class="skeleton line w-70"></div>
          <div class="skeleton line w-50"></div>
        </article>
      </section>

      <!-- Error -->
      <section v-else-if="error" class="state-list">
        <article class="card state-card">
          <p class="state-title">活動を取得できませんでした</p>
          <p class="state-desc">{{ error }}</p>
          <button type="button" class="primary-btn" @click="retryLoading" :disabled="retrying">
            {{ retrying ? 'リトライ中…' : '再読み込み' }}
          </button>
        </article>
      </section>

      <!-- Empty -->
      <section v-else-if="!formattedEvents.length" class="state-list">
        <p class="empty-text">条件に合うイベントが見つかりません。</p>
      </section>

      <!-- Cards -->
      <section v-else class="section-list">
        <div v-for="section in groupedEvents" :key="section.id" class="group">
          <p class="group-title">{{ section.title }}</p>
          <div class="card-list">
            <article v-for="event in section.items" :key="event.id" class="card" @click="goDetail(event.id)">
              <div class="cover-wrapper">
                <img
                  v-if="event.coverUrl"
                  :src="event.coverUrl"
                  alt="event cover"
                  class="cover"
                  loading="lazy"
                />
                <div v-else class="cover cover-fallback">MORE</div>
                <div class="cover-gradient"></div>
              </div>
              <div class="card-body">
                <h2 class="title">{{ event.title }}</h2>
                <div class="meta-row">
                  <p class="time">
                    <span class="i-lucide-clock-8 text-xs"></span>
                    {{ event.timeText }}
                  </p>
                  <span class="status-chip">{{ event.statusText }}</span>
                </div>
                <div class="attendees" v-if="event.showAvatars && event.attendees.length">
                  <div class="avatar-row">
                    <img
                      v-for="(avatar, idx) in event.attendees"
                      :key="`${event.id}-att-${idx}`"
                      :src="avatar"
                      alt="attendee"
                    />
                    <span v-if="event.attendeesMore > 0" class="avatar-more">+{{ event.attendeesMore }}</span>
                  </div>
                </div>
                <p v-if="event.areaText" class="location">
                  <span class="i-lucide-map-pin text-xs"></span>
                  {{ event.areaText }}
                </p>
                <p class="byline">by {{ event.communityName }}</p>
              </div>
            </article>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'MobileEvents' });
import { computed, onActivated, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fetchEvents } from '../../api/client';
import type { EventSummary } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import { getEventStatus } from '../../utils/eventStatus';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { EVENT_CATEGORY_OPTIONS, normalizeEventCategory } from '../../utils/eventCategory';
import { useResourceConfig } from '../../composables/useResourceConfig';
import { useLocale } from '../../composables/useLocale';
import { trackEvent } from '../../utils/analytics';
import { useAppShellMode } from '../../composables/useAppShellMode';
import logo1 from '../../assets/images/logo1.svg';

const router = useRouter();
const { showBrandBar } = useAppShellMode();
const events = ref<EventSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const retrying = ref(false);
const lastFetchedAt = ref(0);
const STALE_MS = 60_000;
const activeCategoryId = ref('all');
const { preferredLangs } = useLocale();
const logoImage = logo1;

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

const loadEvents = async () => {
  loading.value = true;
  error.value = null;
  try {
    events.value = await fetchEvents();
    trackEvent('view_events_list', { count: events.value.length });
    lastFetchedAt.value = Date.now();
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

const hashToIndex = (value: string, length: number) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % length;
};

const coverUrlForEvent = (event: EventSummary) => {
  const fallbacks = fallbackCoverImages.value.length
    ? fallbackCoverImages.value
    : ((slotMap['mobile.eventList.cardFallbacks'].defaultValue as string[]) ?? []);
  if (event.coverImageUrl) return resolveAssetUrl(event.coverImageUrl);
  if (!fallbacks.length) return '';
  const index = hashToIndex(event.id || event.title?.toString() || 'fallback', fallbacks.length || 1);
  return fallbacks[index];
};

const visibleEvents = computed(() => events.value.filter((event) => event.status === 'open'));

const categories = computed(() => [
  { id: 'all', label: 'すべて' },
  ...EVENT_CATEGORY_OPTIONS.map((cat) => ({ id: cat.value, label: cat.label })),
]);

const filteredEvents = computed(() => {
  if (activeCategoryId.value === 'all') return visibleEvents.value;
  return visibleEvents.value.filter(
    (ev) => normalizeEventCategory(ev.category) === activeCategoryId.value,
  );
});

const formattedEvents = computed(() =>
  filteredEvents.value.map((event) => {
    const participantsCount = getCurrentParticipants(event);
    const capacity = getCapacity(event);
    const capacityText =
      participantsCount > 0
        ? capacity && capacity > 0
          ? `${participantsCount} / ${capacity}`
          : `${participantsCount}人`
        : '';
    const { attendees, attendeesMore } = attendeeAvatars(event);
    const startAt = new Date(event.startTime).getTime();
    const { label: statusText } = getEventStatus(event);
    const category = normalizeEventCategory(event.category);
    const isSocial = isSocialCategory(category);
    return {
      id: event.id,
      title: getLocalizedText(event.title, preferredLangs.value),
      timeText: formatScheduleLine(event.startTime, event.endTime),
      communityName: event.community?.name ?? 'SOCIALMORE',
      capacityText,
      coverUrl: coverUrlForEvent(event),
      attendees,
      attendeesMore,
      startAt,
      statusText,
      areaText: summarizeLocation(event.locationText as string | undefined),
      showAvatars: participantsCount > 0 && (isSocial || !category),
    };
  }),
);

const groupedEvents = computed(() => {
  const now = Date.now();
  const soonThreshold = now + 7 * 24 * 60 * 60 * 1000; // 7 days
  const upcoming = formattedEvents.value.filter((ev) => ev.startAt >= now && ev.startAt <= soonThreshold);
  const future = formattedEvents.value.filter((ev) => ev.startAt > soonThreshold);
  const past = formattedEvents.value.filter((ev) => ev.startAt < now);
  const sections = [];
  if (upcoming.length) sections.push({ id: 'upcoming', title: '直近のイベント', items: upcoming });
  if (future.length) sections.push({ id: 'future', title: '今後のイベント', items: future });
  if (past.length) sections.push({ id: 'past', title: '終了したイベント', items: past });
  return sections;
});

const goDetail = (eventId: string) => {
  router.push({ name: 'event-detail', params: { eventId } });
};

const selectCategory = (id: string) => {
  activeCategoryId.value = id;
};

const formatTime = (value?: string) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
};

const formatLongDate = (value?: string) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
};

const formatDayWithWeekday = (value?: string) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ja-JP', {
    day: 'numeric',
    weekday: 'short',
  });
};

const formatScheduleLine = (start?: string, end?: string | null) => {
  if (!start) return '';
  const startDate = new Date(start);
  const startText = `${formatLongDate(start)} ${formatTime(start)}`;
  if (!end) {
    return startText;
  }
  const endDate = new Date(end);
  const sameDay = startDate.toDateString() === endDate.toDateString();
  if (sameDay) {
    return `${formatLongDate(start)} ${formatTime(start)}〜${formatTime(end)}`;
  }
  const sameMonth =
    startDate.getFullYear() === endDate.getFullYear() && startDate.getMonth() === endDate.getMonth();
  const endDateText = sameMonth ? formatDayWithWeekday(end) : formatLongDate(end);
  return `${formatLongDate(start)} ${formatTime(start)}〜${endDateText} ${formatTime(end)}`;
};

const isSocialCategory = (category: string) => {
  const social = ['social', 'music', 'art', 'food', 'family', 'language', 'mind', 'public', 'campus', 'online'];
  return social.includes(category);
};

const summarizeLocation = (text?: string | null) => {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const parts = cleaned.split(/、|,|・|\/|\|/).map((p) => p.trim()).filter(Boolean);
  const first = parts[0] || cleaned;
  return first.length > 18 ? `${first.slice(0, 18)}…` : first;
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
  return `${current}人`;
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
  const resolved = avatars.map((avatar) => resolveAssetUrl(avatar || defaultAvatarImage.value));
  const visible = resolved.slice(0, 3);
  const extra = resolved.length > visible.length ? resolved.length - visible.length : 0;
  return { attendees: visible, attendeesMore: extra };
};

onMounted(loadEvents);

onActivated(() => {
  if (!lastFetchedAt.value || loading.value) return;
  if (Date.now() - lastFetchedAt.value < STALE_MS) return;
  void loadEvents();
});
</script>

<style scoped>
.events-page {
  min-height: 100vh;
  background: #f3f4f6;
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  width: 100%;
  max-width: 100vw;
  box-sizing: border-box;
  overflow-x: hidden;
}
.app-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  background: #ffffff;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  justify-content: center;
  padding: calc(12px + env(safe-area-inset-top, 0px)) 16px 12px;
  border-bottom: 1px solid #e5e7eb;
}
.app-bar__title {
  justify-self: center;
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}
.logo-chip,
.logo-img {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  object-fit: contain;
}
.icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #0f172a;
  display: grid;
  place-items: center;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.06);
}
.action-placeholder {
  display: inline-block;
  width: 40px;
  height: 40px;
}
.content {
  padding: 8px 0 0;
}
.chip-row {
  padding: 0 16px 10px;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.chip-row::-webkit-scrollbar {
  display: none;
}
.chip {
  height: 32px;
  padding: 0 14px;
  border-radius: 16px;
  border: 1px solid #d8dde6;
  background: #ffffff;
  color: #374151;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.chip--active {
  background: #1d9bf0;
  border-color: #1d9bf0;
  color: #ffffff;
  box-shadow: 0 6px 14px rgba(29, 155, 240, 0.16);
}
.card-list,
.state-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 16px;
}
.section-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 0 0 8px;
}
.group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.group-title {
  margin: 0 16px;
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
}
.card {
  background: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.07);
}
.cover-wrapper {
  position: relative;
}
.cover {
  width: 100%;
  height: 135px;
  object-fit: cover;
  display: block;
}
.cover-fallback {
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #dbeafe, #bfdbfe);
  color: #1d4ed8;
  font-weight: 800;
  letter-spacing: 1px;
}
.cover-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0.35) 100%);
}
.avatar-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
}
.avatar-row img {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.7);
}
.avatar-more {
  padding: 3px 6px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.65);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}
.card-body {
  padding: 8px 12px 10px;
  display: grid;
  gap: 4px;
}
.title {
  margin: 0 0 2px;
  font-size: 16px;
  font-weight: 720;
  color: #0f172a;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.time {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #374151;
}
.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.status-chip {
  padding: 4px 8px;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0f172a;
  font-size: 11px;
  font-weight: 700;
}
.attendees {
  display: flex;
  align-items: center;
  gap: 6px;
}
.location {
  margin: 2px 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #4b5563;
}
.byline {
  margin: 0 0 2px;
  font-size: 11px;
  color: #6b7280;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.byline::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #e2e8f0;
  display: inline-block;
}
.skeleton {
  background: linear-gradient(90deg, #e5e7eb, #f1f5f9, #e5e7eb);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
  border-radius: 12px;
}
.skeleton.line {
  height: 12px;
  margin-top: 10px;
}
.skeleton.w-70 {
  width: 70%;
}
.skeleton.w-50 {
  width: 50%;
}
.state-card {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.state-title {
  margin: 0;
  font-weight: 700;
  color: #0f172a;
}
.state-desc {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}
.primary-btn {
  align-self: flex-start;
  border: none;
  border-radius: 999px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #0ea5e9, #2563eb);
  color: #fff;
  font-weight: 700;
}
.empty-text {
  text-align: center;
  color: #6b7280;
  padding: 32px 0;
}

@keyframes shimmer {
  0% {
    background-position: 0% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
