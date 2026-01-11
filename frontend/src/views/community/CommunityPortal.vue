<template>
<section class="community-portal" :class="[themeClass, { 'is-loading': loading }]">
    <div v-if="loading" class="portal-skeleton">
      <div class="portal-skeleton__hero"></div>
      <div class="portal-skeleton__card"></div>
      <div class="portal-skeleton__card"></div>
    </div>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <div v-else-if="community" class="portal-shell">
      <article v-if="showHero" class="portal-hero" :style="heroStyle">
        <button
          v-if="showConsoleBack"
          class="nav-back nav-back--overlay"
          type="button"
          aria-label="戻る"
          @click="goBack"
        >
          <img :src="backIcon" class="nav-back__icon" alt="" aria-hidden="true" />
        </button>
        <div class="portal-hero__overlay"></div>
        <div class="portal-hero__content">
          <div class="portal-hero__avatar" :style="avatarStyle">
            <img v-if="avatarSrc && !avatarFailed" :src="avatarSrc" alt="avatar" @error="onAvatarError" />
            <span v-else>{{ avatarInitial }}</span>
          </div>
        </div>
      </article>

      <article class="info-card">
        <div class="community-name-row">
          <h1 class="community-name">{{ community.name }}</h1>
          <button
            class="follow-tag"
            :class="{ 'is-following': following }"
            type="button"
            :disabled="followBusy"
            @click="toggleFollow"
          >
            {{ following ? 'フォロー中' : 'フォロー' }}
          </button>
        </div>
        <div class="info-tags" v-if="heroLabels.length">
          <span v-for="label in heroLabels" :key="label">#{{ label }}</span>
        </div>
        <p class="desc" :class="{ truncated: !descriptionExpanded }">
          {{ descriptionText }}
        </p>
        <button v-if="shouldTruncate" class="toggle" type="button" @click="descriptionExpanded = !descriptionExpanded">
          {{ descriptionExpanded ? '閉じる' : 'もっと見る' }}
        </button>
      </article>

      <article v-if="memberAvatars.length" class="member-card">
        <div class="member-row">
          <div class="member-track">
            <div v-for="member in memberAvatars" :key="member.id" class="member-avatar">
              <AppAvatar :src="member.avatarUrl" :name="member.name" :size="36" />
            </div>
          </div>
          <span class="member-count">{{ memberCount }} 人</span>
        </div>
      </article>

      <article v-if="showClassesEntry" class="portal-entry-card">
        <button class="portal-action-btn portal-action-btn--solo" type="button" @click="goClasses">
          <div class="portal-action__icon">
            <img :src="classIcon" alt="" loading="lazy" class="portal-action__icon-image" />
          </div>
          <div class="portal-action__body">
            <p class="portal-action__title">教室 / Classes</p>
            <p class="portal-action__desc">毎週の教室・講座の一覧</p>
          </div>
          <span v-if="classesCount !== null" class="badge">{{ classesCount }}</span>
          <span class="i-lucide-chevron-right"></span>
        </button>
      </article>

      <article class="news-card">
        <div class="section-head">
          <h2>ニュース</h2>
        </div>
        <ul v-if="interestedItems.length" class="timeline">
          <li
            v-for="(item, idx) in interestedItems"
            :key="`news-${idx}`"
            class="timeline__item"
            :class="{ 'is-clickable': Boolean(item.id) }"
            :role="item.id ? 'button' : undefined"
            :tabindex="item.id ? 0 : -1"
            @click="goEventById(item.id)"
            @keydown.enter.prevent="goEventById(item.id)"
            @keydown.space.prevent="goEventById(item.id)"
          >
            <span class="timeline__dot"></span>
            <div class="timeline__body">
              <p class="timeline__title">
                <span
                  class="flag"
                  :class="
                    item.statusState === 'open'
                      ? 'flag--open'
                      : item.statusState === 'closed'
                        ? 'flag--closed'
                        : 'flag--interest'
                  "
                >
                  {{ item.statusLabel }}
                </span>
                {{ item.title }}
              </p>
              <p class="timeline__meta">{{ item.meta }}</p>
            </div>
          </li>
        </ul>
        <p v-else class="news-empty">気になるイベントをフォローすると、ここに表示されます。</p>
      </article>

      <section v-if="showEvents" class="event-gallery">
        <div class="section-head">
          <h2>イベント</h2>
          <span class="count" v-if="formattedEvents.length">{{ formattedEvents.length }} 件</span>
        </div>
        <div class="event-list event-list--scroll" v-if="featuredEvents.length">
          <article
            v-for="event in featuredEvents"
            :key="event.id"
            class="event-card event-card--compact"
            :class="{ 'is-clickable': Boolean(event.id) }"
            :role="event.id ? 'button' : undefined"
            :tabindex="event.id ? 0 : -1"
            @click="goEvent(event)"
            @keydown.enter.prevent="goEvent(event)"
            @keydown.space.prevent="goEvent(event)"
          >
            <div class="event-card__cover" :style="eventCoverStyle(event)"></div>
            <div class="event-card__body">
              <span class="event-card__status" :class="event.statusClass">{{ event.statusLabel }}</span>
              <p class="event-card__date">{{ event.date }}</p>
              <p class="event-card__meta">{{ event.locationText || '場所未定' }}</p>
            </div>
          </article>
        </div>
        <div v-else class="empty-panel">
          <p>公開中のイベントはまだありません。</p>
          <span>フォローすると新しいイベントが届きます。</span>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  fetchCommunityBySlug,
  fetchCommunityClasses,
  fetchCommunityFollowStatus,
  followCommunity,
  unfollowCommunity,
} from '../../api/client';
import type { CommunityPortal } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { getEventStatus } from '../../utils/eventStatus';
import defaultCommunityImage from '../../assets/images/default-community.svg';
import { useResourceConfig } from '../../composables/useResourceConfig';
import { useAuth } from '../../composables/useAuth';
import { useToast } from '../../composables/useToast';
import { useFavorites } from '../../composables/useFavorites';
import AppAvatar from '../../components/common/AppAvatar.vue';
import backIcon from '../../assets/icons/arrow-back.svg';
import classIcon from '../../assets/class.svg';
import { isLineInAppBrowser } from '../../utils/liff';

