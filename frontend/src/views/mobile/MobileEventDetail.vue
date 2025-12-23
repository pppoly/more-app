<template>
  <div class="event-detail-page">
    <div v-if="loading" class="event-skeleton">
      <div class="skeleton-hero shimmer"></div>
      <div class="skeleton-content">
        <div class="skeleton-title shimmer"></div>
        <div class="skeleton-button-row">
          <span class="skeleton-button shimmer"></span>
          <span class="skeleton-button shimmer"></span>
        </div>
        <div class="skeleton-card shimmer"></div>
        <div class="skeleton-card shimmer"></div>
        <div class="skeleton-card skeleton-card--short shimmer"></div>
      </div>
    </div>
    <div v-else-if="error" class="event-state error">{{ error }}</div>

    <template v-else-if="detail">
      <main class="m-event-content event-content--with-footer">
        <section class="event-hero">
          <div class="event-hero__overlay">
            <button
              v-if="showBackButton"
              class="event-back-btn"
              type="button"
              aria-label="戻る"
              @click="goBack"
            >
              <img :src="backIcon" class="event-back-icon" alt="" aria-hidden="true" />
            </button>
            <div class="overlay-spacer"></div>
          </div>
          <div class="event-cover-wrapper" :style="heroBackgroundStyle" @click="openActiveImage">
            <div
              class="event-carousel"
              @touchstart.passive="handleTouchStart"
              @touchmove.passive="handleTouchMove"
              @touchend="handleTouchEnd"
              @touchcancel="handleTouchEnd"
            >
              <div
                v-for="(slide, index) in heroSlides"
                :key="slide.id || slide.imageUrl || index"
                class="event-carousel__slide"
                :class="{ 'is-active': index === activeSlide }"
              >
                <img
                  :src="coverSrc(slide, index)"
                  class="event-cover"
                  :alt="`event cover ${index + 1}`"
                  @error="markCoverBroken(slide, index)"
                />
              </div>
              <button
                v-if="heroSlides.length > 1"
                class="carousel-nav carousel-nav--prev"
                type="button"
                @click="goPrevSlide"
              >
                <span class="i-lucide-chevron-left"></span>
              </button>
              <button
                v-if="heroSlides.length > 1"
                class="carousel-nav carousel-nav--next"
                type="button"
                @click="goNextSlide"
              >
                <span class="i-lucide-chevron-right"></span>
              </button>
              <div v-if="heroSlides.length > 1" class="carousel-dots">
                <button
                  v-for="(slide, index) in heroSlides"
                  :key="slide.id || slide.imageUrl || `dot-${index}`"
                  class="carousel-dot"
                  :class="{ 'is-active': index === activeSlide }"
                  @click="setSlide(index)"
                ></button>
              </div>
            </div>
          </div>
          <div class="event-hero-info">
            <h1 class="m-text-event-title-main">{{ detail.title }}</h1>
            <div class="event-hero-meta">
              <div class="event-hero-meta__left">
                <span class="event-status-badge" :class="statusBadge.variant">{{ statusBadge.label }}</span>
              </div>
              <div v-if="showHeaderActions" class="event-hero-actions">
                <button class="event-action-icon" type="button" @click="shareEvent">
                  <img :src="shareIcon" alt="share" class="event-action-icon__img" />
                </button>
                <button
                  class="event-action-icon"
                  :class="{ 'is-active': isFavoriteEvent }"
                  type="button"
                  @click="handleFavoriteToggle"
                >
                  <img :src="followIcon" alt="follow" class="event-action-icon__img" />
                </button>
              </div>
            </div>
            <p v-if="uiMessage" class="event-hero-toast">{{ uiMessage }}</p>
          </div>
        </section>

        <div class="m-chip-row" v-if="dateOptions.length > 1">
          <button
            v-for="option in dateOptions"
            :key="option.id"
            class="m-chip"
            :class="{ 'is-active': option.id === selectedDateId }"
            @click="selectedDateId = option.id"
          >
            {{ option.label }}
          </button>
        </div>

        <section class="m-event-card event-meta-card">
          <div class="event-schedule-block">
            <div class="event-meta-row event-meta-row--schedule">
              <div class="event-meta-icon event-meta-icon--date" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <rect x="2.5" y="3.5" width="15" height="13.5" rx="2.6" stroke="currentColor" stroke-width="2" />
                  <path d="M2.5 7.5h15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  <path d="M6 2.5v3.5M14 2.5v3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </div>
              <div
                class="event-schedule"
                :class="{ 'is-clickable': Boolean(calendarLink) }"
                :role="calendarLink ? 'button' : undefined"
                :tabindex="calendarLink ? 0 : -1"
                @click="openCalendar"
                @keydown.enter.prevent="openCalendar"
                @keydown.space.prevent="openCalendar"
              >
                <p class="event-schedule__line" :title="scheduleLine">
                  {{ scheduleLine }}
                </p>
              </div>
              <span v-if="isMultiDay" class="event-schedule__badge">複数日程</span>
            </div>
          </div>
          <div class="m-divider"></div>
          <div
            class="event-meta-row event-meta-row--location"
            :class="{ 'is-clickable': Boolean(detail.mapUrl) }"
            :role="detail.mapUrl ? 'button' : undefined"
            :tabindex="detail.mapUrl ? 0 : -1"
            @click="openMap"
            @keydown.enter.prevent="openMap"
            @keydown.space.prevent="openMap"
          >
            <div class="event-meta-icon event-meta-icon--address" aria-hidden="true">〒</div>
            <div class="event-meta-text">
              <div class="event-location-title">{{ detail.locationText }}</div>
            </div>
          </div>
        </section>

        <section class="event-section" v-if="shouldShowParticipants">
          <div class="m-event-card">
          <div class="event-progress-head">
              <span>{{ detail.capacityText }}</span>
          </div>
            <div class="event-progress">
              <div class="event-progress__bar" :style="{ width: `${detail.regProgress}%` }"></div>
            </div>
            <div class="participant-wall" v-if="participantPreview.length">
              <div class="participant-avatars">
                <button
                  v-for="participant in participantPreview"
                  :key="participant.id || participant.name"
                  class="participant-avatar"
                  type="button"
                  @click="openAllParticipants"
                >
                  <AppAvatar :src="participant.avatarUrl" :name="participant.name" :size="40" />
                  <span class="sr-only">{{ participant.name }}</span>
                </button>
                <button
                  v-if="hasMoreParticipants"
                  class="participant-more"
                  type="button"
                  @click="openAllParticipants"
                >
                  +{{ remainingParticipants }}
                </button>
              </div>
            </div>
            <p v-else class="participants-empty">まだ参加者はいません。最初の参加者になりませんか？</p>
          </div>
        </section>

        <section class="event-section">
          <div class="m-event-card event-group-card">
            <div class="group-main">
              <button class="group-info" type="button" @click="openCommunityPortal" :disabled="!detail.communitySlug">
                <div class="group-avatar" :style="groupAvatarStyle"></div>
                <div class="group-text">
                  <div class="group-name">{{ detail.hostName }}</div>
                  <div class="m-text-meta">最新ニュースとイベント情報</div>
                </div>
              </button>
              <button
                class="group-follow"
                :class="{ 'is-active': isFollowingCommunity, 'is-locked': followLocked }"
                type="button"
                :disabled="followLocked"
                @click="toggleFollow"
              >
                <span v-if="followLocked" class="i-lucide-lock"></span>
                <span v-else-if="isFollowingCommunity" class="i-lucide-bell-minus"></span>
                <span v-else class="i-lucide-bell-plus"></span>
                {{ followLocked ? 'メンバー' : isFollowingCommunity ? 'フォロー中' : 'フォロー' }}
              </button>
            </div>
          </div>
        </section>

        <section class="event-section">
          <div class="m-event-card event-about">
            <div class="event-about__header">About</div>
            <div class="event-about__divider" aria-hidden="true"></div>
            <div
              class="m-text-body prose prose-sm max-w-none event-about__content"
              v-html="detail.descriptionHtml"
              @click="handleAboutClick"
            ></div>
          </div>
        </section>

        <section class="event-section" v-if="formFields.length">
          <h2 class="m-section-title">申込時の必須情報</h2>
          <div class="m-event-card">
            <ul class="event-requirements">
              <li v-for="(field, idx) in formFields" :key="fieldKey(field, idx)">・{{ field.label }}</li>
            </ul>
          </div>
        </section>
      </main>

      <footer class="event-footer">
        <div class="price-block">
          <p class="price">{{ detail.priceText }}</p>
        </div>
        <button class="rails-cta" type="button" :disabled="isCtaDisabled" @click="handleCtaClick">
          <span>{{ ctaLabel }}</span>
        </button>
        <p v-if="ctaHint && isCtaHintVisible" class="cta-hint">{{ ctaHint }}</p>
        <pre v-if="showDebug" class="debug-state">{{ debugText }}</pre>
      </footer>

      <Transition name="fade">
        <div v-if="previewImage" class="image-preview" @click.self="previewImage = null">
          <button class="preview-close" type="button" @click="previewImage = null"><span class="i-lucide-x"></span></button>
          <img :src="previewImage" alt="preview" />
        </div>
      </Transition>
    </template>

    <div v-if="showAllParticipants" class="participant-backdrop" @click.self="closeAllParticipants">
      <div class="participant-sheet" @click.stop>
        <div class="participant-sheet__handle"></div>
        <div class="participant-sheet__header">
          <h3>参加者一覧</h3>
          <button class="participant-close" type="button" @click="closeAllParticipants">
            <span class="i-lucide-x text-lg"></span>
          </button>
        </div>
        <div class="participant-sheet__body">
          <ul class="participant-list">
            <li
              v-for="participant in participantsList"
              :key="participant.id || participant.name"
              class="participant-list__item"
            >
              <div class="participant-list__avatar">
                <AppAvatar :src="participant.avatarUrl" :name="participant.name" :size="40" />
              </div>
              <div class="participant-list__name">{{ participant.name || 'ゲスト' }}</div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  createMockPayment,
  createRegistration,
  createStripeCheckout,
  fetchEventById,
  fetchEventGallery,
  fetchMyEvents,
  fetchCommunityFollowStatus,
  followCommunity,
  unfollowCommunity,
} from '../../api/client';
import type {
  EventDetail,
  EventGalleryItem,
  EventRegistrationSummary,
  MyEventItem,
  RegistrationFormField,
} from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { getEventCategoryLabel } from '../../utils/eventCategory';
import { useAuth } from '../../composables/useAuth';
import Button from '../../components/ui/Button.vue';
import { useFavorites } from '../../composables/useFavorites';
import { useResourceConfig } from '../../composables/useResourceConfig';
import { useLocale } from '../../composables/useLocale';
import { APP_TARGET, LIFF_ID } from '../../config';
import { isLineInAppBrowser, loadLiff } from '../../utils/liff';
import { trackEvent } from '../../utils/analytics';
import { MOBILE_EVENT_PENDING_PAYMENT_KEY } from '../../constants/mobile';
import backIcon from '../../assets/icons/arrow-back.svg';
import shareIcon from '../../assets/share.svg';
import followIcon from '../../assets/follow.svg';
import AppAvatar from '../../components/common/AppAvatar.vue';

