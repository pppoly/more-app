<template>
  <div class="console-home">
    <section class="hero-card">
      <div class="hero-heading">
        <img :src="communityAvatar" alt="avatar" class="hero-avatar" @click="goCommunitySettings" />
        <div class="hero-heading-text" @click="goCommunitySettings">
          <h1 class="hero-title">{{ communityName || '未選択のコミュニティ' }}</h1>
          <p class="hero-role">{{ hasCommunity ? `役割: ${roleLabel}` : 'まずはコミュニティを登録' }}</p>
        </div>
        <button
          v-if="hasCommunity"
          class="hero-switch inline-switch"
          type="button"
          @click="openCommunityPicker"
        >
          切り替え
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
      </div>
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
        <div class="action-entry">
          <div class="action-icon">
            <img :src="defaultActionIcon" alt="" />
          </div>
          <div>
            <p class="action-title">コミュニティ作成</p>
            <p class="action-desc">新しいコミュニティを登録</p>
          </div>
        </div>
      </button>
      <button
        class="action-card"
        type="button"
        :class="{ 'is-disabled': !hasCommunity }"
        @click="createEvent"
      >
        <div class="action-entry">
          <div class="action-icon">
            <img :src="defaultActionIcon" alt="" />
          </div>
          <div>
            <p class="action-title">新しいイベント</p>
            <p class="action-desc">イベントを作成して公開</p>
          </div>
        </div>
      </button>
      <button
        class="action-card"
        type="button"
        :class="{ 'is-disabled': !hasCommunity }"
        @click="goEventAssistant"
      >
        <div class="action-entry">
          <div class="action-icon">
            <img :src="defaultActionIcon" alt="" />
          </div>
          <div>
            <p class="action-title">AI イベント助手</p>
            <p class="action-desc">SOCIALMORE 憲法で企画</p>
          </div>
        </div>
      </button>
      <button
        class="action-card"
        type="button"
        :class="{ 'is-disabled': !hasCommunity }"
        @click="goAllEvents"
      >
        <div class="action-entry">
          <div class="action-icon">
            <img :src="defaultActionIcon" alt="" />
          </div>
          <div>
            <p class="action-title">イベント管理</p>
            <p class="action-desc">登録状況と参加者を確認</p>
          </div>
        </div>
      </button>
      <button
        class="action-card"
        type="button"
        :class="{ 'is-disabled': !hasCommunity }"
        @click="goPayout"
      >
        <div class="action-entry">
          <div class="action-icon">
            <img :src="defaultActionIcon" alt="" />
          </div>
          <div>
            <p class="action-title">収益と入金</p>
            <p class="action-desc">入金設定・請求を確認</p>
          </div>
        </div>
      </button>
      <button
        class="action-card"
        type="button"
        :class="{ 'is-disabled': !hasCommunity }"
        @click="goSubscription"
      >
        <div class="action-entry">
          <div class="action-icon">
            <img :src="defaultActionIcon" alt="" />
          </div>
          <div>
            <p class="action-title">プランと設定</p>
            <p class="action-desc">プラン変更や通知設定</p>
          </div>
        </div>
      </button>
      <button
        class="action-card"
        type="button"
        :class="{ 'is-disabled': !hasCommunity }"
        @click="goPublicPortal"
      >
        <div class="action-entry">
          <div class="action-icon">
            <img :src="defaultActionIcon" alt="" />
          </div>
          <div>
            <p class="action-title">公開ページを見る</p>
            <p class="action-desc">社群ポータルを確認（ユーザー側表示）</p>
          </div>
        </div>
      </button>
      <button
        class="action-card"
        type="button"
        :class="{ 'is-disabled': !hasCommunity }"
        @click="goTicketScanner"
      >
        <div class="action-entry">
          <div class="action-icon">
            <img :src="defaultActionIcon" alt="" />
          </div>
          <div>
            <p class="action-title">验票扫码</p>
            <p class="action-desc">ストアフロントでQRを読み取る</p>
          </div>
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

    <div v-if="showCommunityPicker" class="picker-overlay" @click.self="closeCommunityPicker">
      <div class="picker-sheet">
        <header class="picker-head">
          <p class="picker-title">社群を切り替え</p>
          <button type="button" class="picker-close" @click="closeCommunityPicker">
            <span class="i-lucide-x"></span>
          </button>
        </header>
        <div class="picker-list">
          <div v-if="pickerLoading" class="picker-empty">読み込み中…</div>
          <template v-else>
            <button
              v-for="item in managedCommunities"
              :key="item.id"
              class="picker-item"
              :class="{ 'is-active': item.id === activeCommunityId }"
              type="button"
              @click="selectCommunity(item.id)"
            >
              <div>
                <p class="picker-name">{{ item.name }}</p>
                <p class="picker-slug">@{{ item.slug }}</p>
              </div>
              <span v-if="item.id === activeCommunityId" class="i-lucide-check"></span>
            </button>
            <p v-if="!managedCommunities.length" class="picker-empty">まだ社群がありません。</p>
            <RouterLink class="picker-add" :to="{ name: 'ConsoleMobileCommunityCreate' }" @click="closeCommunityPicker">
              <span class="i-lucide-plus"></span>
              新しい社群を登録
            </RouterLink>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import { fetchConsoleCommunity, fetchConsoleCommunityEvents } from '../../../api/client';