const route = useRoute();
const router = useRouter();
const { accessToken, user, fetchCurrentUser } = useAuth();
const slug = computed(() => route.params.slug as string);
const community = ref<CommunityPortal | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const classesCount = ref<number | null>(null);
const resourceConfig = useResourceConfig();
const { slotMap } = resourceConfig;
const toast = useToast();
const { favorites } = useFavorites();

const heroFallbackImage = computed(
  () =>
    resourceConfig.getStringValue('mobile.communityPortal.heroImage') ||
    (slotMap['mobile.communityPortal.heroImage'].defaultValue as string) ||
    defaultCommunityImage,
);
const heroOverlay = computed(() => {
  if (themeName.value === 'clean') {
    return 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.35))';
  }
  if (themeName.value === 'warm') {
    return 'linear-gradient(180deg, rgba(255,247,237,0.18), rgba(254,215,170,0.45))';
  }
  return 'linear-gradient(180deg, rgba(15, 23, 42, 0.12), rgba(3, 7, 18, 0.35))';
});

const composeHeroBackground = (source: string, fallback: string) => {
  if (!source) {
    return `${heroOverlay.value}, url(${fallback})`;
  }
  if (/gradient/i.test(source) && source.includes('url(')) {
    return source;
  }
  if (source.includes('url(')) {
    return `${heroOverlay.value}, ${source}`;
  }
  if (/gradient/i.test(source)) {
    return source;
  }
  return `${heroOverlay.value}, url(${source})`;
};