const route = useRoute();
const router = useRouter();
const { user } = useAuth();
const favoritesStore = useFavorites();
const { preferredLangs } = useLocale();
const currencyFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

const event = ref<EventDetail | null>(null);
const gallery = ref<EventGalleryItem[]>([]);
const brokenCovers = ref<Record<string, boolean>>({});

const resourceConfig = useResourceConfig();
const { slotMap } = resourceConfig;
const fallbackCover = computed(
  () =>
    resourceConfig.getStringValue('mobile.eventDetail.heroFallback') ||
    (slotMap['mobile.eventDetail.heroFallback'].defaultValue as string),
);
const defaultAvatarImage = computed(
  () =>
    resourceConfig.getStringValue('global.defaultAvatar') ||
    (slotMap['global.defaultAvatar'].defaultValue as string),
);
const loading = ref(true);
const error = ref<string | null>(null);
const registrationError = ref<string | null>(null);
const showBooking = ref(false);
const agree = ref(false);
const submitting = ref(false);
const pendingPayment = ref<{ registrationId: string; amount?: number } | null>(null);
const paymentMessage = ref<string | null>(null);
const isPaying = ref(false);
const isRedirecting = ref(false);
const formValues = reactive<Record<string, any>>({});
const previewImage = ref<string | null>(null);
const selectedDateId = ref<string | null>(null);
const activeSlide = ref(0);
const registrationItem = ref<MyEventItem | null>(null);
const checkingRegistration = ref(false);
const registrationStatusRaw = computed(() => registrationItem.value?.status ?? 'none');
const refundRequest = computed(() => registrationItem.value?.refundRequest ?? null);
const showBackButton = computed(() => !isLineInAppBrowser());

const eventId = computed(() => route.params.eventId as string);
const isLoggedIn = computed(() => Boolean(user.value));

const requiresApproval = computed(() => {
  if (!event.value) return false;
  const config = (event.value.config as Record<string, any>) ?? {};
  return Boolean(event.value.requireApproval ?? config.requireApproval);
});

const capacityState = computed(() => {
  if (!event.value) {
    return { capacity: null, currentParticipants: 0, enableWaitlist: false, isFull: false };
  }
  const config = (event.value.config as Record<string, any>) ?? {};
  const capacityRaw =
    typeof event.value.maxParticipants === 'number'
      ? event.value.maxParticipants
      : typeof config.capacity === 'number'
        ? config.capacity
        : typeof config.maxParticipants === 'number'
          ? config.maxParticipants
          : null;
  const capacity = typeof capacityRaw === 'number' && Number.isFinite(capacityRaw) ? capacityRaw : null;
  const currentRaw = config.currentParticipants ?? config.currentAttendees ?? config.regCount ?? 0;
  const currentParticipants = Number.isFinite(Number(currentRaw)) ? Number(currentRaw) : 0;
  const enableWaitlist = Boolean(config.enableWaitlist);
  const isFull = capacity !== null && capacity > 0 ? currentParticipants >= capacity : false;
  return { capacity, currentParticipants, enableWaitlist, isFull };
});

