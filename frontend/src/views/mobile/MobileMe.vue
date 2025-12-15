<template>
  <div class="mobile-me">
    <section class="me-hero">
      <div class="me-hero__card">
        <div class="me-hero__avatar-wrap">
          <button class="me-hero__avatar" type="button" @click="handleAvatarTap" :disabled="avatarUploading">
            <div v-if="avatarUploading" class="me-hero__avatar-spinner"></div>
            <img v-if="user?.avatarUrl" :src="user.avatarUrl" alt="user" />
            <span v-else>{{ userInitials }}</span>
          </button>
        </div>
        <div class="me-hero__info">
          <p class="me-hero__title">{{ user?.name || 'ゲスト' }}</p>
          <p class="me-hero__subtitle">{{ isOrganizer ? '主催者' : '一般ユーザー' }}</p>
        </div>
      </div>
    </section>

    <section class="section-block">
      <p class="section-title">マイサービス</p>
      <div class="service-sheet">
        <button
          v-for="entry in serviceEntries"
          :key="entry.title"
          type="button"
          class="service-row"
          @click="entry.action()"
        >
          <span class="service-row__icon">
            <img :src="entry.icon" alt="icon" />
          </span>
          <div class="service-row__info">
            <p class="service-row__title">{{ entry.title }}</p>
            <p class="service-row__desc">{{ entry.description }}</p>
          </div>
          <span class="service-row__cta">{{ entry.cta }}</span>
        </button>
      </div>
    </section>

    <input
      ref="avatarInput"
      type="file"
      accept="image/*"
      class="sr-only"
      @change="onAvatarSelected"
    />

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
      :show-circle-guide="true"
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
const userInitials = computed(() => user.value?.name?.charAt(0)?.toUpperCase() ?? 'A');

const goMyEvents = () => router.push({ name: 'my-events' });
const goMyCommunities = () => router.push({ name: 'MobileCommunities' });
const goMyPayments = () => router.push({ name: 'my-payments' });
const goFavorites = () => router.push({ name: 'favorites' });
const goSettings = () => router.push({ name: 'MobileSettings' });

const serviceEntries = computed(() => [
  { title: '参加したイベント', description: '予約・チケット', cta: '見る', icon: new URL('../../assets/我的的活动.svg', import.meta.url).href, action: goMyEvents },
  { title: 'マイコミュニティ', description: 'フォロー中のコミュニティ一覧', cta: '入る', icon: new URL('../../assets/我的社群.svg', import.meta.url).href, action: goMyCommunities },
  { title: '支払い履歴', description: 'お支払い記録', cta: '見る', icon: new URL('../../assets/付款记录.svg', import.meta.url).href, action: goMyPayments },
  { title: 'お気に入りイベント', description: 'お気に入り', cta: '見る', icon: new URL('../../assets/关注的活动.svg', import.meta.url).href, action: goFavorites },
  { title: '設定', description: 'アプリ環境', cta: '開く', icon: new URL('../../assets/设置.svg', import.meta.url).href, action: goSettings },
]);

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
    const message = err instanceof Error ? err.message || t('mobile.me.avatar.error.invalid') : t('mobile.me.avatar.error.saveFailed');
    toast.show(message, 'warning');
    if (input) input.value = '';
    return;
  }
  if (input) input.value = '';
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
  width: 100%;
  max-width: 100vw;
  padding: 0 0 4rem;
  background: #f5f6fa;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-x: hidden;
}

.me-hero {
  padding: 0;
  position: relative;
}

.me-hero::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: calc(env(safe-area-inset-top, 0px) + 70px);
  background: linear-gradient(135deg, #22d2ff 0%, #37e36f 100%);
  z-index: 0;
}

.me-hero__card {
  background: linear-gradient(135deg, #22d2ff 0%, #37e36f 100%);
  margin: 0;
  padding: calc(24px + env(safe-area-inset-top, 0px)) 16px 16px;
  border-radius: 0 0 12px 12px;
  color: #fff;
  box-shadow: 0 10px 24px rgba(34, 210, 255, 0.1);
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  min-height: 128px;
  position: relative;
  z-index: 1;
}

.me-hero__avatar-wrap {
  display: flex;
  align-items: center;
}

.me-hero__avatar {
  border: none;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  font-weight: 600;
  padding: 0;
  line-height: 0;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  box-shadow: none;
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
  background: rgba(3, 7, 18, 0.4);
  backdrop-filter: blur(2px);
  animation: pulse 1s infinite ease-in-out;
  border-radius: 50%;
}

.me-hero__avatar:disabled {
  opacity: 0.7;
}

.me-hero__info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.me-hero__subtitle {
  font-size: 13px;
  opacity: 0.86;
  margin: 0;
}

.me-hero__title {
  margin: 0;
  font-size: 18px;
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

.section-block {
  padding: 12px 16px 0;
  box-sizing: border-box;
}

.section-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.service-sheet {
  margin: 0;
  background: #fff;
  border-radius: 8px;
  padding: 6px 0;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.05);
  border: 1px solid rgba(15, 23, 42, 0.04);
  width: 100%;
  box-sizing: border-box;
}

.service-row {
  width: 100%;
  border: none;
  background: transparent;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.service-row + .service-row {
  border-top: 1px solid rgba(230, 234, 239, 0.9);
}

.service-row__icon {
  width: 37px;
  height: 37px;
  border-radius: 12px;
  background: #e9f5ff;
  color: #0f172a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  overflow: hidden;
}

.service-row__icon img {
  width: 30px;
  height: 30px;
  object-fit: contain;
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
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.service-row__desc {
  margin: 2px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.service-row__cta {
  font-size: 13px;
  font-weight: 700;
  color: #4b5563;
  background: #f1f1f1;
  padding: 8px 18px 7px;
  border-radius: 16px;
}

.service-row:active {
  background: rgba(15, 23, 42, 0.04);
}
</style>
