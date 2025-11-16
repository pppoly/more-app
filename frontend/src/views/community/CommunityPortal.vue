<template>
  <section class="community-portal">
    <RouterLink class="back-link" to="/">← HOME</RouterLink>

    <p v-if="loading" class="status">読み込み中…</p>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <article v-else-if="community" class="community-card">
      <header>
        <h2>{{ community.name }}</h2>
        <p class="visibility">公開設定: {{ community.visibleLevel }}</p>
        <div class="labels" v-if="community.labels.length">
          <span v-for="label in community.labels" :key="label">#{{ label }}</span>
        </div>
      </header>

      <section class="description">
        <h3>紹介</h3>
        <p>{{ getLocalizedText(community.description) }}</p>
      </section>

      <section class="events">
        <h3>最近のイベント</h3>
        <p v-if="!recentEvents.length" class="muted">公開イベントはまだありません。（暂无活动）</p>
        <ul v-else class="event-list">
          <li v-for="event in recentEvents" :key="event.id">
            <RouterLink :to="`/events/${event.id}`">
              {{ getLocalizedText(event.title) || 'イベント' }}
            </RouterLink>
            <span>{{ formatDate(event.startTime) }} · {{ event.locationText }}</span>
          </li>
        </ul>
      </section>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { fetchCommunityBySlug } from '../../api/client';
import type { CommunityPortal } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';

const route = useRoute();
const slug = computed(() => route.params.slug as string);
const community = ref<CommunityPortal | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const recentEvents = computed(() => community.value?.events ?? []);

const loadCommunity = async (value: string) => {
  if (!value) {
    error.value = 'Missing community slug';
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

const formatDate = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
</script>

<style scoped>
.community-portal {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.back-link {
  color: #2563eb;
  text-decoration: none;
}

.status {
  margin: 0.5rem 0;
}

.community-card {
  background: #fff;
  padding: 1.5rem;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
}

.labels {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.labels span {
  background: #eef2ff;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.85rem;
}

.description,
.events {
  margin-top: 1.5rem;
}

.event-list {
  list-style: none;
  padding: 0;
}

.event-list li {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.75rem;
}

.event-list span {
  color: #475569;
  font-size: 0.9rem;
}

.error {
  color: #b91c1c;
}

.muted {
  color: #94a3b8;
}
</style>