const formFields = computed<RegistrationFormField[]>(() => (event.value?.registrationFormSchema as RegistrationFormField[]) ?? []);
const isFavoriteEvent = computed(() => {
  const currentId = detail.value?.id;
  if (!currentId) return false;
  return favoritesStore.isFavorite(currentId);
});
const hasRegistration = computed(() => Boolean(registrationItem.value));
const registrationStatus = computed(() => {
  const raw = registrationStatusRaw.value;
  switch (raw) {
    case 'pending_payment':
      return 'pending_payment';
    case 'pending':
      return 'pending';
    case 'paid':
    case 'approved':
      return 'paid';
    case 'pending_refund':
      return 'cancel_requested';
    case 'refunded':
      return 'cancelled';
    case 'cancel_requested':
      return 'cancel_requested';
    case 'cancelled':
      return 'cancelled';
    default:
      return raw || 'none';
  }
});
const legacyRefund = computed(() => !refundRequest.value && ['refunded', 'pending_refund'].includes(registrationStatusRaw.value));
const refundState = computed(() => {
  const req = refundRequest.value;
  if (req?.status === 'requested') return 'requested';
  if (req?.status === 'processing') return 'processing';
  if (req?.status === 'completed') {
    if (req.decision === 'approve_partial' || (req.approvedAmount ?? 0) > 0) return 'completed_partial';
    return 'completed';
  }
  if (req?.status === 'rejected') return 'rejected';
  const raw = registrationStatusRaw.value;
  if (raw === 'pending_refund') return 'processing';
  if (raw === 'refunded') return 'completed';
  return null;
});
const eventLifecycle = computed(() => {
  const ev = event.value;
  if (!ev) return 'scheduled';
  if (ev.status === 'cancelled') return 'cancelled';
  const now = new Date();
  const start = new Date(ev.startTime);
  const end = ev.endTime ? new Date(ev.endTime) : null;
  if (now < start) return 'scheduled';
  if (end && now > end) return 'ended';
  return 'ongoing';
});
const resolveRegistrationWindow = (ev: EventDetail | null) => {
  if (!ev) return { open: false, reason: null as string | null };
  if (ev.status !== 'open') return { open: false, reason: '受付は終了しています。' };
  const now = new Date();
  const regStart = ev.regStartTime ? new Date(ev.regStartTime) : null;
  const regEndRaw = ev.regEndTime ?? ev.regDeadline ?? null;
  const regEnd = regEndRaw ? new Date(regEndRaw) : null;
  if (regStart && now < regStart) return { open: false, reason: '申込開始前です。' };
  if (regEnd && now > regEnd) return { open: false, reason: '申込受付は終了しました。' };
  return { open: true, reason: null };
};
const registrationWindowState = computed(() => resolveRegistrationWindow(event.value));
const registrationWindow = computed(() => (registrationWindowState.value.open ? 'open' : 'closed'));

const refundHint = computed(() => {
  if (eventLifecycle.value === 'cancelled') {
    return 'イベントはキャンセルされました。必要に応じて返金が進行します。';
  }
  if (refundState.value === 'processing') return '返金処理中：完了までお待ちください。';
  if (refundState.value === 'completed') return '返金済み：数日内に口座へ反映されます。';
  if (refundState.value === 'completed_partial') return '部分返金が完了しました。';
  if (refundState.value === 'rejected') return '返金は認められませんでした。';
  if (legacyRefund.value) return '旧データによる返金状態です。';
  return '';
});

const computeCtaState = () => {
  if (!detail.value) {
    return { label: '読み込み中…', disabled: true, hint: '' };
  }
  if (eventLifecycle.value === 'cancelled') {
    return { label: '中止しました', disabled: true, hint: 'イベントはキャンセルされました。' };
  }
  if (registrationStatus.value === 'pending_payment') {
    return { label: '支払いへ進む', disabled: false, hint: 'お支払い待ちです。' };
  }
  if (registrationStatus.value === 'pending') {
    return { label: '予約済み', disabled: true, hint: '主催者の承認をお待ちください。' };
  }
  if (registrationStatus.value === 'paid') {
    return { label: '参加チケットを見る', disabled: false, hint: refundHint.value };
  }
  if (registrationStatus.value === 'cancel_requested') {
    const hint =
      eventLifecycle.value === 'ongoing'
        ? '開催中のため返金なしの場合があります。主催者の確認をお待ちください。'
        : '主催者の確認をお待ちください。';
    return { label: 'キャンセル申請中', disabled: true, hint };
  }
  if (registrationStatus.value === 'cancelled') {
    const canReapply = registrationWindow.value === 'open';
    return {
      label: canReapply ? 'もう一度参加する' : 'キャンセル済み',
      disabled: !canReapply,
      hint: canReapply ? '再申込できます。' : '受付は終了しています。',
    };
  }
  if (legacyRefund.value) {
    return { label: '返金処理済み', disabled: true, hint: '旧データによる返金状態です。' };
  }
  if (!isLoggedIn.value) {
    return { label: requiresApproval.value ? 'ログインして予約する' : 'ログインして申し込む', disabled: false, hint: '' };
  }
  if (eventLifecycle.value === 'ended') {
    return { label: '終了しました', disabled: true, hint: 'イベントは終了しました。' };
  }
  if (!registrationWindowState.value.open) {
    const label = registrationWindowState.value.reason?.includes('開始前') ? '受付開始前' : '受付終了';
    return { label, disabled: true, hint: registrationWindowState.value.reason ?? '' };
  }
  if (capacityState.value.isFull) {
    if (capacityState.value.enableWaitlist) {
      return {
        label: 'キャンセル待ちで申し込む',
        disabled: true,
        hint: '満席のためキャンセル待ちのみ受付中です。',
      };
    }
    return { label: '満席', disabled: true, hint: '定員に達しました。' };
  }
  const canApply = registrationWindow.value === 'open';
  return {
    label: canApply ? (requiresApproval.value ? '今すぐ予約する' : '今すぐ申し込む') : '受付終了',
    disabled: !canApply,
    hint: canApply ? '' : registrationWindowState.value.reason ?? '',
  };
};
const ctaState = computed(computeCtaState);
const ctaLabel = computed(() => ctaState.value.label);
const isCtaDisabled = computed(() => ctaState.value.disabled || checkingRegistration.value);
const debugState = computed(() => ({
  eventLifecycle: eventLifecycle.value,
  registrationWindow: registrationWindow.value,
  regStatus: registrationStatus.value,
  refundState: refundState.value ?? 'none',
  refundRequestStatus: refundRequest.value?.status ?? 'none',
  eligibleRefundAmount: refundRequest.value?.approvedAmount ?? refundRequest.value?.requestedAmount ?? registrationItem.value?.amount ?? null,
}));
const showDebug = computed(() => route.query.debug === '1');
const debugText = computed(() => JSON.stringify(debugState.value, null, 2));