const loadCommunity = async (value: string) => {
  if (!value) {
    error.value = 'コミュニティが見つかりません';
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const data = await fetchCommunityBySlug(value);
    community.value = data;
    following.value = Boolean(data.isFollowing);
    classesCount.value = null;
    if (data?.id) {
      try {
        const cls = await fetchCommunityClasses(data.id);
        classesCount.value = cls.length;
      } catch (err) {
        classesCount.value = 0;
        console.warn('load classes failed', err);
      }
    }
  } catch (err) {
    error.value = 'コミュニティが存在しないか、非公開です';
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
const descriptionText = computed(() => getLocalizedText(community.value?.description) || '紹介文は準備中です。');
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
const avatarStyle = computed(() => {
  const hasImage = avatarSrc.value && !avatarFailed.value;
  if (hasImage) {
    return {
      background: 'transparent',
    };
  }
  return {
    backgroundImage: `linear-gradient(135deg, rgba(79, 70, 229, 0.18), rgba(59, 130, 246, 0.28)), url(${defaultCommunityImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
});

const themeName = computed(() => {
  const configured = community.value?.portalConfig?.theme;
  const allowed = ['clean', 'immersive', 'warm', 'collage'];
  // デフォルトは clean を維持。immersive でもカバーが無いと背景が暗くなるため、カバーがある場合のみ許可する。
  if (configured === 'immersive' && !community.value?.coverImageUrl) {
    return 'clean';
  }
  return allowed.includes(configured ?? '') ? configured : 'clean';
});
const themeClass = computed(() => `portal-theme-${themeName.value}`);
const layoutOrder = computed(() => {
  const layout = community.value?.portalConfig?.layout;
  if (Array.isArray(layout) && layout.length) return layout;
  return ['hero', 'about', 'upcoming', 'past'];
});

const showHero = computed(() => layoutOrder.value.includes('hero'));
const showEvents = computed(() => layoutOrder.value.some((b) => ['upcoming', 'past'].includes(b)));
// デザイン上は多すぎると散らかるため、最大 5 件まで表示
const heroLabels = computed(() => (community.value?.labels ?? []).slice(0, 5));

const formattedEvents = computed(() =>
  (community.value?.events ?? []).map((event) => {
    const { state, label } = getEventStatus(event);
    return {
      ...event,
      title: getLocalizedText(event.title) || 'イベント',
      date: new Date(event.startTime).toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      statusLabel: label,
      statusState: state,
      statusClass: state === 'open' ? 'open' : 'closed',
    };
  }),
);

const upcomingEvents = computed(() => formattedEvents.value.filter((event) => event.statusState === 'open'));
const pastEvents = computed(() => formattedEvents.value.filter((event) => event.statusState !== 'open'));
const featuredEvents = computed(() => {
  const combined = [...upcomingEvents.value, ...pastEvents.value];
  return combined.slice(0, 3);
});
const memberAvatars = computed(() =>
  (community.value?.members ?? []).map((member) => ({
    id: member.id,
    name: member.name || '',
    avatarUrl: member.avatarUrl ? resolveAssetUrl(member.avatarUrl) : '',
    initial: (member.name || community.value?.name || '社').slice(0, 1),
  })),
);
const memberCount = computed(() => community.value?.memberCount ?? memberAvatars.value.length);
const interestedItems = computed(() => {
  if (!favorites.value.length) return [];
  const items = favorites.value.map((fav) => {
    const matched = formattedEvents.value.find((event) => event.id === fav.id);
    return {
      id: fav.id,
      title: fav.title,
      meta: fav.timeText || matched?.date || '日時未定',
      statusLabel: matched?.statusLabel ?? '気になる',
      statusState: matched?.statusState ?? 'interest',
    };
  });
  return items.slice(0, 4);
});
const eventCoverStyle = (event: any) => {
  const cover = event.coverImageUrl ? resolveAssetUrl(event.coverImageUrl as string) : heroFallbackImage.value;
  return {
    backgroundImage: `url(${cover})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
};
const showConsoleBack = computed(() => {
  if (isLineInAppBrowser()) return false;
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
    router.replace({ name: 'events' });
  }
};

const goEvent = (event: { id?: string | number }) => {
  if (!event?.id) return;
  router.push({ name: 'event-detail', params: { eventId: String(event.id) } });
};

const goEventById = (id?: string | null) => {
  if (!id) return;
  router.push({ name: 'event-detail', params: { eventId: String(id) } });
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

const goClasses = () => {
  router.push({ name: 'community-classes', params: { slug: route.params.slug } });
};

const showClassesEntry = computed(() => (classesCount.value ?? 0) > 0);

watch(
  () => community.value?.id,
  (val) => {
    if (val) loadFollow();
  },
);

const ensureAuthed = async () => {
  if (accessToken.value) return true;
  toast.show('フォローにはログインが必要です', { type: 'info' });
  router.push({ name: 'auth-login', query: { redirect: route.fullPath } });
  return false;
};

const toggleFollow = async () => {
  if (!community.value?.id) return;
  if (!(await ensureAuthed())) return;
  followBusy.value = true;
  const prev = following.value;
  try {
    if (prev) {
      const res = await unfollowCommunity(community.value.id);
      if (res.locked) {
        following.value = true;
        toast.show('コミュニティの設定によりフォロー解除ができません', { type: 'info' });
      } else {
        following.value = res.following;
      }
    } else {
      const res = await followCommunity(community.value.id);
      following.value = res.following;
    }
    await fetchCurrentUser();
  } catch (err) {
    following.value = prev;
    console.error(err);
    toast.show('処理に失敗しました。しばらくしてからお試しください。', { type: 'error' });
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
  background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 48%, #f8fafc 100%);
  min-height: 100vh;
  min-height: 100dvh;
  padding-bottom: env(safe-area-inset-bottom, 0px);
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
  padding: 0 12px calc(32px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 0;
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
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.nav-back--overlay {
  position: absolute;
  top: 14px;
  left: 16px;
  z-index: 2;
  border-radius: 12px;
  padding: 6px;
  background: rgba(15, 23, 42, 0.18);
  color: #fff;
  backdrop-filter: blur(6px);
}
.nav-back__icon {
  width: 20px;
  height: 20px;
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
  min-height: 240px;
  border-radius: 0 0 20px 20px;
  overflow: hidden;
  background-size: cover;
  background-position: center;
  box-shadow: none;
  margin: 0 -12px;
  width: calc(100% + 24px);
}
.portal-hero__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.05), rgba(15, 23, 42, 0.18));
  backdrop-filter: blur(2px);
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
  width: 76px;
  height: 76px;
  border-radius: 18px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
}
.portal-hero__avatar img,
.portal-hero__avatar span {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 50%;
}
.portal-hero__avatar span {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.18), rgba(59, 130, 246, 0.28));
  color: #0f172a;
  font-weight: 800;
}

.info-card {
  margin-top: 14px;
  background: #fff;
  border-radius: 18px;
  padding: 20px 18px 18px;
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.portal-entry-card {
  margin-top: 12px;
}
.portal-action-btn {
  width: 100%;
  border: 1px solid #e5e7eb;
  background: linear-gradient(135deg, #f8fafc, #f1f5f9);
  border-radius: 14px;
  padding: 12px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  font-weight: 700;
}
.portal-action-btn--solo {
  background: #fff;
  border-color: #e2e8f0;
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.1);
}
.portal-action__icon {
  width: 80px;
  height: 80px;
  border-radius: 12px;
  background: #eef2ff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #4338ca;
  font-size: 18px;
}
.portal-action__icon-image {
  width: 80px;
  height: 80px;
  display: block;
}
.portal-action__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
.portal-action__desc {
  margin: 2px 0 0;
  font-size: 12px;
  color: #6b7280;
}
.community-name-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
  text-align: center;
}
.community-name {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  text-align: center;
  letter-spacing: -0.01em;
}
.follow-tag {
  border: none;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
  cursor: pointer;
  white-space: nowrap;
}
.follow-tag.is-following {
  background: rgba(34, 197, 94, 0.16);
  color: #15803d;
}
.follow-tag:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.info-tags {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}
.info-tags span {
  padding: 4px 10px;
  border-radius: 999px;
  background: #edf2f7;
  color: #334155;
  font-weight: 600;
  font-size: 12px;
}
.member-card {
  margin-top: 12px;
  background: #fff;
  border-radius: 18px;
  padding: 16px 18px;
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.08);
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
  white-space: pre-wrap;
  word-break: break-word;
}
.desc.truncated {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: normal;
}
.toggle {
  border: none;
  background: transparent;
  color: #2563eb;
  font-weight: 700;
  align-self: center;
}

.news-card {
  margin-top: 16px;
  background: #fff;
  border-radius: 16px;
  padding: 16px 16px 18px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid #e2e8f0;
}
.section-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-head h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  color: #0f172a;
}
.timeline {
  list-style: none;
  margin: 0;
  padding: 4px 0 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.timeline__item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: flex-start;
}
.timeline__item.is-clickable {
  cursor: pointer;
}
.timeline__item.is-clickable:active .timeline__body {
  transform: translateY(1px);
}
.timeline__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4f46e5, #22c55e);
  box-shadow: 0 0 0 6px rgba(79, 70, 229, 0.08);
  margin-top: 6px;
}
.timeline__body {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 12px;
}
.timeline__title {
  margin: 0;
  font-weight: 700;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1.4;
}
.timeline__meta {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
}
.news-empty {
  margin: 4px 0 0;
  font-size: 13px;
  color: #64748b;
}
.flag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: #eef2ff;
  color: #3730a3;
}
.flag--open {
  background: #ecfdf3;
  color: #166534;
}
.flag--closed {
  background: #f1f5f9;
  color: #0f172a;
}
.flag--interest {
  background: #eef2ff;
  color: #3730a3;
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
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.count {
  padding: 4px 10px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #0f172a;
  font-weight: 700;
  font-size: 12px;
}
.event-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.event-list--scroll {
  flex-direction: row;
  overflow-x: auto;
  padding: 2px 12px 8px;
  margin: 0 -12px;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
}
.event-list--scroll::-webkit-scrollbar {
  display: none;
}
.event-card {
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}
.event-card--compact {
  flex: 0 0 220px;
  scroll-snap-align: start;
}
.event-card.is-clickable {
  cursor: pointer;
}
.event-card.is-clickable:active {
  transform: translateY(1px);
}
.event-card__cover {
  width: 100%;
  padding-top: 42%;
  background-size: cover;
  background-position: center;
}
.event-card--compact .event-card__cover {
  padding-top: 0;
  height: 120px;
}
.event-card__body {
  padding: 14px 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.event-card--compact .event-card__body {
  gap: 6px;
}
.event-card__status {
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: #ecfdf3;
  color: #166534;
}
.event-card__status.closed {
  background: #f1f5f9;
  color: #0f172a;
}
.event-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: #0f172a;
}
.event-card__date {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.event-card__meta {
  margin: 0;
  font-size: 13px;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (min-width: 960px) {
  .portal-shell {
    padding: 0 28px 32px;
  }
  .portal-hero {
    min-height: 320px;
    margin: 0 auto;
    width: 100%;
    border-radius: 0 0 24px 24px;
  }
  .community-name {
    font-size: 28px;
  }
}
</style>
