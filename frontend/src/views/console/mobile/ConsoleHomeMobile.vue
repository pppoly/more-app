<template>
  <PageMarker label="P1" />
  <div class="console-home">
    <section class="top-bar">
      <button class="avatar-btn" type="button" @click="goCommunitySettings">
        <img :key="communityId || 'default'" :src="communityAvatar" alt="avatar" />
      </button>
      <div class="top-text" @click="goCommunitySettings">
        <p class="top-label">社群</p>
        <div class="top-title-row">
          <h1 class="top-title">{{ communityName || '未選択のコミュニティ' }}</h1>
          <button v-if="planLabel" class="plan-chip" type="button" @click.stop="goSubscription">
            {{ planLabel }}
          </button>
        </div>
        <p class="top-role">{{ hasCommunity ? `役割: ${roleLabel}` : 'まずはコミュニティを登録' }}</p>
      </div>
      <button
        v-if="hasCommunity"
        class="pill-btn"
        type="button"
        @click="openCommunityPicker"
      >
        切り替え
      </button>
      <button
        v-else
        class="pill-btn pill-btn--primary"
        type="button"
        @click="goCreateCommunity"
      >
        <span class="i-lucide-sparkles"></span>
        新建
      </button>
    </section>

    <section class="stat-row">
      <article class="stat-chip">
        <p class="stat-label">今月の収入</p>
        <p class="stat-value">{{ hasCommunity ? stats.monthRevenueText : '---' }}</p>
      </article>
      <article class="stat-chip">
        <p class="stat-label">今月のイベント</p>
        <p class="stat-value">{{ hasCommunity ? stats.eventCount : '--' }}</p>
      </article>
      <article class="stat-chip">
        <p class="stat-label">申込数</p>
        <p class="stat-value">{{ hasCommunity ? stats.registrationCount : '--' }}</p>
      </article>
    </section>

    <section class="action-grid">
      <button class="action-tile" type="button" @click="goCreateCommunity">
        <div class="action-icon">
          <img :src="defaultActionIcon" alt="" />
        </div>
        <p class="action-title">创建社群</p>
      </button>
      <button class="action-tile" type="button" :class="{ 'is-disabled': !hasCommunity }" @click="openCreateEventSheet">
        <div class="action-icon">
          <img :src="defaultActionIcon" alt="" />
        </div>
        <p class="action-title">新建活动</p>
      </button>
      <button class="action-tile" type="button" :class="{ 'is-disabled': !hasCommunity }" @click="goEventAssistant">
        <div class="action-icon">
          <img :src="defaultActionIcon" alt="" />
        </div>
        <p class="action-title">AI 助手</p>
      </button>
      <button class="action-tile" type="button" :class="{ 'is-disabled': !hasCommunity }" @click="goAllEvents">
        <div class="action-icon">
          <img :src="defaultActionIcon" alt="" />
        </div>
        <p class="action-title">活动管理</p>
      </button>
      <button class="action-tile" type="button" :class="{ 'is-disabled': !hasCommunity }" @click="goPayout">
        <div class="action-icon">
          <img :src="defaultActionIcon" alt="" />
        </div>
        <p class="action-title">收益入金</p>
      </button>
      <button class="action-tile" type="button" :class="{ 'is-disabled': !hasCommunity }" @click="goSubscription">
        <div class="action-icon">
          <img :src="defaultActionIcon" alt="" />
        </div>
        <p class="action-title">订阅方案</p>
      </button>
      <button class="action-tile" type="button" :class="{ 'is-disabled': !hasCommunity }" @click="goPublicPortal">
        <div class="action-icon">
          <img :src="defaultActionIcon" alt="" />
        </div>
        <p class="action-title">公开页</p>
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
  startCommunityStripeOnboarding,
} from '../../../api/client';
import { getLocalizedText } from '../../../utils/i18nContent';
import { resolveAssetUrl } from '../../../utils/assetUrl';
import PageMarker from '../../../components/PageMarker.vue';
// Inline SVG data URIs to avoid network requests and首屏闪现
const defaultCommunityAvatar =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIxNCIgeTE9IjE0IiB4Mj0iMTA2IiB5Mj0iMTA2IiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IiMyNTYzRUIiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMjJDNTVFIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogIDwvZGVmcz4KICA8cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTEyIiBoZWlnaHQ9IjExMiIgcng9IjMyIiBmaWxsPSJ1cmwoI2cpIi8+CiAgPHJlY3QgeD0iMTgiIHk9IjMyIiB3aWR0aD0iODQiIGhlaWdodD0iNTYiIHJ4PSIyMCIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC4xMiIvPgogIDxjaXJjbGUgY3g9IjQwIiBjeT0iNjAiIHI9IjEyIiBmaWxsPSJ3aGl0ZSIgZmlsbC1vcGFjaXR5PSIwLjkiLz4KICA8Y2lyY2xlIGN4PSI4MCIgY3k9IjYwIiByPSIxMiIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC45Ii8+CiAgPHJlY3QgeD0iMzAiIHk9IjgwIiB3aWR0aD0iNjAiIGhlaWdodD0iNiIgcng9IjMiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuNzUiLz4KICA8cGF0aCBkPSJNNjAgMjZjLTggMC0xNC41IDYuNS0xNC41IDE0LjVTNTIgNTUgNjAgNTVzMTQuNS02LjUgMTQuNS0xNC41UzY4IDI2IDYwIDI2WiIgZmlsbD0iIzBFQTVFOSIgZmlsbC1vcGFjaXR5PSIwLjI4Ii8+CiAgPHBhdGggZD0iTTYwIDMyYy01LjUgMC0xMCA0LjUtMTAgMTBzNC41IDEwIDEwIDEwIDEwLTQuNSAxMC0xMC00LjUtMTAtMTAtMTBaIiBmaWxsPSJ3aGl0ZSIgZmlsbC1vcGFjaXR5PSIwLjkiLz4KPC9zdmc+Cg==';
const defaultActionIcon =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjYiIHkxPSI2IiB4Mj0iNDIiIHkyPSI0MiIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMjU2M0VCIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzIyQzU1RSIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3QgeD0iNCIgeT0iNCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iMTIiIGZpbGw9InVybCgjZykiLz4KICA8cGF0aCBkPSJNMjQgMTR2MjBNMTQgMjRoMjAiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIwLjk1Ii8+Cjwvc3ZnPgo=';
const defaultEventCover =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQwIiBoZWlnaHQ9IjM2MCIgdmlld0JveD0iMCAwIDY0MCAzNjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImJnIiB4MT0iODAiIHkxPSI0MCIgeDI9IjU2MCIgeTI9IjMyMCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMjU2M0VCIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzIyQzU1RSIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iZ2xvdyIgeDE9IjE0MCIgeTE9IjYwIiB4Mj0iNTIwIiB5Mj0iMzAwIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IndoaXRlIiBzdG9wLW9wYWNpdHk9IjAuMzIiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJ3aGl0ZSIgc3RvcC1vcGFjaXR5PSIwLjA1Ii8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogIDwvZGVmcz4KICA8cmVjdCB4PSIyNCIgeT0iMjAiIHdpZHRoPSI1OTIiIGhlaWdodD0iMzIwIiByeD0iMjgiIGZpbGw9InVybCgjYmcpIi8+CiAgPHJlY3QgeD0iNDgiIHk9IjQ0IiB3aWR0aD0iNTQ0IiBoZWlnaHQ9IjI3MiIgcng9IjI0IiBmaWxsPSJ1cmwoI2dsb3cpIi8+CiAgPGNpcmNsZSBjeD0iMTgwIiBjeT0iMTQwIiByPSIyMCIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC41NSIvPgogIDxjaXJjbGUgY3g9IjI0MCIgY3k9IjE0MCIgcj0iMTIiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuNDUiLz4KICA8Y2lyY2xlIGN4PSIzNDAiIGN5PSIxNDAiIHI9IjMwIiBmaWxsPSJ3aGl0ZSIgZmlsbC1vcGFjaXR5PSIwLjQ4Ii8+CiAgPGNpcmNsZSBjeD0iNDIwIiBjeT0iMTQwIiByPSIxNiIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC40Ii8+CiAgPHJlY3QgeD0iMTcwIiB5PSIyMTAiIHdpZHRoPSIzMDAiIGhlaWdodD0iMTYiIHJ4PSI4IiBmaWxsPSJ3aGl0ZSIgZmlsbC1vcGFjaXR5PSIwLjkiLz4KICA8cmVjdCB4PSIyMjAiIHk9IjIzNiIgd2lkdGg9IjIwMCIgaGVpZ2h0PSIxMCIgcng9IjUiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuOCIvPgo8L3N2Zz4K';
import type { ConsoleCommunityDetail, ConsoleEventSummary } from '../../../types/api';

