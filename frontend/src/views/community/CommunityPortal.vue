<template>
<section class="community-portal" :class="[themeClass, { 'is-loading': loading }]">
    <div v-if="loading" class="portal-skeleton">
      <div class="portal-skeleton__hero"></div>
      <div class="portal-skeleton__card"></div>
      <div class="portal-skeleton__card"></div>
    </div>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <div v-else-if="community" class="portal-shell">
      <header class="portal-nav">
        <button v-if="showConsoleBack" class="nav-back" type="button" @click="goBack">返回</button>
        <div class="nav-title">{{ community.name }}</div>
        <span class="nav-placeholder" />
      </header>
      <article v-if="showHero" class="portal-hero" :style="heroStyle">
        <div class="portal-hero__overlay"></div>
        <div class="portal-hero__content">
          <div class="portal-hero__avatar" :style="avatarStyle">
            <img v-if="avatarSrc && !avatarFailed" :src="avatarSrc" alt="avatar" @error="onAvatarError" />
            <span v-else>{{ avatarInitial }}</span>
          </div>
        </div>
      </article>

      <article class="info-card">
        <h1 class="community-name">{{ community.name }}</h1>
        <div class="info-tags" v-if="heroLabels.length">
          <span v-for="label in heroLabels" :key="label">#{{ label }}</span>
        </div>
        <button class="follow-btn" type="button" :disabled="followBusy" @click="toggleFollow">
          {{ following ? '已关注' : '关注社群' }}
        </button>
        <div class="member-row" v-if="memberAvatars.length">
          <div class="member-track">
            <div v-for="member in memberAvatars" :key="member.id" class="member-avatar">
              <img v-if="member.avatarUrl" :src="member.avatarUrl" :alt="member.name || 'member'" />
              <span v-else>{{ member.initial }}</span>
            </div>
          </div>
          <span class="member-count">{{ memberCount }} 人</span>
        </div>
        <p class="desc" :class="{ truncated: !descriptionExpanded }">
          {{ descriptionText }}
        </p>
        <button v-if="shouldTruncate" class="toggle" type="button" @click="descriptionExpanded = !descriptionExpanded">
          {{ descriptionExpanded ? '收起' : '展开' }}
        </button>
      </article>

      <article v-if="newsItemsLimited.length" class="news-card">
        <div class="news-card__head">
          <h2>社群动态</h2>
        </div>
        <div class="news-card__marquee">
          <div class="news-card__track">
            <div v-for="(item, idx) in newsItemsLoop" :key="`news-${idx}`" class="news-card__item">
              {{ item }}
            </div>
          </div>
        </div>
      </article>

      <section v-if="showEvents" class="event-gallery">
        <div class="event-gallery__head">
          <h2>社群活动</h2>
          <span class="count" v-if="formattedEvents.length">{{ formattedEvents.length }} 场</span>
        </div>
        <div class="event-gallery__track">
          <article v-for="event in formattedEvents" :key="event.id" class="event-tile">
            <div class="event-tile__cover" :style="eventCoverStyle(event)">
              <div class="event-tile__shade">
                <div class="event-tile__status" :class="event.statusClass">{{ event.statusLabel }}</div>
                <div class="event-tile__title">{{ event.title }}</div>
                <div class="event-tile__meta">{{ event.date }} · {{ event.locationText || '地点待定' }}</div>
              </div>
            </div>
          </article>
        </div>
        <div v-if="!formattedEvents.length" class="empty-panel">
          <p>还没有对外招募的活动。</p>
          <span>关注社群，及时收到新活动。</span>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchCommunityBySlug, fetchCommunityFollowStatus, followCommunity, unfollowCommunity } from '../../api/client';
import type { CommunityPortal } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { useResourceConfig } from '../../composables/useResourceConfig';
import { useAuth } from '../../composables/useAuth';
import { useToast } from '../../composables/useToast';

const route = useRoute();
const router = useRouter();
const { accessToken, user, fetchCurrentUser } = useAuth();
const slug = computed(() => route.params.slug as string);
const community = ref<CommunityPortal | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const resourceConfig = useResourceConfig();
const { slotMap } = resourceConfig;
const toast = useToast();

const heroFallbackImage = computed(
  () =>
    resourceConfig.getStringValue('mobile.communityPortal.heroImage') ||
    (slotMap['mobile.communityPortal.heroImage'].defaultValue as string),
);
const heroOverlay = 'linear-gradient(180deg, rgba(15, 23, 42, 0.35), rgba(3, 7, 18, 0.75))';

