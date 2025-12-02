<template>
  <div class="mobile-me m-page">
    <section class="me-hero">
      <button class="me-hero__avatar" type="button" @click="handleAvatarTap" :disabled="avatarUploading">
        <div v-if="avatarUploading" class="me-hero__avatar-spinner"></div>
        <img v-if="user?.avatarUrl" :src="user.avatarUrl" alt="user" />
        <span v-else>{{ userInitials }}</span>
      </button>
      <input
        ref="avatarInput"
        type="file"
        accept="image/*"
        class="sr-only"
        @change="onAvatarSelected"
      />
      <div class="me-hero__info">
        <p class="me-hero__subtitle">{{ isLoggedIn ? currentLanguageLabel : t('header.default') }}</p>
        <button class="me-hero__title" type="button" @click="handleAuthAction">
          {{ user?.name || 'ゲスト' }}
        </button>
        <div class="me-hero__chips">
          <span v-if="isOrganizer" class="chip chip--success">
            <span class="i-lucide-badge-check mr-1"></span>{{ t('mobile.me.organizer') }}
          </span>
          <span v-else class="chip chip--ghost">ゲスト</span>
        </div>
      </div>
    </section>

    <section class="m-section-title">マイサービス</section>
    <div class="service-sheet">
      <button
        v-for="entry in serviceEntries"
        :key="entry.title"
        type="button"
        class="service-row"
        @click="entry.action()"
      >
        <span class="service-row__icon" :class="entry.icon"></span>
        <div class="service-row__info">
          <p class="service-row__title">{{ entry.title }}</p>
          <p class="service-row__desc">{{ entry.description }}</p>
        </div>
        <div class="service-row__trailing">
          <span class="service-row__cta">{{ entry.cta }}</span>
          <span class="service-row__chevron i-lucide-chevron-right"></span>
        </div>
      </button>
    </div>
    <ImageCropperModal
      :model-value="showCropper"
      :src="cropSource"
      :aspect-ratio="1"
      :result-width="400"
      result-type="image/png"
      :loading="avatarUploading"
      :title="t('mobile.me.avatar.title')"
      :confirm-text="t('mobile.me.avatar.use')"
      :cancel-text="t('mobile.me.avatar.cancel')"
      @update:modelValue="(val) => (showCropper = val)"
      @confirm="handleCropConfirm"
      @cancel="cancelCropper"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { uploadMyAvatar } from '../../api/client';
import { validateAvatarFile } from '../../utils/validateAvatarFile';
import { useI18n } from 'vue-i18n';
import ImageCropperModal from '../../components/ImageCropperModal.vue';
import { useToast } from '../../composables/useToast';

const router = useRouter();
const route = useRoute();
const { user, logout, setUserProfile } = useAuth();
const { t } = useI18n();
const toast = useToast();

const isLoggedIn = computed(() => Boolean(user.value));
const isOrganizer = computed(() => Boolean(user.value?.isOrganizer));

const userInitials = computed(() => user.value?.name?.charAt(0)?.toUpperCase() ?? 'M');

const currentLanguageLabel = computed(() => {
  const lang = user.value?.language ?? 'ja';
  if (lang === 'zh') return t('mobile.locale.zh');
  if (lang === 'en') return 'English';
  return t('mobile.locale.ja');
});

const goMyEvents = () => {
  router.push({ name: 'my-events' });
};

const goMyCommunities = () => {
  router.push({ name: 'MobileCommunities' });
};

const goMyPayments = () => {
  router.push({ name: 'my-payments' });
};

const goFavorites = () => {
  router.push({ name: 'favorites' });
};

const goSettings = () => {
  router.push({ name: 'MobileSettings' });
};

