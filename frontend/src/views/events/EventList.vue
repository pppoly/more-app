<template>
  <section class="events-page">
    <header>
      <h2>MORE App イベント一覧</h2>
      <p class="subtext">公開中のイベントを確認して、気になるものをチェックしましょう。</p>
    </header>

    <p v-if="loading" class="status">読み込み中…</p>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <template v-else>
      <div v-if="!events.length" class="empty">
        <p>現在公開中のイベントはありません。（暂无活动）</p>
      </div>
      <ul v-else class="event-list">
        <li v-for="event in events" :key="event.id" class="event-card">
          <RouterLink :to="`/events/${event.id}`">
            <h3>{{ titleFor(event) }}</h3>
          </RouterLink>
          <div class="meta-row">
            <span class="badge" :class="statusBadge(event).class">{{ statusBadge(event).text }}</span>
            <span class="price">{{ priceLabel(event) }}</span>
          </div>
          <p class="community">{{ event.community.name }}</p>
          <p class="time">{{ formatDate(event.startTime) }}</p>
          <p class="location">{{ event.locationText }}</p>
        </li>
      </ul>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { fetchEvents } from '../../api/client';
import type { EventSummary } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';

const events = ref<EventSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const loadEvents = async () => {
  loading.value = true;
  error.value = null;
  try {
    events.value = await fetchEvents();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load events';
  } finally {
    loading.value = false;
  }
};

const titleFor = (event: EventSummary) => getLocalizedText(event.title);

const formatDate = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const statusBadge = (event: EventSummary) => {
  const now = new Date();
  const start = new Date(event.startTime);
  if (event.status === 'open' && start > now) {
    return { text: '受付中', class: 'open' };
  }
  return { text: '終了', class: 'closed' };
};

const priceLabel = (event: EventSummary) => {
  if (!event.priceRange || event.priceRange.max <= 0) {
    return '参加費: 無料';
  }
  const { min, max } = event.priceRange;
  if (min === max) {
    return `参加費: ¥${min.toLocaleString()}`;
  }
  return `参加費: ¥${min.toLocaleString()}〜`;
};

onMounted(loadEvents);
</script>

<style scoped>
.events-page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

header h2 {
  margin: 0;
}

.subtext {
  color: #475569;
  margin: 0.2rem 0 0;
}

.status {
  margin: 0.5rem 0;
}

.empty {
  border: 1px dashed #cbd5f5;
  padding: 1rem;
  border-radius: 0.5rem;
  color: #475569;
  background: #f8fafc;
}

.event-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.event-card {
  background: #fff;
  padding: 1rem;
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

.event-card h3 {
  margin: 0 0 0.4rem;
  color: #1e293b;
}

.meta-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.4rem;
}

.badge {
  padding: 0.1rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge.open {
  background: #dcfce7;
  color: #15803d;
}

.badge.closed {
  background: #fee2e2;
  color: #b91c1c;
}

.price {
  font-size: 0.85rem;
  color: #475569;
}

.community {
  color: #0f172a;
  font-weight: 600;
  margin: 0.2rem 0;
}

.time,
.location {
  margin: 0.2rem 0;
  color: #475569;
}

.error {
  color: #b91c1c;
}

.muted {
  color: #94a3b8;
}
</style>