const composeHeroBackground = (source: string, fallback: string) => {
  if (!source) {
    return `${heroOverlay}, url(${fallback})`;
  }
  if (/gradient/i.test(source) && source.includes('url(')) {
    return source;
  }
  if (source.includes('url(')) {
    return `${heroOverlay}, ${source}`;
  }
  if (/gradient/i.test(source)) {
    return source;
  }
  return `${heroOverlay}, url(${source})`;
};

const loadCommunity = async (value: string) => {
  if (!value) {
    error.value = '社群不存在';
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const data = await fetchCommunityBySlug(value);
    community.value = data;
    following.value = Boolean(data.isFollowing);
  } catch (err) {
    error.value = '社群不存在或已下线';
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

const following = ref(false);
const followBusy = ref(false);
const hasFollowState = computed(() => Boolean(community.value?.id));

const descriptionExpanded = ref(false);
const descriptionText = computed(() => getLocalizedText(community.value?.description) || '简介准备中。');
const shouldTruncate = computed(() => descriptionText.value.length > 80);
const avatarFailed = ref(false);

watch(community, () => {
  descriptionExpanded.value = false;
  avatarFailed.value = false;
});

const heroStyle = computed(() => {
  const cover = community.value?.coverImageUrl ? resolveAssetUrl(community.value.coverImageUrl) : heroFallbackImage.value;
  return {
    backgroundImage: composeHeroBackground(cover, heroFallbackImage.value),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
});

const avatarSrc = computed(() => {
  const logo = community.value?.logoImageUrl ? resolveAssetUrl(community.value.logoImageUrl) : '';
  const cover = community.value?.coverImageUrl ? resolveAssetUrl(community.value.coverImageUrl) : '';
  return logo || cover || heroFallbackImage.value;
});
const avatarInitial = computed(() => (community.value?.name ? community.value.name.slice(0, 1) : '社'));
const onAvatarError = () => {
  avatarFailed.value = true;
};
const avatarStyle = computed(() => ({
  backgroundImage: avatarSrc.value ? `url(${avatarSrc.value})` : 'linear-gradient(135deg, #0f172a, #1e293b)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
}));

const themeName = computed(() => community.value?.portalConfig?.theme || 'immersive');
const themeClass = computed(() => `portal-theme-${themeName.value}`);
const layoutOrder = computed(() => {
  const layout = community.value?.portalConfig?.layout;
  if (Array.isArray(layout) && layout.length) return layout;
  return ['hero', 'about', 'upcoming', 'past'];
});

const showHero = computed(() => layoutOrder.value.includes('hero'));
const showEvents = computed(() => layoutOrder.value.some((b) => ['upcoming', 'past'].includes(b)));
const heroLabels = computed(() => community.value?.labels ?? []);

const formattedEvents = computed(() =>
  (community.value?.events ?? []).map((event) => ({
    ...event,
    title: getLocalizedText(event.title) || '活动',
    date: new Date(event.startTime).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    statusLabel: event.status === 'open' ? '报名中' : '已结束',
    statusClass: event.status === 'open' ? 'open' : 'closed',
  })),
);

const upcomingEvents = computed(() => formattedEvents.value.filter((event) => event.status === 'open'));
const pastEvents = computed(() => formattedEvents.value.filter((event) => event.status !== 'open'));
const memberAvatars = computed(() =>
  (community.value?.members ?? []).map((member) => ({
    id: member.id,
    name: member.name || '',
    avatarUrl: member.avatarUrl ? resolveAssetUrl(member.avatarUrl) : '',
    initial: (member.name || community.value?.name || '社').slice(0, 1),
  })),
);
const memberCount = computed(() => community.value?.memberCount ?? memberAvatars.value.length);
const newsItems = computed(() => {
  const events = formattedEvents.value;
  if (!events.length) return [];
  return events.slice(0, 6).map((event) => {
    const flag = event.status === 'open' ? '招募中' : '回顾';
    return `${flag} · ${event.title} · ${event.date}`;
  });
});
const newsItemsLimited = computed(() => newsItems.value.slice(0, 3));
const newsItemsLoop = computed(() => [...newsItemsLimited.value, ...newsItemsLimited.value]);
const eventCoverStyle = (event: any) => {
  const cover = event.coverImageUrl ? resolveAssetUrl(event.coverImageUrl as string) : heroFallbackImage.value;
  return {
    backgroundImage: `url(${cover})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
};
const showConsoleBack = computed(() => {
  const q = route.query;
  if (
    q.from === 'console' ||
    q.source === 'console' ||
    q.ref === 'console' ||
    q.back === 'console' ||
    q.console === '1'
  ) {
    return true;
  }
  if (typeof window !== 'undefined') {
    const back = (window.history.state && (window.history.state.back as string)) || '';
    if (typeof back === 'string' && back.includes('/console')) return true;
  }
  return false;
});
const goBack = () => {
  if (history.length > 1) {
    router.back();
  } else {
    router.push('/console');
  }
};

const loadFollow = async () => {
  if (!community.value?.id || !accessToken.value) return;
  try {
    const res = await fetchCommunityFollowStatus(community.value.id);
    following.value = res.following;
  } catch (err) {
    console.warn('load follow failed', err);
  }
};

watch(
  () => community.value?.id,
  (val) => {
    if (val) loadFollow();
  },
);

const ensureAuthed = async () => {
  if (accessToken.value) return true;
  toast.show('请先登录再关注社群', { type: 'info' });
  router.push({ name: 'auth-login', query: { redirect: route.fullPath } });
  return false;
};

const toggleFollow = async () => {
  if (!community.value?.id) return;
  if (!(await ensureAuthed())) return;
  followBusy.value = true;
  try {
    if (following.value) {
      const res = await unfollowCommunity(community.value.id);
      following.value = res.following;
    } else {
      const res = await followCommunity(community.value.id);
      following.value = res.following;
    }
    await fetchCurrentUser();
  } catch (err) {
    console.error(err);
    toast.show('操作失败，请稍后重试', { type: 'error' });
  } finally {
    followBusy.value = false;
  }
};
</script>

<style scoped>
.community-portal {
  --card-bg: #fff;
  --chip-bg: rgba(255, 255, 255, 0.2);
  --chip-border: rgba(255, 255, 255, 0.35);
  --hero-overlay-from: rgba(15, 23, 42, 0.22);
  --hero-overlay-to: rgba(15, 23, 42, 0.55);
  background: linear-gradient(180deg, #f7f7fb 0%, #eef2f7 100%);
  min-height: 100vh;
  color: #0f172a;
  overflow-x: hidden;
  box-sizing: border-box;
}
.community-portal.is-loading {
  background: #f8fafc;
}

.portal-shell {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 12px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-x: hidden;
  box-sizing: border-box;
}
.portal-nav {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100vw;
  margin-left: calc(50% - 50vw);
  padding: 12px 16px;
  gap: 8px;
  min-height: 56px;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
  box-sizing: border-box;
}
.nav-back {
  border: none;
  background: transparent;
  color: #2563eb;
  font-weight: 700;
  font-size: 15px;
  padding: 6px 4px;
}
.nav-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 70%;
  text-align: center;
  font-weight: 800;
  font-size: 18px;
  color: #0f172a;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-placeholder {
  width: 80px;
  display: block;
}

.portal-theme-clean {
  --hero-overlay-from: rgba(255, 255, 255, 0.15);
  --hero-overlay-to: rgba(15, 23, 42, 0.35);
  background: linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%);
}
.portal-theme-immersive {
  --hero-overlay-from: rgba(15, 23, 42, 0.22);
  --hero-overlay-to: rgba(15, 23, 42, 0.55);
  background: linear-gradient(180deg, #0f172a 0%, #111827 20%, #0f172a 100%);
}

.portal-theme-warm {
  --hero-overlay-from: rgba(248, 180, 0, 0.35);
  --hero-overlay-to: rgba(249, 115, 22, 0.65);
  background: linear-gradient(180deg, #fff7ed 0%, #fed7aa 100%);
}

.portal-theme-collage {
  --hero-overlay-from: rgba(99, 102, 241, 0.32);
  --hero-overlay-to: rgba(15, 23, 42, 0.8);
  background: linear-gradient(180deg, #f5f3ff 0%, #eef2ff 100%);
}

.portal-skeleton {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.portal-skeleton__hero,
.portal-skeleton__card {
  border-radius: 16px;
  background: linear-gradient(90deg, #f4f6fb 25%, #e9edf7 37%, #f4f6fb 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}
.portal-skeleton__hero {
  height: 220px;
}
.portal-skeleton__card {
  height: 140px;
}
@keyframes shimmer {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: -135% 50%;
  }
}

.portal-hero {
  position: relative;
  min-height: 200px;
  border-radius: 0;
  overflow: hidden;
  background-size: cover;
  background-position: center;
  box-shadow: none;
  margin: 0;
  width: 100vw;
  left: 50%;
  transform: translateX(-50%);
}
.portal-hero__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, var(--hero-overlay-from), var(--hero-overlay-to));
  z-index: 0;
}
.portal-hero__content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 18px;
  text-align: center;
  z-index: 1;
}
.portal-hero__overlay-card {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #fff;
  text-align: center;
  padding: 20px;
}
.portal-hero__avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.8);
  overflow: hidden;
  background: rgba(0, 0, 0, 0.45);
  display: grid;
  place-items: center;
  font-size: 32px;
  font-weight: 800;
  color: #fff;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(3px);
}
.portal-hero__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.info-card {
  margin-top: -12px;
  background: #fff;
  border-radius: 16px;
  padding: 22px 18px 18px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.community-name {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  text-align: center;
  letter-spacing: -0.01em;
}
.info-tags {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}
.info-tags span {
  padding: 6px 12px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #0f172a;
  font-weight: 700;
  font-size: 13px;
}
.follow-btn {
  border: none;
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  font-weight: 700;
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.25);
}
.member-row {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-start;
  overflow: hidden;
}
.member-track {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.member-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #e2e8f0;
  display: grid;
  place-items: center;
  font-weight: 700;
  color: #0f172a;
  border: 1px solid #cbd5e1;
  overflow: hidden;
  flex-shrink: 0;
}
.member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.member-count {
  color: #475569;
  font-size: 13px;
  white-space: nowrap;
  margin-left: 6px;
}
.desc {
  margin: 0;
  color: #475569;
  line-height: 1.6;
  text-align: center;
}
.desc.truncated {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.toggle {
  border: none;
  background: transparent;
  color: #2563eb;
  font-weight: 700;
  align-self: center;
}

.events-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.news-card {
  background: #fff;
  border-radius: 16px;
  padding: 14px 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid #e2e8f0;
}
.news-card__head h2 {
  margin: 4px 0 0;
  font-size: 17px;
  font-weight: 800;
}
.news-card__marquee {
  overflow: hidden;
  position: relative;
  height: 72px;
  mask-image: linear-gradient(180deg, transparent 0%, #000 14%, #000 86%, transparent 100%);
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 14%, #000 86%, transparent 100%);
}
.news-card__track {
  display: flex;
  flex-direction: column;
  gap: 10px;
  animation: news-vertical 12s linear infinite;
}
.news-card__item {
  font-size: 14px;
  color: #0f172a;
  background: #f8fafc;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.news-card__item::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, #2563eb, #22c55e);
  flex-shrink: 0;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.08);
}
@keyframes news-vertical {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(-50%);
  }
}
.empty-panel {
  border: 1px dashed #cbd5f5;
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
}
.empty-panel span {
  display: block;
  margin-top: 4px;
  color: #94a3b8;
}

.event-gallery {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.event-gallery__head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.event-gallery__head h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
}
.count {
  padding: 4px 10px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #0f172a;
  font-weight: 700;
  font-size: 12px;
}
.event-gallery__track {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(240px, 1fr);
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 6px;
  -webkit-overflow-scrolling: touch;
}
.event-tile {
  border-radius: 14px;
  overflow: hidden;
  background: #0f172a;
  min-height: 180px;
  position: relative;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
}
.event-tile__cover {
  position: relative;
  inset: 0;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
}
.event-tile__shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.05) 20%, rgba(0, 0, 0, 0.65) 90%);
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 6px;
  padding: 16px;
}
.event-tile__title {
  font-weight: 800;
  font-size: 16px;
}
.event-tile__meta {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
}
.event-tile__status {
  align-self: flex-start;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #e2f3ff;
  background: rgba(255, 255, 255, 0.12);
}
.event-tile__status.closed {
  color: rgba(255, 255, 255, 0.82);
}

@media (min-width: 960px) {
  .portal-shell {
    padding: 0 28px 32px;
  }
  .portal-hero {
    min-height: 260px;
  }
  .community-name {
    font-size: 28px;
  }
  .slider-track {
    grid-auto-columns: minmax(280px, 1fr);
  }
}
</style>