const detail = computed(() => {
  if (!event.value) return null;
  const start = formatDate(event.value.startTime);
  const end = event.value.endTime ? formatDate(event.value.endTime) : '未定';
  const config = (event.value.config as Record<string, any>) ?? {};
  const currentParticipants = Math.max(
    0,
    Number(config.currentParticipants ?? config.currentAttendees ?? config.regCount ?? 0),
  );
  const capacity = typeof event.value.maxParticipants === 'number' ? event.value.maxParticipants : config.capacity ?? null;
  const regProgress =
    capacity && capacity > 0 ? Math.min(100, Math.round((currentParticipants / capacity) * 100)) : 0;
  const attendeeAvatars: string[] = Array.isArray(config.attendeeAvatars) ? config.attendeeAvatars : [];
  const participantsRaw: Array<{ id?: string; name?: string; avatarUrl?: string }> = Array.isArray(config.participants)
    ? config.participants
    : [];
  const participants =
    participantsRaw.length > 0
      ? participantsRaw
      : attendeeAvatars.map((url: string, index: number) => ({
          id: `avatar-${index}`,
          name: `参加者${index + 1}`,
          avatarUrl: url,
        }));
  const normalizedParticipants = participants.map((p, index) => ({
    id: p.id ?? `participant-${index}`,
    name: p.name ?? 'ゲスト',
    avatarUrl: p.avatarUrl ? resolveAssetUrl(p.avatarUrl) : '',
  }));
  const participantCount =
    config.participantCount ??
    config.participants?.length ??
    attendeeAvatars.length ??
    (capacity ? Math.min(currentParticipants, capacity) : currentParticipants);
  const derivePriceText = () => {
    if (!event.value?.ticketTypes?.length) return '無料 / 未定';
    const prices = event.value.ticketTypes.map((ticket) => ticket.price ?? 0);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (max === 0) return '無料';
    if (min === max) return currencyFormatter.format(max);
    return `${currencyFormatter.format(min)} 〜 ${currencyFormatter.format(max)}`;
  };
  return {
    id: event.value.id,
    status: event.value.status,
    registrationStatus: registrationStatus.value,
    startTime: event.value.startTime,
    endTime: event.value.endTime,
    title: getLocalizedText(event.value.title, preferredLangs.value),
    categoryLabel: getEventCategoryLabel(event.value.category, 'イベント'),
    timeFullText: `${start} 〜 ${end}`,
    locationText: event.value.locationText,
    coverUrl:
      gallery.value[0]?.imageUrl ||
      (event.value.coverImageUrl ? resolveAssetUrl(event.value.coverImageUrl) : null) ||
      fallbackCover.value,
    capacityText: capacity ? `定員 ${capacity}名・現在 ${currentParticipants}名` : `現在 ${currentParticipants}名`,
    regProgress,
    priceText: event.value.config?.priceText ?? derivePriceText(),
    hostName: event.value.community?.name ?? 'SOCIALMORE Community',
    communitySlug: event.value.community?.slug ?? null,
    communityAvatar:
      resolveAssetUrl(
        config.communityLogoUrl ||
          (event.value.community as any)?.coverImageUrl ||
          config.communityLogo ||
          config.communityAvatar,
      ) || defaultAvatarImage.value,
    descriptionHtml:
      event.value.descriptionHtml ??
      `<p>${getLocalizedText(event.value.description ?? event.value.title, preferredLangs.value)}</p>`,
    mapUrl:
      typeof event.value.locationLat === 'number' && typeof event.value.locationLng === 'number'
        ? `https://www.google.com/maps/dir/?api=1&destination=${event.value.locationLat},${event.value.locationLng}`
        : event.value.locationText
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.value.locationText)}`
          : null,
    participantCount,
    showParticipants: config.showRegistrationStatus !== false,
    config,
    participants: normalizedParticipants,
  };
});

const slideKey = (slide: { id?: string; imageUrl?: string }, index: number) =>
  slide.id || slide.imageUrl || `slide-${index}`;

const coverSrc = (slide: { id?: string; imageUrl?: string }, index: number) =>
  brokenCovers.value[slideKey(slide, index)] ? fallbackCover.value : slide.imageUrl || fallbackCover.value;

const heroSlides = computed(() => {
  if (gallery.value.length) {
    return gallery.value.map((item, index) => ({
      id: item.id ?? `gallery-${index}`,
      imageUrl: item.imageUrl,
    }));
  }
  const fallback = detail.value?.coverUrl || fallbackCover.value;
  return [{ id: 'cover', imageUrl: fallback }];
});

const activeSlideImage = computed(() => {
  if (!heroSlides.value.length) return detail.value?.coverUrl ?? fallbackCover.value;
  const slide = heroSlides.value[activeSlide.value] ?? heroSlides.value[0];
  const index = Math.max(heroSlides.value.indexOf(slide), 0);
  return coverSrc(slide, index);
});

const heroBackgroundStyle = computed(() =>
  activeSlideImage.value
    ? {
        backgroundImage: `url(${activeSlideImage.value})`,
      }
    : {},
);

const calendarLink = computed(() => {
  if (!detail.value || !event.value?.startTime) return '';
  const start = formatCalendarDate(event.value.startTime);
  const end = formatCalendarDate(event.value.endTime ?? event.value.startTime);
  if (!start || !end) return '';
  const title = encodeURIComponent(detail.value.title);
  const location = encodeURIComponent(detail.value.locationText ?? '');
  const description = encodeURIComponent(
    getLocalizedText(event.value.description ?? event.value.title, preferredLangs.value) ?? detail.value.title,
  );
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&location=${location}&details=${description}`;
});

const dateOptions = computed(() => {
  if (!event.value) return [];
  const baseOption = {
    id: event.value.id,
    label: formatLongDate(event.value.startTime),
    meta: formatTimeRange(event.value.startTime, event.value.endTime),
    start: event.value.startTime,
    end: event.value.endTime ?? undefined,
  };
  const occurrences = ((event.value as any).occurrences ?? event.value.config?.occurrences) || [];
  const extra = Array.isArray(occurrences)
    ? occurrences.map((occ: any, index: number) => {
        const start = occ.start ?? occ.startTime ?? event.value?.startTime;
        const end = occ.end ?? occ.endTime ?? event.value?.endTime ?? undefined;
        return {
          id: `occ-${index}`,
          label: formatLongDate(start),
          meta: formatTimeRange(start, end),
          start,
          end,
        };
      })
    : [];
  return [baseOption, ...extra];
});

watch(
  dateOptions,
  (options) => {
    if (options.length && !selectedDateId.value) {
      selectedDateId.value = options[0].id;
    }
  },
  { immediate: true },
) ;

const selectedDateMeta = computed(
  () => dateOptions.value.find((opt) => opt.id === selectedDateId.value) ?? dateOptions.value[0],
);
const scheduleLine = computed(() => {
  const start = selectedDateMeta.value?.start ?? event.value?.startTime;
  if (!start) {
    return detail.value?.timeFullText ?? '';
  }
  const end = selectedDateMeta.value?.end ?? event.value?.endTime;
  return formatScheduleLine(start, end);
});
const favoritePayload = computed(() => {
  if (!detail.value) return null;
  return {
    id: detail.value.id,
    title: detail.value.title,
    coverUrl: detail.value.coverUrl,
    timeText: detail.value.timeFullText,
    locationText: detail.value.locationText,
  };
});

const isMultiDay = computed(() => {
  if (!event.value?.startTime || !event.value?.endTime) return false;
  const start = new Date(event.value.startTime);
  const end = new Date(event.value.endTime);
  return start.toDateString() !== end.toDateString();
});

const statusBadge = computed(() => {
  if (!event.value) return { label: '読み込み中…', variant: 'is-closed' };
  if (eventLifecycle.value === 'cancelled') return { label: '中止', variant: 'is-closed' };
  if (eventLifecycle.value === 'ended') return { label: '終了', variant: 'is-closed' };
  if (!registrationWindowState.value.open) {
    const label = registrationWindowState.value.reason?.includes('開始前') ? '受付前' : '受付終了';
    return { label, variant: 'is-closed' };
  }
  if (capacityState.value.isFull) {
    return { label: '満席', variant: 'is-soldout' };
  }
  return { label: '受付中', variant: 'is-live' };
});

const shouldShowParticipants = computed(() => Boolean(detail.value?.showParticipants));
const participantsList = computed(() => detail.value?.participants ?? []);
const participantsTotal = computed(() => detail.value?.participantCount ?? participantsList.value.length ?? 0);
const participantPreview = computed(() => participantsList.value.slice(0, 20));
const hasMoreParticipants = computed(() => participantsList.value.length > participantPreview.value.length);
const remainingParticipants = computed(() => Math.max(participantsList.value.length - participantPreview.value.length, 0));

const ctaHint = computed(() => ctaState.value.hint ?? '');
const isCtaHintVisible = ref(false);

