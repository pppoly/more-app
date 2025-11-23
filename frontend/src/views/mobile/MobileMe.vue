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
    <teleport to="body">
      <transition name="fade">
        <div v-if="showCropper" class="me-overlay">
          <div class="me-overlay__panel">
            <p class="me-overlay__title">调整头像</p>
            <div
              class="me-cropper"
              @pointerdown.prevent="startDrag"
              @pointermove.prevent="onDrag"
              @pointerup="endDrag"
              @pointerleave="endDrag"
            >
              <div class="me-cropper__image">
                <div class="me-cropper__shift" :style="cropShiftStyle">
                  <img v-if="cropSource" :src="cropSource" :style="cropImageStyle" draggable="false" />
                </div>
              </div>
              <div class="me-cropper__mask"></div>
            </div>
            <div class="me-cropper__slider">
              <input type="range" min="1" max="3" step="0.01" v-model.number="cropScale" @input="clampOffsets" />
            </div>
            <div class="me-overlay__actions">
              <button type="button" class="ghost" @click="cancelCropper">取消</button>
              <button type="button" class="primary" :disabled="avatarUploading" @click="applyCropper">
                {{ avatarUploading ? '上传中…' : '使用此头像' }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { uploadMyAvatar } from '../../api/client';
import { validateAvatarFile } from '../../utils/validateAvatarFile';
import { processAvatarImage } from '../../utils/processAvatarImage';

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

const serviceEntries = [
  {
    title: '参加したイベント',
    description: '予約・チケット',
    cta: '見る',
    icon: 'i-lucide-ticket',
    action: () => goMyEvents(),
  },
  {
    title: '支払い履歴',
    description: 'お支払い記録',
    cta: '見る',
    icon: 'i-lucide-receipt-japanese-yen',
    action: () => goMyPayments(),
  },
  {
    title: 'お気に入りイベント',
    description: 'お気に入り',
    cta: '見る',
    icon: 'i-lucide-heart',
    action: () => goFavorites(),
  },
  {
    title: '設定',
    description: 'アプリ環境',
    cta: '開く',
    icon: 'i-lucide-settings',
    action: () => goSettings(),
  },
];

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
const avatarStatus = ref('');
const avatarStatusType = ref<'success' | 'error'>('success');

const handleAvatarTap = () => {
  if (!isLoggedIn.value) {
    router.push({ name: 'auth-login', query: { redirect: route.fullPath } });
    return;
  }
  avatarStatus.value = '';
  avatarInput.value?.click();
};

const MAX_AVATAR_SIZE = 200 * 1024;
const CROPPER_VIEWPORT = 280;
const CROPPER_RESULT = 400;

const cropSource = ref<string | null>(null);
const cropImage = ref<HTMLImageElement | null>(null);
const cropScale = ref(1.2);
const cropOffset = ref({ x: 0, y: 0 });
const cropBaseWidth = ref(0);
const cropBaseHeight = ref(0);
const showCropper = ref(false);
const dragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const dragOrigin = ref({ x: 0, y: 0 });

const cropShiftStyle = computed(() => ({
  width: `${cropBaseWidth.value}px`,
  height: `${cropBaseHeight.value}px`,
  transform: `translate(${cropOffset.value.x}px, ${cropOffset.value.y}px)`,
}));

const cropImageStyle = computed(() => ({
  width: `${cropBaseWidth.value}px`,
  height: `${cropBaseHeight.value}px`,
  transform: `scale(${cropScale.value})`,
}));

const onAvatarSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    await validateAvatarFile(file, { requireSquare: false });
    const processed = await processAvatarImage(file, { size: CROPPER_RESULT });
    loadCropImage(processed);
  } catch (err) {
    avatarStatus.value = err instanceof Error ? '这张头像不合适，换一张清晰的照片试试' : '头像上传失败，请换一张照片再试';
    avatarStatusType.value = 'error';
    if (input) input.value = '';
    return;
  }
  if (input) {
    input.value = '';
  }
};

const loadCropImage = (file: File) => {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      cropSource.value = reader.result as string;
      cropImage.value = img;
      const coverScale = Math.max(CROPPER_VIEWPORT / img.naturalWidth, CROPPER_VIEWPORT / img.naturalHeight);
      cropBaseWidth.value = img.naturalWidth * coverScale;
      cropBaseHeight.value = img.naturalHeight * coverScale;
      cropScale.value = 1.2;
      cropOffset.value = { x: 0, y: 0 };
      clampOffsets();
      showCropper.value = true;
    };
    img.onerror = () => {
      avatarStatus.value = '图片加载失败';
      avatarStatusType.value = 'error';
    };
    img.src = reader.result as string;
  };
  reader.onerror = () => {
    avatarStatus.value = '无法读取图片';
    avatarStatusType.value = 'error';
  };
  reader.readAsDataURL(file);
};

