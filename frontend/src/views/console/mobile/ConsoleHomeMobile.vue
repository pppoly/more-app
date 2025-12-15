<template>
  <div class="console-home">
    <div v-if="!dataReady" class="console-skeleton">
      <div class="sk-header"></div>
      <div class="sk-stats">
        <div class="sk-chip" v-for="n in 3" :key="`chip-${n}`"></div>
      </div>
      <div class="sk-actions">
        <div class="sk-tile" v-for="n in 6" :key="`tile-${n}`"></div>
      </div>
    </div>
    <section class="top-bar">
      <div class="top-main">
        <button class="avatar-btn" type="button" @click="goCommunitySettings">
          <img :key="communityId || 'default'" :src="communityAvatar" alt="avatar" loading="lazy" />
        </button>
        <div class="top-text" @click="goCommunitySettings">
          <p class="top-label">社群</p>
          <div class="top-title-row">
            <h1 class="top-title">
              {{ communityName || '未選択のコミュニティ' }}
              <span v-if="roleLabel" class="role-chip">{{ roleLabel }}</span>
            </h1>
            <button v-if="planLabel" class="plan-chip" type="button" @click.stop="goSubscription">
              {{ planDisplay }}
            </button>
          </div>
          <p class="top-role">{{ hasCommunity ? 'タップして設定を開く' : 'まずはコミュニティを登録' }}</p>
        </div>
        <button
          :class="['pill-btn', hasCommunity ? '' : 'pill-btn--primary']"
          type="button"
          @click="openCommunityPicker"
        >
          <span class="i-lucide-sparkles" v-if="!hasCommunity"></span>
          切り替え
        </button>
      </div>
      <div class="stat-inline">
        <div class="stat-inline-item">
          <p class="stat-label">今月の収入</p>
          <p class="stat-value">{{ hasCommunity ? stats.monthRevenueText : '¥0' }}</p>
        </div>
        <div class="stat-inline-item">
          <p class="stat-label">今月のイベント</p>
          <p class="stat-value">{{ hasCommunity ? stats.registrationCount : '0' }}</p>
        </div>
        <div class="stat-inline-item">
          <p class="stat-label">申込数</p>
          <p class="stat-value">{{ hasCommunity ? stats.registrationCount : '0' }}</p>
        </div>
      </div>
    </section>

    <button
      class="fab"
      :class="{ 'fab--disabled': !hasCommunity }"
      type="button"
      @click="hasCommunity ? openCreateEventSheet() : goCreateCommunity()"
    >
      <svg class="fab-plus" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 5v14m-7-7h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
      </svg>
    </button>

    <section class="action-grid">
      <button class="action-tile" type="button" :class="{ 'is-disabled': !hasCommunity }" @click="goAllEvents">
        <div class="action-icon">
          <img :src="defaultActionIcon" alt="" loading="lazy" />
        </div>
        <p class="action-title">活动管理</p>
      </button>
      <button class="action-tile" type="button" :class="{ 'is-disabled': !hasCommunity }" @click="goPayout">
        <div class="action-icon">
          <img :src="defaultActionIcon" alt="" loading="lazy" />
        </div>
        <p class="action-title">收益入金</p>
      </button>
      <button class="action-tile" type="button" :class="{ 'is-disabled': !hasCommunity }" @click="goTicketScanner">
        <div class="action-icon">
          <img :src="defaultActionIcon" alt="" />
        </div>
        <p class="action-title">验票扫码</p>
      </button>
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
              <div class="picker-avatar">
                <img
                  v-if="item.logoImageUrl"
                  :src="normalizeLogoUrl(item.logoImageUrl)"
                  alt="logo"
                  loading="lazy"
                />
                <span v-else>{{ item.name.slice(0, 1) }}</span>
              </div>
              <div class="picker-meta">
                <p class="picker-name">{{ item.name }}</p>
                <p class="picker-slug">@{{ item.slug }}</p>
              </div>
              <span v-if="item.id === activeCommunityId" class="i-lucide-check"></span>
            </button>
            <p v-if="!managedCommunities.length" class="picker-empty">まだ社群がありません。</p>
            <button
              type="button"
              class="picker-add"
              :class="{ 'is-disabled': !canCreateCommunity }"
              @click="handleCreateClick"
            >
              <span class="i-lucide-plus"></span>
              {{ canCreateCommunity ? '新しい社群を登録' : 'プランをアップグレード' }}
            </button>
            <p v-if="!canCreateCommunity" class="picker-hint">Free プランでは社群は 1 つまでです。アップグレードで増やせます。</p>
          </template>
        </div>
      </div>
    </div>

    <div v-if="showCreateSheet" class="create-overlay" @click.self="closeCreateSheet">
      <div class="create-sheet">
        <header class="create-head">
          <p class="create-title">怎么开始？</p>
          <p class="create-subtitle">先选一个最省事的方式</p>
        </header>
        <div class="create-list">
          <button type="button" class="create-item" @click="selectCreateMode('paste')">
            <div class="create-icon">🧾</div>
            <div class="create-body">
              <p class="create-item-title">我已有活动方案</p>
              <p class="create-item-desc">粘贴提纲，自动帮你填表，省时省力</p>
            </div>
          </button>
          <button type="button" class="create-item" @click="selectCreateMode('assistant')">
            <div class="create-icon">🤖</div>
            <div class="create-body">
              <p class="create-item-title">我只有想法</p>
              <p class="create-item-desc">AI 一起讨论，几句口述生成活动内容</p>
            </div>
          </button>
          <button type="button" class="create-item" @click="selectCreateMode('basic')">
            <div class="create-icon">✍️</div>
            <div class="create-body">
              <p class="create-item-title">直接填活动</p>
              <p class="create-item-desc">按表单一步步填写，熟悉流程最快</p>
            </div>
          </button>
          <button type="button" class="create-item" @click="selectCreateMode('copy')">
            <div class="create-icon">📄</div>
            <div class="create-body">
              <p class="create-item-title">复制一个历史活动</p>
              <p class="create-item-desc">复用以前的配置，几秒办同款</p>
            </div>
          </button>
        </div>
    <button type="button" class="create-close" @click="closeCreateSheet">取消</button>
  </div>