watch(ctaHint, (value, _prev, onInvalidate) => {
  if (!value) {
    isCtaHintVisible.value = false;
    return;
  }

  isCtaHintVisible.value = true;
  const timer = window.setTimeout(() => {
    isCtaHintVisible.value = false;
  }, 3000);

  onInvalidate(() => window.clearTimeout(timer));
});
const showAllParticipants = ref(false);

const loadEvent = async () => {
  if (!eventId.value) return;
  loading.value = true;
  error.value = null;
  try {
    const [detailData, galleryData] = await Promise.all([fetchEventById(eventId.value), fetchEventGallery(eventId.value)]);
    event.value = detailData;
    gallery.value = galleryData;
    await loadFollowState();
    trackEvent('view_event_detail', { eventId: detailData.id });
  } catch (err) {
    error.value = 'イベント情報の読み込みに失敗しました。時間をおいて再試行してください。';
  } finally {
    loading.value = false;
  }
};

watch(
  () => registrationStatus.value,
  (val) => {
    if (val !== 'pending_payment') {
      sessionStorage.removeItem(MOBILE_EVENT_PENDING_PAYMENT_KEY);
    }
  },
);

const checkRegistrationStatus = async () => {
  if (!user.value || !eventId.value) {
    registrationItem.value = null;
    return;
  }
  checkingRegistration.value = true;
  try {
    const myEvents = await fetchMyEvents();
    registrationItem.value = myEvents.find((item) => item.event.id === eventId.value) ?? null;
  } catch {
    registrationItem.value = null;
  } finally {
    checkingRegistration.value = false;
  }
};

watch(
  () => heroSlides.value.length,
  () => {
    activeSlide.value = 0;
  },
);

const fallbackRoute = computed(() =>
  detail.value?.communitySlug
    ? { name: 'community-portal', params: { slug: detail.value.communitySlug } }
    : { name: 'events' },
);

const canGoBack = () => {
  if (typeof window === 'undefined') return false;
  const historyState = router.options?.history?.state as { back?: string } | undefined;
  return Boolean((historyState && historyState.back) || window.history.length > 1);
};

const goBack = () => {
  if (canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallbackRoute.value);
};

