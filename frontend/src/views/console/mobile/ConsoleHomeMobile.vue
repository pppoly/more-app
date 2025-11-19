<template>
  <div class="console-home">
    <section class="hero-card">
      <div class="hero-chip">
        <span class="i-lucide-layout-dashboard text-sm"></span>
        Console
      </div>
      <p class="hero-subtitle">運営コミュニティ</p>
      <h1 class="hero-title">{{ communityName || '未選択のコミュニティ' }}</h1>
      <p class="hero-role">{{ hasCommunity ? `役割: ${roleLabel}` : 'まずはコミュニティを登録しましょう' }}</p>
      <button
        v-if="hasCommunity"
        class="hero-switch"
        type="button"
        @click="openCommunityPicker"
      >
        <span class="i-lucide-building-2"></span>
        コミュニティを切り替える
      </button>
      <button
        v-else
        class="hero-switch hero-switch--primary"
        type="button"
        @click="goCreateCommunity"
      >
        <span class="i-lucide-sparkles"></span>
        コミュニティを作成
      </button>
      <div class="hero-stats">
        <div class="hero-stat">
          <p>今月の収入</p>
          <strong>{{ hasCommunity ? stats.monthRevenueText : '---' }}</strong>
        </div>
        <div class="hero-stat">
          <p>今月のイベント</p>
          <strong>{{ hasCommunity ? stats.eventCount : '--' }}</strong>
        </div>
        <div class="hero-stat">
          <p>申込数</p>
          <strong>{{ hasCommunity ? stats.registrationCount : '--' }}</strong>
        </div>
      </div>
    </section>

    <section class="action-grid">
      <button class="action-card" type="button" @click="goCreateCommunity">
        <span class="action-icon i-lucide-sparkles"></span>
        <div>
          <p class="action-title">コミュニティ作成</p>
          <p class="action-desc">新しいコミュニティを登録</p>
        </div>
      </button>
      <button
        class="action-card"
        type="button"
        :class="{ 'is-disabled': !hasCommunity }"
        @click="createEvent"
      >
        <span class="action-icon i-lucide-plus"></span>
        <div>
          <p class="action-title">新しいイベント</p>
          <p class="action-desc">イベントを作成して公開</p>
        </div>
      </button>
      <button
        class="action-card"
        type="button"
        :class="{ 'is-disabled': !hasCommunity }"
        @click="goAllEvents"
      >
        <span class="action-icon i-lucide-calendar-search"></span>
        <div>
          <p class="action-title">イベント管理</p>
          <p class="action-desc">登録状況と参加者を確認</p>
        </div>
      </button>
      <button
        class="action-card"
        type="button"
        :class="{ 'is-disabled': !hasCommunity }"
        @click="goPayout"
      >
        <span class="action-icon i-lucide-piggy-bank"></span>
        <div>
          <p class="action-title">収益と入金</p>
          <p class="action-desc">入金設定・請求を確認</p>
        </div>
      </button>
      <button
        class="action-card"
        type="button"
        :class="{ 'is-disabled': !hasCommunity }"
        @click="goSubscription"
      >
        <span class="action-icon i-lucide-settings"></span>
        <div>
          <p class="action-title">プランと設定</p>
          <p class="action-desc">プラン変更や通知設定</p>
        </div>
      </button>
      <button
        class="action-card"
        type="button"
        :class="{ 'is-disabled': !hasCommunity }"
        @click="goCommunitySettings"
      >
        <span class="action-icon i-lucide-pencil"></span>
        <div>
          <p class="action-title">社群情報を編集</p>
          <p class="action-desc">紹介文・タグ・公開設定を更新</p>
        </div>
      </button>
      <button
        class="action-card"
        type="button"
        :class="{ 'is-disabled': !hasCommunity }"
        @click="goPublicPortal"
      >
        <span class="action-icon i-lucide-external-link"></span>
        <div>
          <p class="action-title">公開ページを見る</p>
          <p class="action-desc">社群ポータルを確認（ユーザー側表示）</p>
        </div>
      </button>
    </section>

    <section class="events-section">
      <div class="section-head">
        <div>
          <p class="section-label">イベントの進行状況</p>
          <h2>最新イベント</h2>
        </div>
        <button class="link-button" type="button" @click="goAllEvents">一覧を見る</button>
      </div>
      <div class="event-cards">
        <button
          v-for="item in displayEvents"
          :key="item.id"
          class="event-card"
          type="button"
          @click="openManage(item.id)"
        >
          <div class="event-status" :class="statusBadgeClass(item.status)">
            {{ statusLabel(item.status) }}
          </div>
          <p class="event-date">{{ item.dateTimeText }}</p>
          <h3>{{ item.title }}</h3>
          <p class="event-meta">{{ item.entrySummary }}</p>
        </button>
        <div v-if="!displayEvents.length" class="event-empty">
          まだイベントがありません。新しい企画を始めましょう。
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import { fetchConsoleCommunityEvents } from '../../../api/client';
import type { ConsoleEventSummary } from '../../../types/api';
import { getLocalizedText } from '../../../utils/i18nContent';

const router = useRouter();
const communityStore = useConsoleCommunityStore();
const events = ref<ConsoleEventSummary[]>([]);
const loading = ref(false);

const community = computed(() => communityStore.getActiveCommunity());
const communityName = computed(() => community.value?.name ?? '');
const communityId = computed(() => communityStore.activeCommunityId.value);
const hasCommunity = computed(() => Boolean(communityId.value));
const roleLabel = computed(() => {
  const role = community.value?.role;
  switch (role) {
    case 'owner':
      return '主催者';
    case 'admin':
      return '管理者';
    default:
      return 'メンバー';
  }
});

