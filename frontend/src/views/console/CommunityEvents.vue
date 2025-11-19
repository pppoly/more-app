<template>
  <section class="console-feed" v-if="community">
    <header class="feed-header">
      <div class="title-block">
        <p class="label">{{ community.slug }}</p>
        <h2>{{ community.name }}</h2>
      </div>
      <div class="header-actions">
        <RouterLink
          :to="{ name: 'console-community-finance', params: { communityId: community.id } }"
          class="link-btn"
        >
          決済/プラン
        </RouterLink>
        <RouterLink
          :to="{ name: 'console-event-create', params: { communityId: community.id } }"
          class="fab small"
        >
          ＋ 新規
        </RouterLink>
      </div>
    </header>

    <p v-if="loading" class="status">イベント読み込み中...</p>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <div v-else>
      <div v-if="!events.length" class="empty-state">
        まだイベントがありません。右下のボタンから作成しましょう。
      </div>
      <ul v-else class="chat-feed">
        <li v-for="event in events" :key="event.id" class="feed-card">
          <div class="thumb">{{ coverInitial(event) }}</div>
          <div class="feed-info">
            <p class="feed-title">{{ getTitle(event) }}</p>
            <p class="feed-sub">{{ formatDate(event.startTime) }} · {{ event.status }}</p>
            <div class="feed-meta">
              <span class="status-pill" :class="event.status === 'open' ? 'open' : 'closed'">
                {{ event.status === 'open' ? '受付中' : '終了' }}
              </span>
              <div class="actions">
                <RouterLink :to="{ name: 'console-event-edit', params: { eventId: event.id } }">
                  編集
                </RouterLink>
                <RouterLink :to="{ name: 'console-event-registrations', params: { eventId: event.id } }">
                  参加者
                </RouterLink>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <RouterLink
      :to="{ name: 'console-event-create', params: { communityId: community.id } }"
      class="fab"
    >
      ＋ 新しいイベント
    </RouterLink>
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
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
  });
const coverInitial = (event: ConsoleEventSummary) => getTitle(event).charAt(0).toUpperCase();

onMounted(load);
</script>

<style scoped>
.console-feed {
  position: relative;
  padding-bottom: 80px;
}

.feed-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  gap: 1rem;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.link-btn {
  border: 1px solid var(--color-border);
  padding: 0.4rem 0.8rem;
  border-radius: 999px;
  font-size: 0.9rem;
  color: var(--color-primary);
}

.title-block .label {
  margin: 0;
  color: var(--color-subtext);
  font-size: 0.85rem;
}

.title-block h2 {
  margin: 0;
  font-size: 1.3rem;
}

.chat-feed {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.feed-card {
  display: flex;
  gap: 0.75rem;
  background: #fff;
  padding: 0.75rem;
  border-radius: 14px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.05);
}

.thumb {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--color-primary), #6dda8b);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.3rem;
}

.feed-info {
  flex: 1;
}

.feed-title {
  margin: 0;
  font-weight: 600;
}

.feed-sub {
  margin: 0.2rem 0;
  color: var(--color-subtext);
  font-size: 0.85rem;
}

.feed-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-pill {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
}

.status-pill.open {
  background: rgba(0, 185, 0, 0.15);
  color: var(--color-primary);
}

.status-pill.closed {
  background: #ffe1e1;
  color: #c53030;
}

.actions a {
  margin-left: 0.5rem;
  color: var(--color-primary);
}

.status {
  color: var(--color-subtext);
}

.error {
  color: #c53030;
}

.empty-state {
  background: #fff;
  border: 1px dashed var(--color-border);
  border-radius: 12px;
  padding: 1rem;
  color: var(--color-subtext);
}

.fab {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  background: var(--color-primary);
  color: #fff;
  border-radius: 999px;
  padding: 0.6rem 1.2rem;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.2);
}

.fab.small {
  position: static;
  box-shadow: none;
}
</style>