</div>

<div v-if="showCopyPicker" class="create-overlay" @click.self="closeCopyPicker">
  <div class="create-sheet copy-sheet">
    <div class="copy-list">
      <template v-if="copyEvents.length">
        <button
          v-for="item in copyEvents"
          :key="item.id"
          type="button"
          class="copy-item"
          @click="handleCopySelect(item.id)"
        >
          <div class="copy-meta">
            <p class="copy-title">{{ getLocalizedText(item.title) || '历史活动' }}</p>
            <p class="copy-time">{{ formatDate(item.startTime) }}</p>
          </div>
        </button>
      </template>
      <p v-else-if="!copyLoading && !copyError" class="empty-text">暂无历史活动</p>
      <p v-if="copyError" class="empty-text">{{ copyError }}</p>
      <p v-if="copyLoading" class="empty-text">加载中...</p>
    </div>
    <div class="copy-actions">
      <button v-if="!copyLoading" type="button" class="copy-more" @click="loadCopyPage">加载更多</button>
      <button type="button" class="create-close" @click="closeCopyPicker">取消</button>
    </div>
  </div>
</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import {
  fetchConsoleCommunity,
  fetchConsoleCommunityEvents,
  fetchCommunityBalance,
  fetchCommunityAiUsage,
  fetchCommunityAnalytics,
  startCommunityStripeOnboarding,
} from '../../../api/client';
import { getLocalizedText } from '../../../utils/i18nContent';
import { resolveAssetUrl } from '../../../utils/assetUrl';
// Inline SVG data URIs to avoid network requests and首屏闪现
const defaultCommunityAvatar =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='; // transparent pixel to avoid placeholder art
const defaultActionIcon =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjYiIHkxPSI2IiB4Mj0iNDIiIHkyPSI0MiIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMjU2M0VCIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzIyQzU1RSIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3QgeD0iNCIgeT0iNCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iMTIiIGZpbGw9InVybCgjZykiLz4KICA8cGF0aCBkPSJNMjQgMTR2MjBNMTQgMjRoMjAiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIwLjk1Ii8+Cjwvc3ZnPgo=';
const defaultEventCover =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQwIiBoZWlnaHQ9IjM2MCIgdmlld0JveD0iMCAwIDY0MCAzNjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImJnIiB4MT0iODAiIHkxPSI0MCIgeDI9IjU2MCIgeTI9IjMyMCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMjU2M0VCIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzIyQzU1RSIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iZ2xvdyIgeDE9IjE0MCIgeTE9IjYwIiB4Mj0iNTIwIiB5Mj0iMzAwIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IndoaXRlIiBzdG9wLW9wYWNpdHk9IjAuMzIiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJ3aGl0ZSIgc3RvcC1vcGFjaXR5PSIwLjA1Ii8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogIDwvZGVmcz4KICA8cmVjdCB4PSIyNCIgeT0iMjAiIHdpZHRoPSI1OTIiIGhlaWdodD0iMzIwIiByeD0iMjgiIGZpbGw9InVybCgjYmcpIi8+CiAgPHJlY3QgeD0iNDgiIHk9IjQ0IiB3aWR0aD0iNTQ0IiBoZWlnaHQ9IjI3MiIgcng9IjI0IiBmaWxsPSJ1cmwoI2dsb3cpIi8+CiAgPGNpcmNsZSBjeD0iMTgwIiBjeT0iMTQwIiByPSIyMCIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC41NSIvPgogIDxjaXJjbGUgY3g9IjI0MCIgY3k9IjE0MCIgcj0iMTIiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuNDUiLz4KICA8Y2lyY2xlIGN4PSIzNDAiIGN5PSIxNDAiIHI9IjMwIiBmaWxsPSJ3aGl0ZSIgZmlsbC1vcGFjaXR5PSIwLjQ4Ii8+CiAgPGNpcmNsZSBjeD0iNDIwIiBjeT0iMTQwIiByPSIxNiIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC40Ii8+CiAgPHJlY3QgeD0iMTcwIiB5PSIyMTAiIHdpZHRoPSIzMDAiIGhlaWdodD0iMTYiIHJ4PSI4IiBmaWxsPSJ3aGl0ZSIgZmlsbC1vcGFjaXR5PSIwLjkiLz4KICA8cmVjdCB4PSIyMjAiIHk9IjIzNiIgd2lkdGg9IjIwMCIgaGVpZ2h0PSIxMCIgcng9IjUiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuOCIvPgo8L3N2Zz4K';
import type { ConsoleCommunityDetail, ConsoleEventSummary, CommunityAnalytics } from '../../../types/api';

