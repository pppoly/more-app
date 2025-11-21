<template>
  <section class="console-feed" v-if="community">
    <div class="toolbar">
      <div>
        <p class="eyebrow">社群 · {{ community.slug }}</p>
        <h2>{{ community.name }}</h2>
        <p class="sub">集中管理活动，随时创建和更新。</p>
      </div>
      <div class="toolbar-actions">
        <RouterLink
          :to="{ name: 'console-community-finance', params: { communityId: community.id } }"
          class="ghost"
        >
          收款设置
        </RouterLink>
        <RouterLink
          :to="{ name: 'console-event-create', params: { communityId: community.id } }"
          class="primary"
        >
          ＋ 新建活动
        </RouterLink>
      </div>
    </div>

    <p v-if="loading" class="status">活动加载中...</p>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <div v-else class="body">
      <div v-if="!events.length" class="empty-state">
        还没有活动，点击右上“新建活动”开始。
      </div>
      <ul v-else class="event-grid">
        <li v-for="event in events" :key="event.id" class="event-card">
          <div class="event-thumb" :style="coverStyle(event)">
            <span class="badge" :class="event.status === 'open' ? 'open' : 'closed'">
              {{ event.status === 'open' ? '报名中' : '已结束' }}
            </span>
          </div>
          <div class="event-body">
            <p class="event-date">{{ formatDate(event.startTime) }}</p>
            <h3 class="event-title">{{ getTitle(event) }}</h3>
            <div class="event-actions">
              <RouterLink :to="{ name: 'console-event-edit', params: { eventId: event.id } }">编辑</RouterLink>
              <RouterLink :to="{ name: 'event-detail', params: { eventId: event.id } }">预览</RouterLink>
              <RouterLink :to="{ name: 'console-event-registrations', params: { eventId: event.id } }">报名</RouterLink>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { fetchConsoleCommunity, fetchConsoleCommunityEvents } from '../../api/client';
import type { ConsoleCommunityDetail, ConsoleEventSummary } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import { resolveAssetUrl } from '../../utils/assetUrl';

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
const coverImageUrl = (event: ConsoleEventSummary) =>
  event.coverImageUrl ? resolveAssetUrl(event.coverImageUrl) : null;
const coverStyle = (event: ConsoleEventSummary) => {
  const url = coverImageUrl(event);
  if (url) {
    return {
      backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 100%), url(${url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return {
    background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
  };
};

onMounted(load);
</script>

<style scoped>
.console-feed {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 12px 25px rgba(15, 23, 42, 0.06);
  flex-wrap: wrap;
  gap: 12px;
}

.eyebrow {
  margin: 0;
  color: #64748b;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
}

.toolbar h2 {
  margin: 2px 0 4px;
  font-size: 22px;
}

.sub {
  margin: 0;
  color: #475569;
}

.toolbar-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.primary,
.ghost {
  border-radius: 10px;
  padding: 8px 12px;
  font-weight: 700;
  text-decoration: none;
  border: 1px solid transparent;
}

.primary {
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.2);
}

.ghost {
  background: #fff;
  border-color: #e2e8f0;
  color: #0f172a;
}

.body {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
}

.status {
  color: #94a3b8;
}

.error {
  color: #c53030;
}

.empty-state {
  background: rgba(226, 232, 240, 0.4);
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  padding: 1rem;
  color: #64748b;
  text-align: center;
}

.event-grid {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.event-card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
}

.event-thumb {
  height: 140px;
  position: relative;
  background: linear-gradient(135deg, #0ea5e9, #22c55e);
}

.badge {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
}

.badge.open {
  background: #22c55e;
}

.badge.closed {
  background: #9ca3af;
}

.event-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.event-date {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.event-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.event-actions {
  display: flex;
  gap: 10px;
  font-size: 13px;
  flex-wrap: wrap;
}
</style>