const stats = computed(() => ({
  monthRevenueText: '¥0',
  eventCount: events.value.length,
  registrationCount: '--',
}));

const displayEvents = computed(() =>
  events.value.slice(0, 5).map((event) => ({
    id: event.id,
    title: getLocalizedText(event.title),
    status: event.status,
    dateTimeText: formatDate(event.startTime, event.endTime),
    entrySummary: event.visibility === 'public' ? '公開イベント' : '限定公開',
    coverUrl: 'https://placehold.co/120x120?text=Event',
  })),
);

const loadEvents = async () => {
  if (!communityId.value) return;
  loading.value = true;
  try {
    events.value = await fetchConsoleCommunityEvents(communityId.value);
  } catch (err) {
    console.error('Failed to load console events', err);
  } finally {
    loading.value = false;
  }
};

watch(communityId, () => {
  if (communityId.value) {
    loadEvents();
  }
});

const openCommunityPicker = () => {
  window.dispatchEvent(new CustomEvent('console:open-community-picker'));
};

const goCreateCommunity = () => {
  router.push({ name: 'ConsoleMobileCommunityCreate' });
};

const goPayout = () => {
  router.push({ name: 'ConsoleMobilePayout' });
};

const goSubscription = () => {
  router.push({ name: 'ConsoleMobileSubscription' });
};

const goCommunitySettings = () => {
  if (!communityId.value) return;
  router.push({ name: 'ConsoleMobileCommunitySettings', params: { communityId: communityId.value } });
};

const goPublicPortal = () => {
  if (!community.value?.slug) return;
  router.push({ name: 'community-portal', params: { slug: community.value.slug } });
};

const goAllEvents = () => {
  if (!communityId.value) return;
  router.push({ name: 'ConsoleMobileCommunityEvents', params: { communityId: communityId.value } });
};

const openManage = (eventId: string) => {
  router.push({ name: 'ConsoleMobileEventManage', params: { eventId } });
};

const createEvent = () => {
  if (!communityId.value) return;
  router.push({ name: 'ConsoleMobileEventCreate', params: { communityId: communityId.value } });
};

const formatDate = (start: string, end?: string) => {
  const startText = new Date(start).toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (!end) return startText;
  const endText = new Date(end).toLocaleString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${startText}〜${endText}`;
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'open':
      return '受付中';
    case 'closed':
      return '終了';
    default:
      return '下書き';
  }
};

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'open':
      return 'bg-emerald-100 text-emerald-700';
    case 'closed':
      return 'bg-slate-100 text-slate-500';
    default:
      return 'bg-amber-100 text-amber-700';
  }
};

onMounted(async () => {
  await communityStore.loadCommunities();
  if (!communityId.value) {
    communityStore.ensureActiveCommunity();
  }
  if (communityId.value) {
    loadEvents();
  }
});
</script>

<style scoped>
.console-home {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 4px) 4px calc(60px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, #f5fbff 0%, #eef2f7 40%, #f7f9fb 100%);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hero-card {
  position: relative;
  border-radius: 24px;
  padding: 20px;
  background: linear-gradient(135deg, #0090d9, #22bbaa);
  color: #fff;
  box-shadow: 0 25px 60px rgba(0, 144, 217, 0.35);
  overflow: hidden;
}

.hero-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at top right, rgba(255, 255, 255, 0.4), transparent 40%);
  pointer-events: none;
}

.hero-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.hero-title {
  margin: 8px 0 4px;
  font-size: 20px;
  font-weight: 700;
}

.hero-subtitle,
.hero-role {
  margin: 0;
  font-size: 12px;
  opacity: 0.85;
}

.hero-switch {
  margin-top: 12px;
  border: none;
  padding: 10px 12px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.2);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.hero-switch--primary {
  background: rgba(255, 255, 255, 0.2);
  color: #003443;
}

.hero-stats {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.hero-stat {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 18px;
  padding: 10px;
  font-size: 12px;
  text-align: left;
}

.hero-stat p {
  margin: 0;
  opacity: 0.8;
}

.hero-stat strong {
  display: block;
  margin-top: 4px;
  font-size: 15px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.action-card {
  border: none;
  border-radius: 18px;
  background: #fff;
  padding: 12px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  text-align: left;
  box-shadow: 0 15px 30px rgba(15, 23, 42, 0.08);
}

.action-icon {
  display: inline-flex;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: rgba(0, 144, 217, 0.12);
  color: #0090d9;
  align-items: center;
  justify-content: center;
}

.action-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--m-color-text-primary);
}

.action-desc {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--m-color-text-tertiary);
}

.action-card.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}

.events-section {
  background: #fff;
  border-radius: 22px;
  padding: 18px;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-label {
  margin: 0;
  font-size: 11px;
  color: var(--m-color-text-tertiary);
}

.section-head h2 {
  margin: 4px 0 0;
  font-size: 16px;
  font-weight: 700;
}

.link-button {
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: #0090d9;
}

.event-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.event-card {
  border: none;
  border-radius: 18px;
  padding: 14px;
  background: rgba(247, 249, 251, 0.8);
  text-align: left;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.03);
}

.event-status {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 8px;
}

.event-date {
  margin: 0;
  font-size: 12px;
  color: var(--m-color-text-tertiary);
}

.event-card h3 {
  margin: 4px 0 2px;
  font-size: 15px;
  font-weight: 600;
  color: var(--m-color-text-primary);
}

.event-meta {
  margin: 0;
  font-size: 12px;
  color: var(--m-color-text-secondary);
}

.event-empty {
  padding: 24px;
  text-align: center;
  font-size: 12px;
  color: var(--m-color-text-tertiary);
}
</style>