import type { ConsoleCommunityDetail, ConsoleEventSummary } from '../../../types/api';
import { getLocalizedText } from '../../../utils/i18nContent';
import { resolveAssetUrl } from '../../../utils/assetUrl';

const router = useRouter();
const communityStore = useConsoleCommunityStore();
const events = ref<ConsoleEventSummary[]>([]);
const loading = ref(false);
const showCommunityPicker = ref(false);
const pickerLoading = ref(false);
const heroLogoUrl = ref<string | null>(null);

const community = computed(() => communityStore.getActiveCommunity());
const managedCommunities = computed(() => communityStore.communities.value);
const activeCommunityId = computed(() => communityStore.activeCommunityId.value);
const communityName = computed(() => community.value?.name ?? '');
const communityId = computed(() => communityStore.activeCommunityId.value);
const hasCommunity = computed(() => Boolean(communityId.value));
const communityAvatar = computed(() => {
  if (heroLogoUrl.value) {
    return heroLogoUrl.value;
  }
  if (community.value?.coverImageUrl) {
    return resolveAssetUrl(community.value.coverImageUrl);
  }
  return 'https://raw.githubusercontent.com/moreard/dev-assets/main/socialmore/default-community.png';
});

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
const defaultActionIcon =
  'https://raw.githubusercontent.com/moreard/dev-assets/main/socialmore/icon-action-default.png';
const defaultEventCover =
  'https://raw.githubusercontent.com/moreard/dev-assets/main/socialmore/default-event.png';

const displayEvents = computed(() =>
  events.value.slice(0, 5).map((event) => ({
    id: event.id,
    title: getLocalizedText(event.title),
    status: event.status,
    dateTimeText: formatDate(event.startTime, event.endTime),
    entrySummary: event.visibility === 'public' ? '公開イベント' : '限定公開',
    coverUrl: event.coverImageUrl ? resolveAssetUrl(event.coverImageUrl) : defaultEventCover,
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

const openCommunityPicker = async () => {
  showCommunityPicker.value = true;
  if (!communityStore.loaded.value && !communityStore.loading.value) {
    pickerLoading.value = true;
    await communityStore.loadCommunities(true);
    pickerLoading.value = false;
  }
};

const selectCommunity = (id: string) => {
  communityStore.setActiveCommunity(id);
  showCommunityPicker.value = false;
  loadActiveCommunityDetail();
};

const closeCommunityPicker = () => {
  showCommunityPicker.value = false;
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

const goTicketScanner = () => {
  router.push({ name: 'ConsoleTicketScanner' });
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
  router.push({ name: 'ConsoleMobileEventForm', params: { communityId: communityId.value } });
};

const goEventAssistant = () => {
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
    loadActiveCommunityDetail();
  }
});

watch(
  () => communityId.value,
  (newId, oldId) => {
    if (newId && newId !== oldId) {
      loadEvents();
      loadActiveCommunityDetail();
    }
    if (!newId) {
      heroLogoUrl.value = null;
    }
  },
);

const loadActiveCommunityDetail = async () => {
  if (!communityId.value) {
    heroLogoUrl.value = null;
    return;
  }
  try {
    const detail: ConsoleCommunityDetail = await fetchConsoleCommunity(communityId.value);
    const descriptionObj =
      typeof detail.description === 'object' && detail.description
        ? (detail.description as ConsoleCommunityDetail['description'])
        : null;
    const logo = (descriptionObj as any)?.logoImageUrl || detail.coverImageUrl || null;
    heroLogoUrl.value = logo ? resolveAssetUrl(logo) : null;
  } catch (err) {
    heroLogoUrl.value = null;
  }
};
</script>

<style scoped>
.console-home {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 4px) 4px calc(60px + env(safe-area-inset-bottom, 0px));
  background: #f7f7fb;
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

.hero-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.hero-avatar {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.3);
}

.hero-heading-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
}

.hero-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.hero-role {
  margin: 0;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.6);
}

.hero-switch {
  border: none;
  padding: 8px 12px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
  font-size: 12px;
  font-weight: 600;
}

.hero-switch--primary {
  background: rgba(0, 144, 217, 0.12);
  color: #0090d9;
}

.inline-switch {
  margin-top: 0;
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
  text-align: left;
  box-shadow: 0 15px 30px rgba(15, 23, 42, 0.08);
}

.action-entry {
  display: flex;
  align-items: center;
  gap: 12px;
}

.action-icon {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-icon img {
  width: 28px;
  height: 28px;
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
.picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-end;
  z-index: 60;
}
.picker-sheet {
  width: 100%;
  background: #fff;
  border-radius: 24px 24px 0 0;
  padding: 16px;
  box-shadow: 0 -18px 30px rgba(15, 23, 42, 0.2);
}
.picker-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.picker-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.picker-close {
  border: none;
  background: rgba(15, 23, 42, 0.05);
  border-radius: 12px;
  width: 32px;
  height: 32px;
}
.picker-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.picker-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid transparent;
}
.picker-item.is-active {
  border-color: #0ea5e9;
  background: rgba(14, 165, 233, 0.15);
}
.picker-name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.picker-slug {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
.picker-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 16px;
  border: 1px dashed rgba(15, 23, 42, 0.2);
  padding: 12px;
  color: #0f172a;
  text-decoration: none;
}
.picker-add span {
  font-size: 18px;
}
.picker-empty {
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}
</style>