const startDrag = (event: PointerEvent) => {
  if (!showCropper.value) return;
  dragging.value = true;
  dragStart.value = { x: event.clientX, y: event.clientY };
  dragOrigin.value = { ...cropOffset.value };
  (event.currentTarget as HTMLElement | null)?.setPointerCapture(event.pointerId);
};

const onDrag = (event: PointerEvent) => {
  if (!dragging.value) return;
  const deltaX = event.clientX - dragStart.value.x;
  const deltaY = event.clientY - dragStart.value.y;
  cropOffset.value = {
    x: dragOrigin.value.x + deltaX,
    y: dragOrigin.value.y + deltaY,
  };
  clampOffsets();
};

const endDrag = (event: PointerEvent) => {
  if (!dragging.value) return;
  dragging.value = false;
  (event.currentTarget as HTMLElement | null)?.releasePointerCapture(event.pointerId);
};

const clampOffsets = () => {
  const maxX = Math.max(0, (cropBaseWidth.value * cropScale.value - CROPPER_VIEWPORT) / 2);
  const maxY = Math.max(0, (cropBaseHeight.value * cropScale.value - CROPPER_VIEWPORT) / 2);
  cropOffset.value = {
    x: Math.min(maxX, Math.max(-maxX, cropOffset.value.x)),
    y: Math.min(maxY, Math.max(-maxY, cropOffset.value.y)),
  };
};

const cancelCropper = () => {
  showCropper.value = false;
  cropSource.value = null;
  cropImage.value = null;
};

const applyCropper = async () => {
  if (!cropImage.value) return;
  avatarUploading.value = true;
  avatarStatus.value = '';
  try {
    const blob = await createCroppedBlob();
    if (blob.size > MAX_AVATAR_SIZE) {
      avatarStatus.value = '图片过大，请重新选择';
      avatarStatusType.value = 'error';
      avatarUploading.value = false;
      return;
    }
    const file = new File([blob], `avatar-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
    const profile = await uploadMyAvatar(file);
    setUserProfile(profile);
    avatarStatus.value = '头像已更新';
    avatarStatusType.value = 'success';
    cancelCropper();
  } catch (error) {
    console.error('Failed to upload avatar', error);
    avatarStatus.value = '头像上传失败';
    avatarStatusType.value = 'error';
  } finally {
    avatarUploading.value = false;
  }
};

const createCroppedBlob = () =>
  new Promise<Blob>((resolve, reject) => {
    const image = cropImage.value;
    if (!image) {
      reject(new Error('未找到图片'));
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = CROPPER_RESULT;
    canvas.height = CROPPER_RESULT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('无法创建画布'));
      return;
    }
    const coverScale = Math.max(CROPPER_VIEWPORT / image.naturalWidth, CROPPER_VIEWPORT / image.naturalHeight);
    const effectiveScale = coverScale * cropScale.value;
    const cropNaturalWidth = CROPPER_VIEWPORT / effectiveScale;
    const cropNaturalHeight = CROPPER_VIEWPORT / effectiveScale;
    const centerX = image.naturalWidth / 2 - cropOffset.value.x / effectiveScale;
    const centerY = image.naturalHeight / 2 - cropOffset.value.y / effectiveScale;
    let sourceX = centerX - cropNaturalWidth / 2;
    let sourceY = centerY - cropNaturalHeight / 2;
    sourceX = Math.max(0, Math.min(image.naturalWidth - cropNaturalWidth, sourceX));
    sourceY = Math.max(0, Math.min(image.naturalHeight - cropNaturalHeight, sourceY));
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      cropNaturalWidth,
      cropNaturalHeight,
      0,
      0,
      CROPPER_RESULT,
      CROPPER_RESULT,
    );
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('无法生成头像'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      0.92,
    );
  });
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
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
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
  margin: 0 -12px;
  border-radius: 26px;
  background: #fff;
  padding: 8px 4px;
  box-shadow: 0 15px 35px rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.service-row {
  width: 100%;
  border: none;
  background: transparent;
  padding: 14px 24px;
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