const serviceEntries = computed(() => [
  {
    title: t('mobile.me.cards.events.title'),
    description: t('mobile.me.cards.events.description'),
    cta: t('mobile.me.cards.events.cta'),
    icon: 'i-lucide-ticket',
    action: () => goMyEvents(),
  },
  {
    title: '我的社群',
    description: '关注的社群列表',
    cta: '进入',
    icon: 'i-lucide-users',
    action: () => goMyCommunities(),
  },
  {
    title: t('mobile.me.cards.payments.title'),
    description: t('mobile.me.cards.payments.description'),
    cta: t('mobile.me.cards.payments.cta'),
    icon: 'i-lucide-receipt-japanese-yen',
    action: () => goMyPayments(),
  },
  {
    title: t('mobile.me.cards.favorites.title'),
    description: t('mobile.me.cards.favorites.description'),
    cta: t('mobile.me.cards.favorites.cta'),
    icon: 'i-lucide-heart',
    action: () => goFavorites(),
  },
  {
    title: t('mobile.me.cards.settings.title'),
    description: t('mobile.me.cards.settings.description'),
    cta: t('mobile.me.cards.settings.cta'),
    icon: 'i-lucide-settings',
    action: () => goSettings(),
  },
]);

const goApplyOrganizer = () => {
  router.push({ name: 'organizer-apply' });
};

const goConsole = () => {
  router.push({ path: '/console' });
};

const logoutUser = () => {
  logout();
  router.push({ path: '/' });
};

const handleAuthAction = () => {
  if (isLoggedIn.value) {
    router.push({ path: '/me' });
  } else {
    router.push({ name: 'auth-login', query: { redirect: route.fullPath } });
  }
};

const avatarInput = ref<HTMLInputElement | null>(null);
const avatarUploading = ref(false);
const showCropper = ref(false);
const cropSource = ref<string | null>(null);

const handleAvatarTap = () => {
  if (!isLoggedIn.value) {
    router.push({ name: 'auth-login', query: { redirect: route.fullPath } });
    return;
  }
  avatarInput.value?.click();
};

const onAvatarSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    await validateAvatarFile(file, { requireSquare: false, maxBytes: 5 * 1024 * 1024 });
    const reader = new FileReader();
    reader.onload = () => {
      cropSource.value = reader.result as string;
      showCropper.value = true;
    };
    reader.readAsDataURL(file);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message || t('mobile.me.avatar.error.invalid')
        : t('mobile.me.avatar.error.saveFailed');
    toast.show(message, 'warning');
    if (input) input.value = '';
    return;
  }
  if (input) {
    input.value = '';
  }
};

const cancelCropper = () => {
  showCropper.value = false;
  cropSource.value = null;
};