const router = useRouter();
const communityStore = useConsoleCommunityStore();
const events = ref<ConsoleEventSummary[]>([]);
const loading = ref(false);
const showCommunityPicker = ref(false);
const showCreateSheet = ref(false);
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
  if (!id) return '';
  if (id.includes('pro')) return 'Pro';
  if (id.includes('starter')) return 'Starter';
  if (id.includes('free')) return 'Free';
  return id;
});

const stats = computed(() => ({
  monthRevenueText: monthRevenueText.value,
  eventCount: events.value.length,
  registrationCount: '--',
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
      router.push({ name: 'ConsoleMobileEventForm', params, query: { entry: 'copy' } });
      break;
    default:
      break;
  }
  showCreateSheet.value = false;
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
      monthRevenueText.value = '¥0';
    }
  },
);

watch(
  () => activeCommunityVersion.value,
  () => {
    if (communityId.value) {
      loadActiveCommunityDetail();
    }
  },
);

const loadActiveCommunityDetail = async () => {
  if (!communityId.value) {
    heroLogoUrl.value = null;
    pricingPlanId.value = null;
    monthRevenueText.value = '¥0';
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
    const logo = (descriptionObj as any)?.logoImageUrl || null;
    pricingPlanId.value = detail.pricingPlanId ?? null;
    if (currentRequestId === logoRequestId) {
      heroLogoUrl.value = logo ? resolveAssetUrl(logo) : null;
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
</script>

<style scoped>
.console-home {
  min-height: 100vh;
  padding: calc(0.6rem + env(safe-area-inset-top, 0px)) 0.6rem calc(80px + env(safe-area-inset-bottom, 0px));
  background: #f7f7fb;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.top-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #fff;
  border-radius: 12px;
  padding: 20px 20px;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.12);
}

.avatar-btn {
  width: 80px;
  height: 80px;
  border-radius: 12px;
  border: none;
  padding: 0;
  overflow: hidden;
  background: transparent;
  flex-shrink: 0;
}

.avatar-btn img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.top-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
}

.top-label {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}

.top-title {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.2;
}
.top-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.plan-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: #0ea5e9;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  border: none;
  cursor: pointer;
}

.top-role {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.pill-btn {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  padding: 8px 12px;
  background: #fff;
  color: #0f172a;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pill-btn--primary {
  border: none;
  background: linear-gradient(135deg, #0090d9, #22bbaa);
  color: #fff;
  box-shadow: 0 10px 24px rgba(0, 144, 217, 0.28);
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 0 6px;
}

.stat-chip {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.stat-label {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}

.stat-value {
  margin: 2px 0 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 4px;
}

.action-tile {
  border: none;
  border-radius: 12px;
  background: #fff;
  padding: 16px 12px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.action-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-icon img {
  width: 32px;
  height: 32px;
}

.action-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--m-color-text-primary);
}

.action-tile.is-disabled {
  opacity: 0.5;
  pointer-events: none;
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
</style>
