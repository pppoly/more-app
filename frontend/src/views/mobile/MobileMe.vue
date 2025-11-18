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
        <p class="me-hero__subtitle">{{ isLoggedIn ? currentLanguageLabel : 'ようこそ' }}</p>
        <button class="me-hero__title" type="button" @click="handleAuthAction">
          {{ user?.name || 'ゲスト' }}
        </button>
        <div class="me-hero__chips">
          <span v-if="isOrganizer" class="chip chip--success">
            <span class="i-lucide-badge-check mr-1"></span>主理人
          </span>
          <span v-else class="chip chip--ghost">ゲスト</span>
        </div>
        <p v-if="avatarStatus" :class="['me-hero__status', avatarStatusType === 'error' ? 'is-error' : '']">
          {{ avatarStatus }}
        </p>
      </div>
    </section>

    <section class="m-section-title">マイサービス</section>
    <div class="me-grid">
      <button class="me-card" @click="goMyEvents">
        <span class="me-card__icon i-lucide-calendar-check"></span>
        <span class="me-card__label">参加したイベント</span>
        <span class="me-card__meta">予約・チケット</span>
      </button>
      <button class="me-card" @click="goMyPayments">
        <span class="me-card__icon i-lucide-credit-card"></span>
        <span class="me-card__label">支払い履歴</span>
        <span class="me-card__meta">お支払い記録</span>
      </button>
      <button class="me-card" @click="goFavorites">
        <span class="me-card__icon i-lucide-heart"></span>
        <span class="me-card__label">お気に入りイベント</span>
        <span class="me-card__meta">お気に入り</span>
      </button>
      <button class="me-card" @click="goSettings">
        <span class="me-card__icon i-lucide-settings-2"></span>
        <span class="me-card__label">設定</span>
        <span class="me-card__meta">アプリ環境</span>
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { uploadMyAvatar } from '../../api/client';

const router = useRouter();
const route = useRoute();
const { user, logout, setUserProfile } = useAuth();

const isLoggedIn = computed(() => Boolean(user.value));
const isOrganizer = computed(() => Boolean(user.value?.isOrganizer));

const userInitials = computed(() => user.value?.name?.charAt(0)?.toUpperCase() ?? 'M');

const currentLanguageLabel = computed(() => {
  const lang = user.value?.language ?? 'ja';
  switch (lang) {
    case 'zh':
      return '中文 / Chinese';
    case 'en':
      return 'English';
    default:
      return '日本語 / Japanese';
  }
});

const goMyEvents = () => {
  router.push({ name: 'my-events' });
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
    router.push({ name: 'organizer-apply' });
  }
};

const avatarInput = ref<HTMLInputElement | null>(null);
const avatarUploading = ref(false);
const avatarStatus = ref('');
const avatarStatusType = ref<'success' | 'error'>('success');

const handleAvatarTap = () => {
  if (!isLoggedIn.value) {
    router.push({ name: 'organizer-apply', query: { redirect: route.fullPath } });
    return;
  }
  avatarStatus.value = '';
  avatarInput.value?.click();
};

const MAX_AVATAR_SIZE = 200 * 1024;

const cropImageToSquare = (file: File) =>
  new Promise<File>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const minSide = Math.min(img.width, img.height);
        const startX = (img.width - minSide) / 2;
        const startY = (img.height - minSide) / 2;

        const createCanvas = (size: number) => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return null;
          }
          ctx.drawImage(img, startX, startY, minSide, minSide, 0, 0, size, size);
          return canvas;
        };

        const exportWithConstraints = (initialSize: number): Promise<File> =>
          new Promise((innerResolve, innerReject) => {
            let size = initialSize;
            let canvas = createCanvas(size);
            if (!canvas) {
              innerReject(new Error('Failed to init canvas'));
              return;
            }
            const qualities = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4];

            const attemptQuality = (index: number) => {
              if (!canvas) {
                innerReject(new Error('Failed to init canvas'));
                return;
              }
              if (index >= qualities.length) {
                if (size <= 256) {
                  innerReject(new Error('画像を圧縮できませんでした'));
                  return;
                }
                size = Math.floor(size * 0.85);
                canvas = createCanvas(size);
                attemptQuality(0);
                return;
              }
              canvas.toBlob(
                (blob) => {
                  if (!blob) {
                    innerReject(new Error('画像変換に失敗しました'));
                    return;
                  }
                  if (blob.size <= MAX_AVATAR_SIZE) {
                    const cropped = new File([blob], `avatar-${Date.now()}.jpg`, {
                      type: 'image/jpeg',
                    });
                    innerResolve(cropped);
                  } else {
                    attemptQuality(index + 1);
                  }
                },
                'image/jpeg',
                qualities[index],
              );
            };

            attemptQuality(0);
          });

        exportWithConstraints(512).then(resolve).catch(reject);
      };
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('画像を読み込めませんでした'));
    reader.readAsDataURL(file);
  });

const onAvatarSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  avatarUploading.value = true;
  avatarStatus.value = '';
  try {
    const cropped = await cropImageToSquare(file);
    const profile = await uploadMyAvatar(cropped);
    setUserProfile(profile);
    avatarStatus.value = 'プロフィール写真を更新しました';
    avatarStatusType.value = 'success';
  } catch (error) {
    console.error('Failed to upload avatar', error);
    avatarStatus.value = '写真の更新に失敗しました';
    avatarStatusType.value = 'error';
  } finally {
    avatarUploading.value = false;
    if (input) {
      input.value = '';
    }
  }
};
</script>

<style scoped>
.mobile-me {
  padding: 1rem 1.25rem 4rem;
  background: var(--m-color-bg, #fafafa);
  min-height: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: hidden;
}

.me-hero {
  background: linear-gradient(135deg, #0090d9, #22bbaa, #e4c250);
  border-radius: 0;
  padding: calc(1rem + env(safe-area-inset-top, 0px)) 1.5rem 1.2rem;
  margin: 0 -1.25rem;
  color: #fff;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 1rem;
  align-items: center;
  box-shadow: 0 20px 45px rgba(0, 144, 217, 0.25);
}

.me-hero__avatar {
  border: none;
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 600;
  overflow: hidden;
  cursor: pointer;
  position: relative;
}

.me-hero__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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

.me-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.me-card {
  border: none;
  border-radius: 18px;
  background: #fff;
  padding: 1rem;
  text-align: left;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.1);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.me-card__icon {
  font-size: 1.4rem;
  color: var(--m-color-primary, #0a7aff);
}

.me-card__label {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--m-color-text-primary, #111);
}

.me-card__meta {
  font-size: 0.75rem;
  color: var(--m-color-text-tertiary, #666);
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
</style>
