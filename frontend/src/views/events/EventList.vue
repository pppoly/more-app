<template>
  <section class="events-mobile">
    <header class="app-bar">
      <img :src="brandLogo" alt="More" class="logo-circle" />
    </header>

    <div class="search-section">
      <div class="search-box">
        <span class="icon">🔍</span>
        <input v-model="searchTerm" type="search" placeholder="イベント / コミュニティを検索" />
      </div>
      <div class="chip-container">
        <p class="chip-label">タグ</p>
        <div class="chip-row">
          <button
            v-for="chip in categories"
            :key="chip.value"
            :class="['chip', { active: selectedCategory === chip.value }]"
            type="button"
            @click="selectedCategory = chip.value"
          >
            {{ chip.label }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="loading" class="status">読み込み中...</p>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <div v-else class="list-wrapper">
      <div v-if="!filteredEvents.length" class="empty-state">
        現在公開中のイベントはありません。
      </div>
      <ul v-else class="event-list">
        <li v-for="event in filteredEvents" :key="event.id" class="event-card" @click="goDetail(event.id)">
          <div class="event-card__cover" :style="coverImageStyle(event)">
            <span v-if="!event.coverImageUrl" class="event-card__fallback">{{ coverInitial(event) }}</span>
          </div>
          <div class="event-card__body">
            <p class="event-card__title">{{ titleFor(event) }}</p>
            <p class="event-card__meta">{{ formatDate(event.startTime) }}</p>
            <p class="event-card__location">{{ event.locationText }}</p>
            <div class="event-card__footer">
              <span class="status-pill" :class="statusBadge(event).class">{{ statusBadge(event).text }}</span>
              <span class="capacity">{{ participationLabel }}</span>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <nav class="tab-bar">
      <RouterLink to="/events" class="tab-item active">イベント</RouterLink>
      <RouterLink to="/community/musashino-kids" class="tab-item">コミュニティ</RouterLink>
      <RouterLink :to="{ name: 'console-home' }" class="tab-item">コンソール</RouterLink>
    </nav>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fetchEvents } from '../../api/client';
import type { EventSummary } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { getEventStatus } from '../../utils/eventStatus';
import { EVENT_CATEGORY_OPTIONS, normalizeEventCategory } from '../../utils/eventCategory';
import brandLogoUrl from '../../assets/images/logo1.svg';

const router = useRouter();
const brandLogo = brandLogoUrl;

const events = ref<EventSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const searchTerm = ref('');
const categories = [
  { label: '全部', value: 'all' },
  ...EVENT_CATEGORY_OPTIONS.map((cat) => ({ label: cat.label, value: cat.value })),
];
const selectedCategory = ref('all');

const loadEvents = async () => {
  loading.value = true;
  error.value = null;
  try {
    events.value = await fetchEvents();
  } catch (err) {
    error.value =
      err instanceof Error ? 'イベントの読み込みに失敗しました。時間をおいて再試行してください。' : 'イベントの読み込みに失敗しました。時間をおいて再試行してください。';
  } finally {
    loading.value = false;
  }
};

const filteredEvents = computed(() => {
  const keyword = searchTerm.value.toLowerCase();
  return events.value.filter((event) => {
    const category = normalizeEventCategory(event.category);
    const matchesCategory = selectedCategory.value === 'all' || category === selectedCategory.value;
    const title = titleFor(event).toLowerCase();
    const matchesKeyword = !keyword || title.includes(keyword) || event.locationText.toLowerCase().includes(keyword);
    return matchesCategory && matchesKeyword;
  });
});

const titleFor = (event: EventSummary) => getLocalizedText(event.title);

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });

const statusBadge = (event: EventSummary) => {
  const { state, label } = getEventStatus(event);
  return { text: label, class: state === 'open' ? 'open' : 'closed' };
};

const coverInitial = (event: EventSummary) => (event.community.name?.charAt(0) ?? 'M').toUpperCase();
const coverImageStyle = (event: EventSummary) => {
  if (event.coverImageUrl) {
    return { backgroundImage: `url(${resolveAssetUrl(event.coverImageUrl)})` };
  }
  return {
    background: `linear-gradient(135deg, var(--color-primary), #4cd964)`,
  };
};

const participationLabel = '参加枠: チェック中';

const goDetail = (eventId: string) => {
  router.push(`/events/${eventId}`);
};

onMounted(loadEvents);
</script>

<style scoped>
.events-mobile {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  padding-bottom: 64px;
}

.app-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.logo-circle {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 0;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.5);
  display: inline-block;
  object-fit: contain;
  box-shadow: none;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #d6f5db;
  color: var(--color-primary);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-chip {
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.85rem;
}

.search-section {
  padding: 0.75rem 1rem 0.25rem;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #f1f3f4;
  border-radius: 999px;
  padding: 0.4rem 0.9rem;
  margin-bottom: 0.6rem;
}

.search-box input {
  border: none;
  flex: 1;
  background: transparent;
  font-size: 0.95rem;
}

.search-box input:focus {
  outline: none;
}

.chip-container {
  margin-top: 0.5rem;
  border-radius: 16px;
  padding: 0.6rem;
  background: rgba(37, 99, 235, 0.08);
  border: 1px solid var(--color-primary);
}

.chip-label {
  margin: 0 0 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-primary);
}

.chip-row {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}

.chip {
  border: 1px solid var(--color-border);
  background: #fff;
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
  font-size: 0.85rem;
  color: var(--color-subtext);
}

.chip.active {
  background: var(--color-primary);
  border: none;
  color: #fff;
}

.list-wrapper {
  flex: 1;
  padding: 0 1rem;
}

.event-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.event-card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(3, 7, 18, 0.08);
  overflow: hidden;
  cursor: pointer;
}

.event-card__cover {
  width: 100%;
  aspect-ratio: 16 / 9;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  display: flex;
  align-items: center;
  justify-content: center;
}

.event-card__fallback {
  font-size: 2.2rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.8);
}

.event-card__body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0 1rem 1rem;
}

.event-card__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.event-card__meta {
  margin: 0;
  color: var(--color-subtext);
  font-size: 0.85rem;
}

.event-card__location {
  margin: 0;
  color: #0f172a;
  font-size: 0.9rem;
}

.event-card__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.25rem;
}

.status-pill {
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.status-pill.open {
  background: rgba(0, 185, 0, 0.15);
  color: var(--color-primary);
}

.status-pill.closed {
  background: #ffe9e9;
  color: #c53030;
}

.capacity {
  font-size: 0.75rem;
  color: var(--color-subtext);
}

.empty-state {
  background: #fff;
  border-radius: 12px;
  padding: 1.25rem;
  border: 1px dashed var(--color-border);
  color: var(--color-subtext);
}

.tab-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  background: #fff;
  border-top: 1px solid var(--color-border);
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 0.65rem 0;
  color: var(--color-subtext);
  font-weight: 600;
}

.tab-item.active {
  color: var(--color-primary);
}

.status {
  padding: 0 1rem;
}

.error {
  color: #c53030;
}
</style>
