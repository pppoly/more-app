<template>
  <section class="console-section" v-if="community">
    <header class="section-header">
      <div>
        <h2>{{ community.name }}</h2>
        <p class="slug">{{ community.slug }}</p>
      </div>
      <RouterLink :to="`/console/communities/${community.id}/events/create`" class="primary">
        ＋ 新規イベント
      </RouterLink>
    </header>

    <p v-if="loading" class="status">イベント読み込み中…</p>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <template v-else>
      <table class="event-table" v-if="events.length">
        <thead>
          <tr>
            <th>タイトル</th>
            <th>開始</th>
            <th>状態</th>
            <th>公開範囲</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="event in events" :key="event.id">
            <td>{{ getTitle(event) }}</td>
            <td>{{ formatDate(event.startTime) }}</td>
            <td>{{ event.status }}</td>
            <td>{{ event.visibility }}</td>
            <td class="actions">
              <RouterLink :to="`/console/events/${event.id}/edit`">編集</RouterLink>
              <RouterLink :to="`/console/events/${event.id}/registrations`">参加者</RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">このコミュニティにまだイベントがありません。</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { fetchConsoleCommunity, fetchConsoleCommunityEvents } from '../../api/client';
import type { ConsoleCommunityDetail, ConsoleEventSummary } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';

const route = useRoute();
const communityId = route.params.communityId as string;

const community = ref<ConsoleCommunityDetail | null>(null);
const events = ref<ConsoleEventSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    community.value = await fetchConsoleCommunity(communityId);
    events.value = await fetchConsoleCommunityEvents(communityId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '読み込みに失敗しました';
  } finally {
    loading.value = false;
  }
};

const getTitle = (event: ConsoleEventSummary) => getLocalizedText(event.title);

const formatDate = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

onMounted(load);
</script>

<style scoped>
.console-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.slug {
  color: #94a3b8;
}

.event-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 0.75rem;
  overflow: hidden;
}

.event-table th,
.event-table td {
  padding: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}

.event-table tbody tr:last-child td {
  border-bottom: none;
}

.actions a {
  margin-right: 0.5rem;
  color: #2563eb;
  text-decoration: none;
}

.status {
  color: #475569;
}

.error {
  color: #b91c1c;
}

.muted {
  color: #94a3b8;
}

.primary {
  padding: 0.4rem 0.9rem;
  border-radius: 0.5rem;
  background: #2563eb;
  color: white;
  text-decoration: none;
}
</style>
