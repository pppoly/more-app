<template>
  <section class="community-portal-mobile" :class="themeClass">

    <div v-if="loading" class="portal-skeleton">
      <div class="portal-skeleton__hero"></div>
      <div class="portal-skeleton__card"></div>
      <div class="portal-skeleton__card"></div>
    </div>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <template v-else-if="community">
      <article class="portal-hero" :style="heroStyle">
        <div class="portal-hero__overlay"></div>
        <div class="portal-hero__content">
          <h1>{{ community.name }}</h1>
          <div class="portal-hero__labels" v-if="community.labels.length">
            <span v-for="label in community.labels" :key="label">#{{ label }}</span>
          </div>
          <div class="portal-hero__ticker" v-if="heroTicker.length">
            <div class="ticker-track">
              <span v-for="item in heroTicker" :key="item.id + '-ticker'" class="ticker-chip">
                {{ item.text }}
              </span>
            </div>
          </div>
        </div>
      </article>

      <article class="portal-card">
        <header class="portal-card__header">
          <p class="eyebrow">ABOUT</p>
          <h2>コミュニティ紹介</h2>
        </header>
        <p class="portal-card__body" :class="{ truncated: !descriptionExpanded }">
          {{ descriptionText }}
        </p>
        <button
          v-if="shouldTruncate"
          type="button"
          class="portal-hero__toggle"
          @click="descriptionExpanded = !descriptionExpanded"
        >
          {{ descriptionExpanded ? '閉じる' : '続きを読む' }}
        </button>
      </article>

      <article class="portal-card" ref="eventsSection">
        <header class="portal-card__header">
          <p class="eyebrow">EVENTS</p>
          <h2>活動ハイライト</h2>
        </header>
        <nav class="portal-nav">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            type="button"
            :class="['portal-nav__item', { active: activeTab === tab.value }]"
            @click="activeTab = tab.value"
          >
            <div class="portal-nav__icon" :class="tab.icon"></div>
            <div class="portal-nav__text">
              <p>{{ tab.label }}</p>
              <small>{{ tab.description }}</small>
            </div>
            <span class="portal-nav__chevron">›</span>
          </button>
        </nav>
        <div class="tab-panel">
          <template v-if="activeTab === 'upcoming'">
            <div v-if="!upcomingEvents.length" class="empty-panel">
              <p>まだ招募中のイベントはありません。</p>
              <span>フォローして最新情報を受け取りましょう。</span>
            </div>
            <ul v-else class="portal-event-list">
              <li v-for="event in upcomingEvents" :key="event.id">
                <RouterLink :to="`/events/${event.id}`">
                  <div class="event-item">
                    <div class="event-item__content">
                      <p class="event-item__title">{{ event.title }}</p>
                      <p class="event-item__meta">{{ event.date }} · {{ event.locationText || '場所未定' }}</p>
                    </div>
                    <span class="event-item__status open">受付中</span>
                  </div>
                </RouterLink>
              </li>
            </ul>
          </template>
          <template v-else-if="activeTab === 'past'">
            <div v-if="!pastEvents.length" class="empty-panel">
              <p>まだ過去のアーカイブがありません。</p>
            </div>
            <ul v-else class="portal-event-list">
              <li v-for="event in pastEvents" :key="event.id">
                <div class="event-item">
                  <div class="event-item__content">
                    <p class="event-item__title">{{ event.title }}</p>
                    <p class="event-item__meta">{{ event.date }} · {{ event.locationText || '場所未定' }}</p>
                  </div>
                  <span class="event-item__status closed">終了</span>
                </div>
              </li>
            </ul>
          </template>
          <template v-else>
            <div v-if="!highlightMoments.length" class="empty-panel">
              <p>まだ写真がありません。</p>
            </div>
            <div v-else class="moment-grid">
              <figure v-for="moment in highlightMoments" :key="moment.id">
                <img :src="moment.image" :alt="moment.title" />
                <figcaption>{{ moment.title }}</figcaption>
              </figure>
            </div>
          </template>
        </div>
      </article>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { fetchCommunityBySlug } from '../../api/client';
import type { CommunityPortal } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import { resolveAssetUrl } from '../../utils/assetUrl';

const route = useRoute();
const slug = computed(() => route.params.slug as string);
const community = ref<CommunityPortal | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const eventsSection = ref<HTMLElement | null>(null);

const loadCommunity = async (value: string) => {
  if (!value) {
    error.value = 'コミュニティIDが見つかりません';
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    community.value = await fetchCommunityBySlug(value);
  } catch (err) {
    error.value = 'このコミュニティは存在しません（社群不存在 or 已下線）';
  } finally {
    loading.value = false;
  }
};

watch(
  slug,
  (current) => {
    if (current) {
      loadCommunity(current);
    }
  },
  { immediate: true },
);