const shareEvent = async () => {
  if (!detail.value) return;
  const liffDeepLink = LIFF_ID
    ? `https://liff.line.me/${LIFF_ID}?to=/events/${detail.value.id}`
    : typeof window !== 'undefined'
      ? `${window.location.origin}/events/${detail.value.id}`
      : '';
  const shareUrl = `${liffDeepLink}?from=line_share`;
  const shareTitle =
    getLocalizedText(detail.value.title, preferredLangs.value) ||
    (typeof detail.value.title === 'string' ? detail.value.title : 'イベント');

  if (APP_TARGET === 'liff') {
    if (!LIFF_ID) {
      showUiMessage('LINE 設定を確認してください');
      return;
    }
    try {
      const liff = await loadLiff(LIFF_ID);
      if (liff.shareTargetPicker) {
        await liff.shareTargetPicker([{ type: 'text', text: `${shareTitle}\n${shareUrl}` }]);
        showUiMessage('LINE で共有しました');
        return;
      }
      // fallback: copy link
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        showUiMessage('リンクをコピーしました');
        return;
      }
    } catch (err) {
      console.error('Failed to share via LIFF', err);
      showUiMessage('LINE 共有に失敗しました');
      return;
    }
    return;
  }

  const payload = { title: shareTitle, url: shareUrl };

  // 1) ネイティブ共有（優先）
  if (navigator.share) {
    try {
      await navigator.share(payload);
      showUiMessage('共有しました');
      return;
    } catch {
      // ignore and fallback to LINE
    }
  }

  // 2) LINE 共有ページ（Web）
  const lineShareUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(payload.url)}`;
  window.open(lineShareUrl, '_blank');
  showUiMessage('LINE で開きました');

  // 3) 追加のフォールバックとしてコピー
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload.url);
    }
  } catch {
    // ignore
  }
};

let uiMessageTimer: number | null = null;
const uiMessage = ref('');

const showUiMessage = (text: string) => {
  uiMessage.value = text;
  if (uiMessageTimer) {
    window.clearTimeout(uiMessageTimer);
  }
  uiMessageTimer = window.setTimeout(() => {
    uiMessage.value = '';
  }, 2000);
};

const handleFavoriteToggle = () => {
  if (!detail.value || !favoritePayload.value) return;
  if (!isLoggedIn.value) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('favorite:redirect', route.fullPath);
      window.localStorage.setItem('favorite:data', JSON.stringify(favoritePayload.value));
    }
    router.push({ name: 'organizer-apply', query: { redirect: route.fullPath } });
    return;
  }
  favoritesStore.toggleFavorite(favoritePayload.value);
  showUiMessage(isFavoriteEvent.value ? 'フォロー済みにしました' : 'フォローを解除しました');
};

const setSlide = (index: number) => {
  if (index < 0 || index >= heroSlides.value.length) return;
  activeSlide.value = index;
};

const goPrevSlide = () => {
  if (!heroSlides.value.length) return;
  activeSlide.value = (activeSlide.value - 1 + heroSlides.value.length) % heroSlides.value.length;
};

const goNextSlide = () => {
  if (!heroSlides.value.length) return;
  activeSlide.value = (activeSlide.value + 1) % heroSlides.value.length;
};

const markCoverBroken = (slide: { id?: string; imageUrl?: string }, index: number) => {
  brokenCovers.value = {
    ...brokenCovers.value,
    [slideKey(slide, index)]: true,
  };
};

const openCalendar = () => {
  if (!calendarLink.value) return;
  window.open(calendarLink.value, '_blank');
};

const communityIdForFollow = computed(
  () => event.value?.community?.id || detail.value?.community?.id || (detail.value as any)?.communityId || null,
);
const isFollowingCommunity = ref(false);
const followLocked = ref(false);
const loadFollowState = async () => {
  if (!communityIdForFollow.value) return;
  if (!user.value) {
    isFollowingCommunity.value = false;
    followLocked.value = false;
    return;
  }
  try {
    const status = await fetchCommunityFollowStatus(communityIdForFollow.value);
    isFollowingCommunity.value = !!status.following;
    followLocked.value = !!status.locked;
  } catch {
    isFollowingCommunity.value = false;
    followLocked.value = false;
  }
};

watch(
  () => [user.value?.id, communityIdForFollow.value],
  () => {
    loadFollowState();
  },
  { immediate: true },
);

const toggleFollow = async () => {
  if (!communityIdForFollow.value) return;
  if (followLocked.value) {
    showUiMessage('フォロー解除はできません');
    return;
  }
  if (!user.value) {
    router.push({ name: 'auth-login', query: { redirect: route.fullPath } });
    return;
  }
  try {
    if (isFollowingCommunity.value) {
      const res = await unfollowCommunity(communityIdForFollow.value);
      if (res.locked) {
        isFollowingCommunity.value = true;
        followLocked.value = true;
        showUiMessage('フォローを解除できませんでした');
        return;
      }
      isFollowingCommunity.value = !!res.following;
      followLocked.value = !!res.locked;
      showUiMessage('フォローを解除しました');
    } else {
      const res = await followCommunity(communityIdForFollow.value);
      isFollowingCommunity.value = !!res.following;
      followLocked.value = !!res.locked;
      showUiMessage('フォローしました');
    }
  } catch (err) {
    showUiMessage(err instanceof Error ? err.message : '操作に失敗しました');
  }
};

const followIfNeeded = async () => {
  if (!communityIdForFollow.value || isFollowingCommunity.value || followLocked.value) return;
  if (!user.value) return;
  try {
    await followCommunity(communityIdForFollow.value);
    isFollowingCommunity.value = true;
  } catch (err) {
    console.warn('auto-follow failed', err);
  }
};

// Swipe to change hero slide
let touchStartX = 0;
let touchStartY = 0;
let touchDeltaX = 0;
const SWIPE_THRESHOLD = 40;

const handleTouchStart = (e: TouchEvent) => {
  if (!e.touches.length) return;
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  touchDeltaX = 0;
};

const handleTouchMove = (e: TouchEvent) => {
  if (!e.touches.length) return;
  const touch = e.touches[0];
  touchDeltaX = touch.clientX - touchStartX;
};

const handleTouchEnd = () => {
  if (!heroSlides.value.length) return;
  const horizontalSwipe = Math.abs(touchDeltaX) > SWIPE_THRESHOLD;
  if (!horizontalSwipe) return;
  if (touchDeltaX < 0) {
    goNextSlide();
  } else {
    goPrevSlide();
  }
  touchStartX = 0;
  touchStartY = 0;
  touchDeltaX = 0;
};

const groupAvatarStyle = computed(() => {
  const url = detail.value?.communityAvatar;
  if (!url) return {};
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundColor: '#f8fafc',
  };
});

const openCommunityPortal = () => {
  if (!detail.value?.communitySlug) return;
  router.push({ name: 'community-portal', params: { slug: detail.value.communitySlug } });
};

const participantInitial = (name?: string | null) => (name ? name.charAt(0).toUpperCase() : 'G');

const openAllParticipants = () => {
  if (!participantPreview.value.length) return;
  showAllParticipants.value = true;
};

const closeAllParticipants = () => {
  showAllParticipants.value = false;
};

const openMap = () => {
  if (detail.value?.mapUrl) {
    window.open(detail.value.mapUrl, '_blank');
  }
};

const openActiveImage = () => {
  const url = activeSlideImage.value;
  if (!url) return;
  previewImage.value = url;
};

const handleAboutClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const img = target.closest('img');
  if (img) {
    event.preventDefault();
    event.stopPropagation();
    previewImage.value = (img as HTMLImageElement).currentSrc || img.getAttribute('src') || '';
  }
};

const openBookingSheet = () => {
  initializeFormValues();
  agree.value = false;
  showBooking.value = true;
};

const closeBookingSheet = () => {
  if (!submitting.value) {
    showBooking.value = false;
  }
};

const handleCtaClick = () => {
  if (!detail.value) return;
  if (legacyRefund.value || registrationStatus.value === 'cancel_requested') return;
  if (registrationStatus.value === 'pending_payment') {
    const registrationId = registrationItem.value?.registrationId;
    if (registrationId) {
      sessionStorage.setItem(
        MOBILE_EVENT_PENDING_PAYMENT_KEY,
        JSON.stringify({
          registrationId,
          amount: registrationItem.value?.amount ?? null,
          eventId: detail.value.id,
          source: 'mobile',
        }),
      );
    }
    router.push({
      name: 'MobileEventCheckout',
      params: { eventId: detail.value.id },
      query: registrationId ? { registrationId } : undefined,
    });
    return;
  }
  if (hasRegistration.value) {
    if (registrationStatus.value === 'cancelled') {
      if (registrationWindow.value !== 'open') return;
      router.push({ name: 'MobileEventRegister', params: { eventId: detail.value.id } });
      return;
    }
    router.push({ name: 'my-events' });
    return;
  }
  if (registrationWindow.value !== 'open') return;
  router.push({ name: 'MobileEventRegister', params: { eventId: detail.value.id } });
};

const submitBooking = async () => {
  if (!eventId.value) return;
  trackEvent('registration_start', { eventId: eventId.value });
  submitting.value = true;
  registrationError.value = null;
  try {
    const registration = await createRegistration(eventId.value, { formAnswers: { ...formValues } });
    await handleRegistrationResult(registration);
    showBooking.value = false;
    await followIfNeeded();
  } catch (err) {
    registrationError.value = 'お申し込みに失敗しました。時間をおいて再試行してください。';
  } finally {
    submitting.value = false;
  }
};

const handleRegistrationResult = async (registration: EventRegistrationSummary) => {
  if (registration.paymentRequired) {
    pendingPayment.value = {
      registrationId: registration.registrationId,
      amount: registration.amount,
    };
    paymentMessage.value = 'お支払いを完了すると参加が確定します。';
    sessionStorage.setItem(
      MOBILE_EVENT_PENDING_PAYMENT_KEY,
      JSON.stringify({
        registrationId: registration.registrationId,
        amount: registration.amount,
        eventId: detail.value?.id ?? eventId.value,
        source: 'mobile',
      }),
    );
    if (detail.value) {
      router.push({ name: 'MobileEventCheckout', params: { eventId: detail.value.id } });
    }
    return;
  } else {
    pendingPayment.value = null;
    paymentMessage.value = 'お申込みありがとうございます！';
  }
  await checkRegistrationStatus();
};

const handleMockPayment = async () => {
  if (!pendingPayment.value) return;
  isPaying.value = true;
  registrationError.value = null;
  try {
    await createMockPayment(pendingPayment.value.registrationId);
    pendingPayment.value = null;
    paymentMessage.value = 'お支払いが完了しました。参加が確定です。';
    await followIfNeeded();
  } catch (err) {
    registrationError.value = '決済に失敗しました。時間をおいて再試行してください。';
  } finally {
    isPaying.value = false;
  }
};

const handleStripeCheckout = async () => {
  if (!pendingPayment.value) return;
  isRedirecting.value = true;
  registrationError.value = null;
    try {
      const { checkoutUrl, resume } = await createStripeCheckout(pendingPayment.value.registrationId);
      if (resume) {
        window.alert('未完了の決済があります。決済を再開してください。');
      }
      sessionStorage.setItem(
        MOBILE_EVENT_PENDING_PAYMENT_KEY,
        JSON.stringify({
          registrationId: pendingPayment.value.registrationId,
          amount: pendingPayment.value.amount,
          eventId: detail.value?.id ?? eventId.value,
          source: 'mobile',
        }),
      );
      window.location.href = checkoutUrl;
    } catch (err: any) {
      const message =
      err?.response?.data?.message ?? (err instanceof Error ? err.message : 'Stripe Checkoutの開始に失敗しました');
    registrationError.value = message;
    isRedirecting.value = false;
  }
};

const fieldKey = (field: RegistrationFormField, index: number) => field.id ?? `${field.label ?? 'field'}-${index}`;

const initializeFormValues = () => {
  Object.keys(formValues).forEach((key) => delete formValues[key]);
  formFields.value.forEach((field, index) => {
    const key = fieldKey(field, index);
    if (field.type === 'checkbox') {
      formValues[key] = false;
    } else if (field.type === 'multiChoice') {
      formValues[key] = [];
    } else {
      formValues[key] = '';
    }
  });
};

const getOptions = (field: RegistrationFormField) => (Array.isArray(field.options) ? field.options : []);

const toggleMulti = (field: RegistrationFormField, index: number, option: string, checked: boolean) => {
  const key = fieldKey(field, index);
  if (!Array.isArray(formValues[key])) {
    formValues[key] = [];
  }
  if (checked) {
    if (!formValues[key].includes(option)) {
      formValues[key].push(option);
    }
  } else {
    formValues[key] = formValues[key].filter((value: string) => value !== option);
  }
};

const inputType = (type: string) => {
  switch (type) {
    case 'email':
      return 'email';
    case 'phone':
      return 'tel';
    case 'number':
      return 'number';
    case 'date':
      return 'date';
    default:
      return 'text';
  }
};

const formatDate = (value: string) =>
  new Date(value).toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatLongDate = (value?: string) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
};

const formatDayWithWeekday = (value?: string) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ja-JP', {
    day: 'numeric',
    weekday: 'short',
  });
};

const formatTime = (value?: string) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
};

const formatTimeRange = (start?: string, end?: string) => {
  if (!start) return '';
  const startDate = new Date(start);
  const startTime = formatTime(start);
  if (!end) {
    return `${formatLongDate(start)} ${startTime} 開始`;
  }
  const endDate = new Date(end);
  const endTime = formatTime(end);
  const sameDay = startDate.toDateString() === endDate.toDateString();
  if (sameDay) {
    return `${startTime} - ${endTime}`;
  }
  return `${formatLongDate(start)} ${startTime} 〜 ${formatLongDate(end)} ${endTime}`;
};

const formatScheduleLine = (start?: string, end?: string) => {
  if (!start) return '';
  const startDate = new Date(start);
  const startText = `${formatLongDate(start)} ${formatTime(start)}`;
  if (!end) {
    return startText;
  }
  const endDate = new Date(end);
  const sameDay = startDate.toDateString() === endDate.toDateString();
  if (sameDay) {
    return `${formatLongDate(start)} ${formatTime(start)}〜${formatTime(end)}`;
  }
  const sameMonth =
    startDate.getFullYear() === endDate.getFullYear() && startDate.getMonth() === endDate.getMonth();
  const endDateText = sameMonth ? formatDayWithWeekday(end) : formatLongDate(end);
  return `${formatLongDate(start)} ${formatTime(start)}〜${endDateText} ${formatTime(end)}`;
};

const showHeaderActions = computed(() => APP_TARGET !== 'liff');

const pad = (value: number) => value.toString().padStart(2, '0');

const formatCalendarDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(
    date.getUTCHours(),
  )}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
};

onMounted(loadEvent);

watch(
  () => [user.value?.id, eventId.value],
  () => {
    if (user.value && eventId.value) {
      checkRegistrationStatus();
    } else {
      registrationItem.value = null;
    }
  },
  { immediate: true },
);

watch(
  () => [isLoggedIn.value, detail.value?.id],
  () => {
    if (typeof window === 'undefined') return;
    if (isLoggedIn.value && detail.value && favoritePayload.value) {
      const pendingRaw = window.localStorage.getItem('favorite:data');
      if (pendingRaw) {
        try {
          const pending = JSON.parse(pendingRaw);
          if (pending.id === detail.value.id && !favoritesStore.isFavorite(pending.id)) {
            favoritesStore.addFavorite(pending);
          }
        } catch (error) {
          console.warn('Failed to process pending favorite', error);
        } finally {
          window.localStorage.removeItem('favorite:data');
        }
      }
    }
  },
  { immediate: true },
);

watch(
  participantsList,
  (list) => {
    if (!list.length) {
      showAllParticipants.value = false;
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.event-detail-page {
  background-color: #f7f7fb;
  min-height: 100vh;
  width: 100%;
  max-width: 100vw;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
}

.event-detail-page .m-event-content {
  background-color: inherit;
  min-height: 100vh;
}

.event-state {
  text-align: center;
  padding: 48px 0;
}

.event-state.error {
  color: #e11d48;
}

.event-skeleton {
  padding: 18px 0 60px;
}

.skeleton-hero {
  width: 100%;
  height: 220px;
  border-radius: 20px;
  margin-bottom: 18px;
}

.skeleton-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.skeleton-title {
  height: 28px;
  width: 70%;
  border-radius: 16px;
}

.skeleton-button-row {
  display: flex;
  gap: 10px;
}

.skeleton-button {
  flex: 1;
  height: 36px;
  border-radius: 999px;
}

.skeleton-card {
  width: 100%;
  min-height: 120px;
  border-radius: 20px;
}

.skeleton-card--short {
  min-height: 80px;
}

.shimmer {
  position: relative;
  overflow: hidden;
  background: linear-gradient(90deg, #f4f7fb 25%, #e5e9f2 37%, #f4f7fb 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

@keyframes shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

.event-meta-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.event-meta-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--m-color-primary);
}
.event-meta-icon--address {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
}
.event-meta-icon--date {
  align-self: center;
  line-height: 1;
}
.event-meta-icon--date svg {
  display: block;
}

.event-meta-row--location {
  align-items: center;
  gap: 12px;
}
.event-meta-row--location.is-clickable {
  cursor: pointer;
}
.event-meta-row--location.is-clickable:active .event-location-title {
  opacity: 0.7;
}

.event-meta-row--schedule {
  align-items: center;
}

.event-schedule-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.event-meta-text {
  flex: 1;
}

.event-meta-title {
  font-size: 17px;
  font-weight: 500;
  color: var(--m-color-text-primary);
}

.event-map-button {
  border: none;
  background: rgba(10, 122, 255, 0.08);
  color: var(--m-color-primary);
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.event-hero {
  position: relative;
  margin: 0 0 12px;
}

.event-schedule {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  min-width: 0;
}
.event-schedule.is-clickable {
  cursor: pointer;
}
.event-schedule.is-clickable:active {
  opacity: 0.7;
}


.event-schedule__line {
  margin: 0;
  font-size: clamp(12px, 4vw, 18px);
  font-weight: 500;
  color: var(--m-color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-location-title {
  font-size: clamp(12px, 4vw, 18px);
  font-weight: 500;
  color: var(--m-color-text-secondary);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}


.event-schedule__badge {
  margin-left: auto;
  align-self: flex-start;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #055160;
  background: #cffafe;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
}


.event-hero__overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(env(safe-area-inset-top, 0px) + 8px) 16px 8px;
}
.event-back-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
}
.event-back-btn:active {
  opacity: 0.8;
}
.overlay-spacer {
  width: 40px;
  height: 40px;
}
.event-back-icon {
  width: 22px;
  height: 22px;
  color: #ffffff;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.45));
}

.event-cover-wrapper {
  position: relative;
  margin: 0 0 0 -16px;
  width: calc(100% + 32px);
  padding-top: env(safe-area-inset-top, 0px);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  aspect-ratio: 16 / 9;
  border-radius: 0;
  overflow: hidden;
  background-color: #0f172a10;
}

.event-carousel {
  position: relative;
  overflow: hidden;
  background: transparent;
  height: 100%;
}

.event-carousel__slide {
  position: relative;
  opacity: 0;
  transition: opacity 0.25s ease;
  display: none;
}

.event-carousel__slide.is-active {
  opacity: 1;
  display: block;
}

.event-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background-color: transparent;
  display: block;
}

.carousel-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: none;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.carousel-nav--prev {
  left: 12px;
}

.carousel-nav--next {
  right: 12px;
}

.carousel-dots {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
}

.carousel-dot {
  width: 6px;
  height: 6px;
  border-radius: 10px;
  border: none;
  background: rgba(255, 255, 255, 0.4);
}

.carousel-dot.is-active {
  width: 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.95);
}

.event-status-badge {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.event-hero-hint {
  margin: 8px 0 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.5;
}

.event-status-badge.is-open {
  background: linear-gradient(135deg, #0090d9, #22bbaa, #e4c250);
}

.event-status-badge.is-live {
  background: linear-gradient(135deg, #0090d9, #22bbaa, #e4c250);
}

.event-status-badge.is-pending {
  background: rgba(59, 130, 246, 0.8);
}

.event-status-badge.is-soldout {
  background: rgba(245, 158, 11, 0.9);
}

.event-status-badge.is-closed {
  background: rgba(15, 23, 42, 0.65);
}

.event-hero-info {
  padding: 12px 16px 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.event-hero-info .m-text-event-title-main {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: rgba(17, 17, 17, 0.9);
  line-height: 1.2;
}

.event-hero-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0;
}

.event-hero-meta__left {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.event-hero-meta .event-hero-actions {
  margin-top: 0;
}

.event-hero-actions {
  margin-top: 0;
  display: flex;
  gap: 6px;
}

.event-action-icon {
  width: 36px;
  height: 36px;
  border: 1px solid var(--m-color-border);
  border-radius: 12px;
  background: linear-gradient(135deg, #ffffff, #f5f7ff);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--m-color-text-primary);
}

.event-action-icon__img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.event-action-icon.is-active {
  background: linear-gradient(135deg, #2563eb, #60a5fa);
  color: #fff;
  border-color: #1d4ed8;
}

.event-action-icon.is-active .event-action-icon__img {
  filter: brightness(0) invert(1);
}

.view-count {
  font-size: 13px;
  color: var(--m-color-text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.event-hero-toast {
  margin: 6px 0 0;
  font-size: 12px;
  color: #0f172a;
  background: rgba(255, 255, 255, 0.9);
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid var(--m-color-border);
}

.event-section {
  margin-top: 12px;
}

.location-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.location-text {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #0f172a;
  font-weight: 700;
}
.location-text .i-lucide-map-pin {
  color: #0ea5e9;
}
.location-copy {
  margin: 0;
  line-height: 1.4;
}
.location-actions {
  display: flex;
  justify-content: flex-end;
}
.location-btn {
  padding: 8px 12px;
  border-radius: 12px;
  background: #0ea5e9;
  color: #fff;
  font-weight: 700;
  text-decoration: none;
}

.event-group-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.group-info {
  display: flex;
  align-items: center;
  gap: 12px;
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  flex: 1;
}

.group-avatar {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background-color: var(--m-color-chip-bg);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.m-text-body img {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  object-fit: contain;
}

.event-about {
  overflow: visible;
}
.event-about__header {
  font-size: 14px;
  font-weight: 600;
  color: var(--m-color-text-primary);
}
.event-about__divider {
  height: 1px;
  margin: 10px 0 12px;
  background: rgba(15, 23, 42, 0.08);
}
.event-about__content {
  width: 100%;
}
:deep(.event-about__content figure) {
  margin: 12px -16px;
  padding: 0;
  background: transparent;
  border-radius: 16px;
  overflow: hidden;
}
:deep(.event-about__content figure img),
:deep(.event-about__content img) {
  display: block !important;
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  object-fit: cover !important;
  border-radius: 16px !important;
  padding: 0 !important;
  background: #f4f5f7 !important;
  box-sizing: border-box !important;
  margin: 0 !important;
}
:deep(.event-about__content a img) {
  border: none !important;
  background: transparent !important;
  object-fit: cover !important;
}
.m-text-body a img {
  border: none;
  padding: 0;
  background: transparent;
}

.image-preview {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: grid;
  place-items: center;
  z-index: 9999;
  padding: 24px;
}
.image-preview img {
  max-width: 100%;
  max-height: 90vh;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
}
.preview-close {
  position: absolute;
  top: 16px;
  right: 16px;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
}

.group-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--m-color-text-primary);
}

.group-follow {
  border: none;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.05);
  color: var(--m-color-text-primary);
  flex-shrink: 0;
  pointer-events: auto;
  position: relative;
  z-index: 1;
}
.group-follow.is-locked {
  opacity: 0.6;
  cursor: default;
}

.group-follow.is-active {
  background: rgba(0, 144, 217, 0.15);
  color: var(--m-color-primary);
}

.group-follow:active {
  opacity: 0.85;
}

.group-hint {
  margin: 0;
  font-size: 12px;
  color: var(--m-color-text-tertiary);
}

.event-price-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--m-color-text-primary);
  margin: 0;
}

.event-progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--m-color-text-tertiary);
}

.event-progress {
  margin-top: 12px;
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: #edf2f7;
  overflow: hidden;
}

.event-progress__bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(135deg, #0090d9, #22bbaa, #e4c250);
}

.event-requirements {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: var(--m-color-text-secondary);
  line-height: 1.6;
}

.event-payment {
  margin-top: 12px;
  background: #fffdf5;
  color: #92400e;
  font-size: 13px;
  padding: 12px;
  border-radius: 14px;
}

.event-payment__actions {
  display: flex;
  flex-direction: row;
  gap: 8px;
  margin-top: 8px;
}

.event-content--with-footer {
  padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px) + 60px);
}

.participant-wall {
  margin-top: 16px;
}

.participant-avatars {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.participant-avatar,
.participant-more {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.95);
  background: #f8fafc;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.35);
  padding: 0;
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--m-color-text-primary);
  overflow: hidden;
}

.participant-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.participant-more {
  background: rgba(15, 23, 42, 0.08);
}

.participants-empty {
  margin-top: 6px;
  font-size: 12px;
  color: var(--m-color-text-tertiary);
}

.participants-empty {
  margin-top: 12px;
}

.participant-close {
  border: none;
  background: transparent;
  color: var(--m-color-text-secondary);
}

.participant-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.participant-list__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(15, 23, 42, 0.05);
}

.participant-list__avatar {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.06);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: var(--m-color-text-primary);
  overflow: hidden;
}

.participant-list__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.participant-list__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--m-color-text-primary);
}

.participant-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.participant-sheet {
  width: 100%;
  max-width: 520px;
  background: #fff;
  border-radius: 16px 16px 0 0;
  padding: 8px 16px 16px;
  max-height: 75vh;
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.participant-sheet__handle {
  width: 48px;
  height: 4px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.12);
  margin: 6px auto 10px;
}

.participant-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.participant-sheet__header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.participant-sheet__body {
  overflow-y: auto;
  max-height: calc(75vh - 60px);
  padding-right: 4px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.event-footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 10px 16px calc(8px + env(safe-area-inset-bottom, 0px) + 60px);
  background: var(--m-color-surface);
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  align-items: center;
  gap: 10px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  box-sizing: border-box;
  z-index: 10;
}

.price-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding-left: 16px;
  box-sizing: border-box;
}
.price-block .price {
  font-size: 18px;
  font-weight: 800;
  color: var(--color-primary);
  letter-spacing: -0.01em;
}

.rails-cta {
  border: none;
  border-radius: 999px;
  padding: 14px 20px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.01em;
  background: #0090d9;
  color: #fff;
  box-shadow: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  line-height: 1.25;
  white-space: normal;
  text-align: center;
  min-height: 52px;
}

.rails-cta span {
  display: inline-block;
  white-space: normal;
}

.rails-cta:active:not(:disabled) {
  transform: scale(0.98);
  box-shadow: none;
}

.rails-cta:disabled {
  background: #92d0f5;
  color: rgba(255, 255, 255, 0.8);
  box-shadow: none;
}

.cta-hint {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(70px + env(safe-area-inset-bottom, 0px) + 60px);
  font-size: 12px;
  color: rgba(15, 23, 42, 0.75);
  background: rgba(255, 255, 255, 0.96);
  border-radius: 12px;
  padding: 10px 12px;
  margin: 0;
  line-height: 1.4;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(8px);
  z-index: 9;
}

.debug-state {
  margin-top: 8px;
  font-size: 12px;
  color: #0f172a;
  background: rgba(15, 23, 42, 0.04);
  border-radius: 8px;
  padding: 8px;
}

</style>