const router = useRouter();
const communityStore = useConsoleCommunityStore();
const events = ref<ConsoleEventSummary[]>([]);
const loading = ref(false);
const analytics = ref<CommunityAnalytics | null>(null);
const showCommunityPicker = ref(false);
const showCreateSheet = ref(false);
const showCopyPicker = ref(false);
const copyLoading = ref(false);
const copyError = ref('');
const copyEvents = ref<ConsoleEventSummary[]>([]);
const copyPage = ref(0);
const copyPageSize = 10;
const pickerLoading = ref(false);
const pricingPlanId = ref<string | null>(null);
const monthRevenueText = ref<string>('¥0');
const heroLogoUrl = ref<string | null>(null);
const heroLoading = ref(true);
let logoRequestId = 0;

const community = computed(() => communityStore.getActiveCommunity());
const managedCommunities = computed(() => communityStore.communities.value);
const activeCommunityId = computed(() => communityStore.activeCommunityId.value);
const communityName = computed(() => community.value?.name ?? '');
const communityId = computed(() => communityStore.activeCommunityId.value);
const dataReady = computed(() => !communityStore.loading.value && communityStore.loaded.value);
const hasMultipleCommunities = computed(() => managedCommunities.value.length > 1);
const hasCommunity = computed(() => Boolean(communityId.value));
const communityAvatar = computed(() => {
  return heroLogoUrl.value || defaultCommunityAvatar;
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
const planLabel = computed(() => {
  const id = (pricingPlanId.value || '').toLowerCase();
  if (!id) return 'Free';
  if (id.includes('pro')) return 'Pro';
  if (id.includes('starter')) return 'Starter';
  if (id.includes('free')) return 'Free';
  return id;
});
const isFreePlan = computed(() => planLabel.value.toLowerCase().includes('free'));
const planDisplay = computed(() => (isFreePlan.value ? 'Free · 1社群まで' : planLabel.value));
const canCreateCommunity = computed(() => !isFreePlan.value || managedCommunities.value.length < 1);
const aiMinutesSaved = ref<number | null>(null);

const stats = computed(() => ({
  monthRevenueText: monthRevenueText.value,
  pageViews: analytics.value?.pageViewsMonth ?? '--',
  followerCount: analytics.value?.followerCount ?? '--',
  registrationCount: analytics.value?.totalRegistrations ?? '--',
}));

const activeCommunityVersion = computed(() => communityStore.activeCommunityVersion.value);

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

const formatJPY = (amount: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', minimumFractionDigits: 0 }).format(amount);

const fetchMonthBalance = async () => {
  if (!communityId.value) {
    monthRevenueText.value = '¥0';
    return;
  }
  try {
    const balance = await fetchCommunityBalance(communityId.value, { period: 'month' });
    monthRevenueText.value = formatJPY(balance.net ?? 0);
  } catch (err) {
    monthRevenueText.value = '¥0';
  }
};

const fetchAiUsage = async () => {
  if (!communityId.value) {
    aiMinutesSaved.value = null;
    return;
  }
  try {
    const usage = await fetchCommunityAiUsage(communityId.value);
    aiMinutesSaved.value = usage.estimatedMinutesSaved;
  } catch (err) {
    aiMinutesSaved.value = null;
  }
};

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

const loadAnalytics = async () => {
  if (!communityId.value) {
    analytics.value = null;
    return;
  }
  try {
    analytics.value = await fetchCommunityAnalytics(communityId.value);
  } catch (err) {
    analytics.value = null;
  }
};

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
  router.push({ name: 'ConsoleMobileSubscriptionStandalone' });
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

const openCreateEventSheet = () => {
  if (!communityId.value) return;
  showCreateSheet.value = true;
};

const closeCreateSheet = () => {
  showCreateSheet.value = false;
};

const selectCreateMode = (mode: 'paste' | 'assistant' | 'basic' | 'copy') => {
  if (!communityId.value) return;
  try {
    sessionStorage.setItem('CONSOLE_EVENT_ENTRY', mode);
  } catch (e) {
    // ignore storage failure
  }
  const params = { communityId: communityId.value };
  switch (mode) {
    case 'paste':
      router.push({ name: 'ConsoleMobileEventPaste', params });
      break;
    case 'assistant':
      router.push({ name: 'ConsoleMobileEventCreate', params });
      break;
    case 'basic':
      router.push({ name: 'ConsoleMobileEventForm', params, query: { entry: 'basic' } });
      break;
    case 'copy':
      void openCopyPicker();
      break;
    default:
      break;
  }
  showCreateSheet.value = false;
};

const openCopyPicker = async () => {
  if (!communityId.value) return;
  showCopyPicker.value = true;
  if (copyEvents.value.length || copyLoading.value) return;
  await loadCopyPage();
};

const closeCopyPicker = () => {
  showCopyPicker.value = false;
};

const handleCopySelect = (eventId: string) => {
  if (!communityId.value) return;
  router.push({
    name: 'ConsoleMobileEventForm',
    params: { communityId: communityId.value },
    query: { entry: 'copy', copyEventId: eventId },
  });
  showCopyPicker.value = false;
};

const loadCopyPage = async () => {
  if (!communityId.value || copyLoading.value) return;
  copyLoading.value = true;
  copyError.value = '';
  try {
    const list = await fetchConsoleCommunityEvents(communityId.value);
    // emulate pagination client-side (backend already limits to latest 30)
    const start = copyPage.value * copyPageSize;
    const nextSlice = list.slice(start, start + copyPageSize);
    if (nextSlice.length) {
      copyEvents.value.push(...nextSlice);
      copyPage.value += 1;
    }
  } catch (err: any) {
    copyError.value = err?.message || '历史活动加载失败';
  } finally {
    copyLoading.value = false;
  }
};

const goEventAssistant = () => {
  if (!communityId.value) return;
  router.push({ name: 'ConsoleMobileEventCreate', params: { communityId: communityId.value } });
};

const handleCreateClick = () => {
  if (canCreateCommunity.value) {
    closeCommunityPicker();
    router.push({ name: 'ConsoleMobileCommunityCreate' });
  } else {
    goSubscription();
  }
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

const stripeOnboardLoading = ref(false);
const startStripeOnboard = async () => {
  if (!communityId.value || stripeOnboardLoading.value) return;
  stripeOnboardLoading.value = true;
  try {
    const { url } = await startCommunityStripeOnboarding(communityId.value);
    window.location.href = url;
  } catch (err) {
    console.error('Failed to start Stripe onboarding', err);
    console.error('Stripe 連携リンクの取得に失敗しました');
  } finally {
    stripeOnboardLoading.value = false;
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
    fetchMonthBalance();
    fetchAiUsage();
    loadAnalytics();
  }
});

watch(
  () => communityId.value,
  (newId, oldId) => {
    if (newId && newId !== oldId) {
      loadEvents();
      loadActiveCommunityDetail();
      fetchMonthBalance();
      fetchAiUsage();
      loadAnalytics();
    }
    if (!newId) {
      heroLogoUrl.value = null;
      monthRevenueText.value = '¥0';
      aiMinutesSaved.value = null;
      analytics.value = null;
    }
  },
);

watch(
  () => activeCommunityVersion.value,
  () => {
    if (communityId.value) {
      loadActiveCommunityDetail();
      loadAnalytics();
    }
  },
);

const loadActiveCommunityDetail = async () => {
  if (!communityId.value) {
    heroLogoUrl.value = null;
    pricingPlanId.value = null;
    monthRevenueText.value = '¥0';
    analytics.value = null;
    heroLoading.value = false;
    return;
  }
  const currentRequestId = ++logoRequestId;
  heroLogoUrl.value = null;
  heroLoading.value = true;
  try {
    const detail: ConsoleCommunityDetail = await fetchConsoleCommunity(communityId.value);
    const descriptionObj =
      typeof detail.description === 'object' && detail.description
        ? (detail.description as ConsoleCommunityDetail['description'])
        : null;
    const logo = (descriptionObj as any)?.logoImageUrl || detail.logoImageUrl || null;
    pricingPlanId.value = detail.pricingPlanId ?? null;
    if (currentRequestId === logoRequestId) {
      heroLogoUrl.value = normalizeLogoUrl(logo);
    }
    fetchMonthBalance();
  } catch (err) {
    if (currentRequestId === logoRequestId) {
      heroLogoUrl.value = null;
    }
    monthRevenueText.value = '¥0';
  } finally {
    if (currentRequestId === logoRequestId) {
      heroLoading.value = false;
    }
  }
};

const normalizeLogoUrl = (raw?: string | null) => {
  if (!raw) return null;
  let v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v) || /^data:/i.test(v)) return v;
  if (!v.startsWith('/')) v = `/${v}`;
  if (!v.startsWith('/uploads/')) v = `/uploads/${v.replace(/^\/+/, '')}`;
  return resolveAssetUrl(v);
};
</script>

<style scoped>
.console-home {
  min-height: 100vh;
  padding: calc(0.4rem + env(safe-area-inset-top, 0px)) 0.6rem calc(16px + env(safe-area-inset-bottom, 0px));
  background: #f4f6fb;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 100vw;
  box-sizing: border-box;
  overflow-x: hidden;
}

.top-bar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 16px;
  background: linear-gradient(135deg, #22d2ff 0%, #37e36f 100%);
  border-radius: 14px;
  padding: 18px 14px 16px;
  box-shadow: 0 12px 24px rgba(34, 210, 255, 0.14);
  position: relative;
}

.top-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar-btn {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  border: none;
  padding: 0;
  overflow: hidden;
  background: transparent;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.12);
  flex-shrink: 0;
}