const descriptionExpanded = ref(false);
const descriptionText = computed(() => getLocalizedText(community.value?.description) || '紹介文は準備中です。');
const shouldTruncate = computed(() => descriptionText.value.length > 120);

watch(community, () => {
  descriptionExpanded.value = false;
});

const heroStyle = computed(() => {
  const cover = community.value?.coverImageUrl ? resolveAssetUrl(community.value.coverImageUrl) : '';
  const fallback =
    'linear-gradient(135deg, rgba(15, 23, 42, 0.5), rgba(3, 7, 18, 0.85)), url("https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1400&q=80")';
  return {
    backgroundImage: cover
      ? `linear-gradient(135deg, rgba(15, 23, 42, 0.45), rgba(3, 7, 18, 0.9)), url(${cover})`
      : fallback,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
});

const themeName = computed(() => community.value?.portalConfig?.theme || 'immersive');
const themeClass = computed(() => [`portal-theme-${themeName.value}`]);

const formattedEvents = computed(() =>
  (community.value?.events ?? []).map((event) => ({
    ...event,
    title: getLocalizedText(event.title) || 'イベント',
    date: new Date(event.startTime).toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
    statusLabel: event.status === 'open' ? '受付中' : '終了',
    statusClass: event.status === 'open' ? 'open' : 'closed',
  })),
);

const heroUpdates = computed(() => {
  const events = formattedEvents.value;
  if (!events.length) {
    return [{ id: 'empty', text: '最新の活動を準備中です' }];
  }
  return events.map((event) => ({
    id: event.id,
    text: `${event.status === 'open' ? '新着募集' : 'アーカイブ'} · ${event.title}`,
  }));
});
const heroTicker = computed(() => [...heroUpdates.value, ...heroUpdates.value]);

const scrollToEvents = () => {
  eventsSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const tabs = [
  { value: 'upcoming', label: '招募中', description: '現在受付中のイベント', icon: 'i-lucide-play-circle' },
  { value: 'past', label: '往期活動', description: '過去に実施した活動', icon: 'i-lucide-archive' },
  { value: 'moments', label: '精彩瞬間', description: 'ハイライト写真', icon: 'i-lucide-stars' },
];
const activeTab = ref<'upcoming' | 'past' | 'moments'>('upcoming');

const upcomingEvents = computed(() => formattedEvents.value.filter((event) => event.status === 'open'));
const pastEvents = computed(() => formattedEvents.value.filter((event) => event.status !== 'open'));
const highlightMoments = computed(() =>
  pastEvents.value.slice(0, 3).map((event, index) => ({
    id: `${event.id}-${index}`,
    title: event.title,
    image: resolveAssetUrl(community.value?.coverImageUrl) || 'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=800&q=80',
  })),
);
</script>

<style scoped>
.community-portal-mobile {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-bottom: 2rem;
  --hero-overlay-from: rgba(15, 23, 42, 0.15);
  --hero-overlay-to: rgba(2, 6, 23, 0.82);
  --card-bg: #fff;
  --chip-bg: rgba(255, 255, 255, 0.2);
  --chip-border: rgba(255, 255, 255, 0.35);
}

.portal-theme-clean {
  --hero-overlay-from: rgba(255, 255, 255, 0.15);
  --hero-overlay-to: rgba(15, 23, 42, 0.25);
  --card-bg: #f8fafc;
  --chip-bg: rgba(15, 23, 42, 0.07);
  --chip-border: rgba(15, 23, 42, 0.12);
}

.portal-theme-immersive {
  --hero-overlay-from: rgba(15, 23, 42, 0.2);
  --hero-overlay-to: rgba(2, 6, 23, 0.85);
}

.portal-theme-warm {
  --hero-overlay-from: rgba(248, 180, 0, 0.35);
  --hero-overlay-to: rgba(249, 115, 22, 0.65);
  --card-bg: #fff7ed;
  --chip-bg: rgba(249, 115, 22, 0.15);
  --chip-border: rgba(249, 115, 22, 0.25);
}

.portal-theme-collage {
  --hero-overlay-from: rgba(99, 102, 241, 0.32);
  --hero-overlay-to: rgba(15, 23, 42, 0.8);
  --card-bg: #f8f7ff;
  --chip-bg: rgba(99, 102, 241, 0.15);
  --chip-border: rgba(99, 102, 241, 0.25);
}

.portal-skeleton {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  animation: pulse 1.5s ease-in-out infinite;
}

.portal-skeleton__hero,
.portal-skeleton__card {
  border-radius: 1.25rem;
  background: linear-gradient(90deg, #f4f6fb 25%, #e9edf7 37%, #f4f6fb 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

.portal-skeleton__hero {
  height: 220px;
}

.portal-skeleton__card {
  height: 140px;
}

@keyframes shimmer {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: -135% 50%;
  }
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
  100% {
    opacity: 1;
  }
}

.portal-hero {
  position: relative;
  min-height: 240px;
  border-radius: 1.25rem;
  overflow: hidden;
  background-size: cover;
  background-position: center;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
}

.portal-hero__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, var(--hero-overlay-from), var(--hero-overlay-to));
}

.portal-hero__content {
  position: relative;
  z-index: 1;
  padding: 1.2rem 1.25rem 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  color: #fff;
}

.portal-hero__content h1 {
  margin: 0;
  font-size: 1.8rem;
  line-height: 1.2;
}

.portal-hero__labels {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.portal-hero__labels span {
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  background: var(--chip-bg);
  border: 1px solid var(--chip-border);
  font-size: 0.85rem;
}

.portal-hero__ticker {
  overflow: hidden;
  mask-image: linear-gradient(90deg, transparent 0%, #000 12%, #000 88%, transparent 100%);
}

.ticker-track {
  display: inline-flex;
  gap: 0.5rem;
  min-width: 100%;
  animation: ticker 18s linear infinite;
  will-change: transform;
}

.ticker-chip {
  padding: 0.25rem 0.7rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(0, 0, 0, 0.25);
  font-size: 0.85rem;
  white-space: nowrap;
}

@keyframes ticker {
  0% {
    transform: translate3d(0, 0, 0);
  }
  100% {
    transform: translate3d(-50%, 0, 0);
  }
}

.portal-card {
  background: var(--card-bg);
  border-radius: 1.25rem;
  padding: 1.25rem;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.portal-card__header {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.portal-card__header h2 {
  margin: 0;
  font-size: 1.2rem;
}

.portal-card__body {
  margin: 0;
  color: #475569;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.portal-card__body.truncated {
  -webkit-line-clamp: 3;
}

.portal-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.8rem;
  border-radius: 0.9rem;
  background: #f8fafc;
  color: #1e293b;
}

.portal-meta p {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
}

.eyebrow {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.portal-event-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.empty-panel {
  border: 1px dashed #cbd5f5;
  border-radius: 1rem;
  padding: 1rem;
  text-align: center;
  color: #64748b;
  font-size: 0.9rem;
}

.empty-panel span {
  display: block;
  margin-top: 0.3rem;
  font-size: 0.8rem;
  color: #94a3b8;
}

.portal-event-list a {
  text-decoration: none;
}

.event-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 1rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.event-item__content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.event-item__title {
  margin: 0;
  color: #0f172a;
  font-weight: 600;
}

.event-item__meta {
  margin: 0;
  color: #64748b;
  font-size: 0.85rem;
}

.event-item__status {
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}

.event-item__status.open {
  background: rgba(34, 187, 170, 0.15);
  color: #0f9f85;
}

.event-item__status.closed {
  background: rgba(148, 163, 184, 0.2);
  color: #475569;
}

.error {
  color: #b91c1c;
}

.muted {
  color: #94a3b8;
}

.portal-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
}

.portal-tab {
  flex: 1;
  border: 1px solid #dbeafe;
  border-radius: 999px;
  padding: 0.5rem;
  background: #f8fafc;
  color: #475569;
  font-weight: 600;
}

.portal-tab.active {
  background: linear-gradient(135deg, #0ea5e9, #22d3ee);
  color: #fff;
  box-shadow: 0 10px 20px rgba(14, 165, 233, 0.3);
  border-color: transparent;
}
.tab-panel {
  margin-top: 0.5rem;
}

.moment-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 0.75rem;
}

.moment-grid figure {
  margin: 0;
  border-radius: 1rem;
  overflow: hidden;
  background: #f1f5f9;
}

.moment-grid img {
  width: 100%;
  height: 100px;
  object-fit: cover;
  display: block;
}

.moment-grid figcaption {
  padding: 0.4rem;
  font-size: 0.85rem;
  color: #475569;
}
</style>
.portal-nav {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-bottom: 0.85rem;
}

.portal-nav__item {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 1.1rem;
  padding: 0.85rem;
  background: #f8fafc;
  display: flex;
  align-items: center;
  gap: 0.85rem;
  color: #1e293b;
  text-align: left;
  position: relative;
}

.portal-nav__item.active {
  border-color: transparent;
  background: linear-gradient(135deg, #0ea5e9, #22d3ee);
  color: #fff;
  box-shadow: 0 18px 25px rgba(14, 165, 233, 0.25);
}

.portal-nav__icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: rgba(14, 165, 233, 0.15);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #0ea5e9;
  font-size: 1.3rem;
}

.portal-nav__item.active .portal-nav__icon {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.portal-nav__text p {
  margin: 0;
  font-weight: 600;
}

.portal-nav__text small {
  color: rgba(148, 163, 184, 0.9);
}

.portal-nav__item.active .portal-nav__text small {
  color: rgba(255, 255, 255, 0.85);
}

.portal-nav__chevron {
  margin-left: auto;
  font-size: 1.2rem;
  color: rgba(148, 163, 184, 0.9);
}

.portal-nav__item.active .portal-nav__chevron {
  color: #fff;
}