const handleCropConfirm = async (blob: Blob) => {
  avatarUploading.value = true;
  try {
    const file = new File([blob], `avatar-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
    const profile = await uploadMyAvatar(file);
    setUserProfile(profile);
    toast.show(t('mobile.me.avatar.updated'), 'success');
    cancelCropper();
  } catch (error) {
    console.error('Failed to upload avatar', error);
    toast.show(t('mobile.me.avatar.error.saveFailed'), 'error');
  } finally {
    avatarUploading.value = false;
  }
};
</script>

<style scoped>
.mobile-me {
  padding: 0 1.25rem 4rem;
  background: var(--m-color-bg, #fafafa);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.me-hero {
  background: linear-gradient(135deg, #0090d9, #22bbaa, #e4c250);
  border-radius: 0;
  padding: calc(1rem + env(safe-area-inset-top, 0px)) 1.5rem 1.2rem;
  margin: 0 calc(50% - 50vw);
  width: 100vw;
  color: #fff;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 1rem;
  align-items: center;
  box-shadow: 0 20px 45px rgba(0, 144, 217, 0.25);
  box-sizing: border-box;
}

.me-hero__avatar {
  border: none;
  width: 64px;
  height: 64px;
  border-radius: 12px;
  background: #fff;
  border: 2px solid #fff;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.16);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 600;
  padding: 0;
  line-height: 0;
  overflow: hidden;
  cursor: pointer;
  position: relative;
}

.me-hero__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: inherit;
}

.me-hero__avatar-spinner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(3, 7, 18, 0.55);
  backdrop-filter: blur(2px);
  animation: pulse 1s infinite ease-in-out;
  border-radius: 18px;
}

.me-hero__avatar:disabled {
  opacity: 0.7;
}

.me-hero__status {
  font-size: 0.7rem;
  margin: 0.2rem 0 0;
  color: rgba(255, 255, 255, 0.85);
}

.me-hero__status.is-error {
  color: #ffe6e6;
}

.me-hero__info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.me-hero__subtitle {
  font-size: 0.8rem;
  opacity: 0.8;
  margin: 0;
}

.me-hero__title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
  background: none;
  border: none;
  color: #fff;
  padding: 0;
  text-align: left;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.me-hero__chips {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.chip {
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
}

.chip--success {
  background: rgba(16, 185, 129, 0.2);
  color: #065f46;
}

.chip--ghost {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

@keyframes pulse {
  0% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.5;
  }
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

.service-sheet {
  margin: 0 calc(50% - 50vw);
  width: 100vw;
  border-radius: 0;
  background: #fff;
  padding: 8px 0;
  box-shadow: none;
  border: none;
}

.service-row {
  width: 100%;
  border: none;
  background: transparent;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.service-row + .service-row {
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.service-row__icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.06);
  color: #0f172a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
}

.service-row__info {
  flex: 1;
  text-align: left;
}

.service-row__trailing {
  display: flex;
  align-items: center;
  gap: 10px;
}

.service-row__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--m-color-text-primary, #0f172a);
}

.service-row__desc {
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: var(--m-color-text-tertiary, #64748b);
}

.service-row__cta {
  font-size: 0.75rem;
  font-weight: 600;
  color: #0f172a;
  background: rgba(15, 23, 42, 0.06);
  padding: 4px 12px;
  border-radius: 999px;
}

.service-row__chevron {
  color: #94a3b8;
  font-size: 1.1rem;
}

.service-row:active {
  background: rgba(15, 23, 42, 0.04);
}

.me-stack {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.me-list {
  border: none;
  border-radius: 18px;
  padding: 0.9rem 1rem;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}

.me-list--danger {
  background: #fff5f5;
  color: #b91c1c;
}

.me-list__label {
  font-size: 0.9rem;
  font-weight: 600;
  margin: 0;
}

.me-list__meta {
  font-size: 0.75rem;
  color: var(--m-color-text-tertiary, #666);
  margin: 0;
}

.settings-inline-logout {
  margin-top: 1rem;
}

.me-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.65);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 100;
}

.me-overlay__panel {
  width: min(360px, 92vw);
  background: #fff;
  border-radius: 24px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 30px 60px rgba(15, 23, 42, 0.35);
}

.me-overlay__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.me-cropper {
  position: relative;
  width: 280px;
  height: 280px;
  max-width: 100%;
  border-radius: 24px;
  overflow: hidden;
  margin: 0 auto;
  background: #0f172a;
}

.me-cropper__image,
.me-cropper__shift {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

.me-cropper__shift img {
  pointer-events: none;
  user-select: none;
}

.me-cropper__mask {
  position: absolute;
  inset: 0;
  box-shadow: 0 0 0 999px rgba(2, 6, 23, 0.55);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.65);
  pointer-events: none;
}

.me-cropper__slider {
  padding: 0 12px;
}

.me-cropper__slider input[type='range'] {
  width: 100%;
}

.me-overlay__actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.me-overlay__actions .ghost,
.me-overlay__actions .primary {
  flex: 1;
  padding: 12px 0;
  border-radius: 16px;
  font-weight: 600;
  border: none;
}

.me-overlay__actions .ghost {
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
}

.me-overlay__actions .primary {
  background: linear-gradient(135deg, #0090d9, #22bbaa, #e4c250);
  color: #fff;
}
</style>