.avatar-btn img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 12px;
}

.top-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
  color: #f8fbff;
}

.top-label {
  margin: 0;
  font-size: 11px;
  color: rgba(248, 251, 255, 0.8);
}

.top-title {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: #ffffff;
  line-height: 1.2;
}

.top-actions {
  margin-top: -10px;
  display: flex;
  justify-content: flex-start;
}

.portal-btn {
  border: none;
  color: #0f172a;
  background: #ffffff;
  border-radius: 16px;
  padding: 12px 14px;
  font-weight: 700;
  font-size: 14px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
  width: 100%;
  text-align: center;
}

.role-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  vertical-align: middle;
}
.plan-chip {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.32);
  color: #0f172a;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.01em;
  border: 1px solid rgba(255, 255, 255, 0.65);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.08);
  cursor: pointer;
}
.top-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.plan-chip {
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.32);
  color: #0f172a;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  border: 1px solid rgba(255, 255, 255, 0.65);
  cursor: pointer;
}

.top-role {
  margin: 0;
  font-size: 11px;
  color: rgba(248, 251, 255, 0.92);
}

.pill-btn {
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.9);
  color: #0f172a;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pill-btn--primary {
  border: 1px solid rgba(255, 255, 255, 0.8);
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.08);
}

.stat-inline {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.stat-inline-item {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 12px;
  padding: 10px 8px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.32);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.stat-label {
  margin: 0;
  font-size: 12px;
  color: rgba(19, 75, 58, 0.9);
}

.stat-value {
  margin: 2px 0 0;
  font-size: 16px;
  font-weight: 700;
  color: #0b4f8f;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 4px;
}

.action-tile {
  border: none;
  border-radius: 14px;
  background: #f3fbff;
  padding: 16px 12px;
  box-shadow: 0 10px 18px rgba(24, 128, 200, 0.08);
  border: 1px solid #cfe9ff;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.action-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: #dff3ff;
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
  font-weight: 700;
  color: #0f172a;
}

.action-tile.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}
.fab {
  position: fixed;
  right: 16px;
  bottom: calc(88px + env(safe-area-inset-bottom, 0px));
  width: 68px;
  height: 68px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #22d3ee, #2563eb);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 18px 36px rgba(37, 99, 235, 0.28);
}
.fab--disabled {
  opacity: 0.6;
}
.fab-plus {
  width: 30px;
  height: 30px;
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
  gap: 12px;
}
.picker-item.is-active {
  border-color: #0ea5e9;
  background: rgba(14, 165, 233, 0.15);
}
.picker-avatar {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #fff;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.35);
}
.picker-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.picker-meta {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
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
.picker-add.is-disabled {
  pointer-events: all;
  cursor: not-allowed;
  background: rgba(15, 23, 42, 0.06);
  border-style: solid;
  color: #94a3b8;
}
.picker-add span {
  font-size: 18px;
}
.picker-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #64748b;
}
.picker-empty {
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}

.create-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-end;
  z-index: 70;
}

.create-sheet {
  width: 100%;
  max-height: 75vh;
  background: #fff;
  border-radius: 20px 20px 0 0;
  padding: 18px 16px 24px;
  box-shadow: 0 -12px 32px rgba(15, 23, 42, 0.2);
}

.create-head {
  margin-bottom: 8px;
}

.create-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.create-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: #64748b;
}

.copy-sheet {
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  padding-bottom: 12px;
}

.copy-list {
  flex: 1;
  overflow-y: auto;
  margin-top: 8px;
  padding-right: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.copy-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.copy-more {
  flex: 1;
  padding: 12px;
  border-radius: 12px;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
}

.copy-item {
  width: 100%;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 10px;
  padding: 10px 12px;
  background: #fff;
  text-align: left;
}

.copy-item:active {
  background: #f8fafc;
}

.copy-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.copy-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.copy-time {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
}

.create-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.create-item {
  width: 100%;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  text-align: left;
}

.create-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.05);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.create-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.create-item-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.create-item-desc {
  margin: 0;
  font-size: 13px;
  color: #475569;
  line-height: 1.4;
}

.create-close {
  width: 100%;
  margin-top: 12px;
  border: none;
  border-radius: 12px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.06);
  color: #0f172a;
  font-weight: 700;
}
.console-skeleton {
  position: absolute;
  inset: 0;
  padding: 16px;
  background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
  display: flex;
  flex-direction: column;
  gap: 14px;
  z-index: 10;
}
.sk-header {
  height: 90px;
  border-radius: 20px;
  background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
}
.sk-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.sk-chip {
  height: 64px;
  border-radius: 16px;
  background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
}
.sk-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.sk-tile {
  height: 120px;
  border-radius: 18px;
  background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
}
@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
