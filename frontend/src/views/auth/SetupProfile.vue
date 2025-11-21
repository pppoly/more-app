<template>
  <div class="setup-page">
    <div class="setup-scene">
      <div class="avatar-area">
        <button type="button" class="avatar-circle" :disabled="avatarUploading" @click="handleAvatarTap">
          <img v-if="currentAvatar" :src="currentAvatar" alt="avatar" class="avatar-image" />
          <div
            class="avatar-overlay-cta"
            :class="{ 'avatar-overlay-cta--visible': avatarUploading || !hasAvatar }"
          >
            <span class="i-lucide-camera"></span>
            <span>
              {{ avatarUploading ? '上传中...' : hasAvatar ? '点击更换' : '点击添加头像' }}
            </span>
          </div>
        </button>
        <p v-if="avatarError" class="status">{{ avatarError }}</p>
      </div>

      <div class="name-block">
        <p class="name-text" :class="{ 'name-text--placeholder': !displayName }" @click="handleNameTap">
          {{ displayName || '请设置昵称' }}
        </p>
        <button type="button" class="name-edit" @click="handleNameTap">
          {{ displayName ? '修改昵称' : '设置昵称' }}
        </button>
        <p v-if="nameError" class="status name-status">{{ nameError }}</p>
      </div>

      <div v-if="userId" class="user-id-block">
        <p class="user-id-label">你的编号</p>
        <div class="user-id-chip">
          <span class="i-lucide-hash"></span>
          <span class="chip-text">{{ userId }}</span>
          <button type="button" @click="copyUserId">
            {{ userIdCopied ? '已复制' : '复制' }}
          </button>
        </div>
      </div>
    </div>

    <div class="setup-actions">
      <button type="button" class="confirm-btn" :disabled="confirming" @click="confirmSetup">
        {{ confirming ? '处理中...' : '我确定了' }}
      </button>
      <button v-if="showSkip" type="button" class="skip-btn" @click="skipSetup">暂不设置</button>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="sr-only"
      @change="onAvatarFileSelected"
    />

    <teleport to="body">
      <transition name="fade">
        <div v-if="showCropper" class="setup-overlay">
          <div class="setup-overlay__panel">
            <p class="overlay-title">截取头像</p>
            <div
              class="cropper-viewport"
              @pointerdown.prevent="startDrag"
              @pointermove.prevent="onDrag"
              @pointerup="endDrag"
              @pointerleave="endDrag"
            >
              <div class="cropper-image-base">
                <div class="cropper-image-shift" :style="cropShiftStyle">
                  <img
                    v-if="cropSource"
                    :src="cropSource"
                    :style="cropImageStyle"
                    draggable="false"
                  />
                </div>
              </div>
              <div class="cropper-mask"></div>
            </div>
            <div class="slider-row">
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                v-model.number="cropScale"
                @input="clampOffsets"
              />
            </div>
            <div class="overlay-actions">
              <button type="button" class="ghost" @click="cancelCropper">取消</button>
              <button type="button" class="primary" :disabled="avatarUploading" @click="applyCropper">
                {{ avatarUploading ? '上传中...' : '使用此头像' }}
              </button>
            </div>
          </div>
        </div>
      </transition>

      <transition name="fade">
        <div v-if="nameEditorVisible" class="setup-overlay">
          <div class="setup-overlay__panel">
            <p class="overlay-title">输入昵称</p>
            <input
              ref="nameInput"
              v-model="nameDraft"
              type="text"
              maxlength="40"
              placeholder="请输入昵称"
            />
            <p v-if="nameEditorError" class="status">{{ nameEditorError }}</p>
            <div class="overlay-actions">
              <button type="button" class="ghost" @click="closeNameEditor">取消</button>
              <button type="button" class="primary" :disabled="nameSaving" @click="confirmNameEdit">
                {{ nameSaving ? '保存中...' : '完成' }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { updateProfile, uploadMyAvatar } from '../../api/client';
import defaultAvatarSvg from '../../assets/images/default-avatar.svg';

const CROPPER_VIEWPORT = 280;
const CROPPER_RESULT = 720;

const route = useRoute();
const router = useRouter();
const { user, fetchCurrentUser, setUserProfile } = useAuth();

const mode = computed(() => (route.query.mode as string) || 'dev');
const redirectUrl = computed(() => {
  const target = route.query.redirect as string | undefined;
  if (target && target.startsWith('/')) {
    return target;
  }
  return '/';
});

const showNameField = computed(() => mode.value !== 'dev');
const requiresName = computed(() => mode.value === 'email');
const avatarRequired = computed(() => mode.value === 'email');
const showSkip = computed(() => mode.value === 'dev');

const fileInput = ref<HTMLInputElement | null>(null);
const displayName = ref(user.value?.name ?? '');
const nameError = ref('');
const nameSaving = ref(false);
const nameEditorVisible = ref(false);
const nameDraft = ref('');
const nameEditorError = ref('');
const nameInput = ref<HTMLInputElement | null>(null);

const avatarError = ref('');
const avatarUploading = ref(false);
const confirming = ref(false);

const fallbackInitial = computed(() => {
  const source = displayName.value?.trim() || user.value?.email || 'M';
  return source.charAt(0).toUpperCase() || 'M';
});

const generatedAvatar = computed(() => {
  if (user.value?.avatarUrl) {
    return user.value.avatarUrl;
  }
  return defaultAvatarSvg;
});

const currentAvatar = computed(() => generatedAvatar.value);
const hasAvatar = computed(() => Boolean(user.value?.avatarUrl));

watch(
  () => user.value?.name,
  (next) => {
    if (!nameEditorVisible.value) {
      displayName.value = next ?? '';
    }
  },
  { immediate: true },
);

watch(
  () => user.value?.avatarUrl,
  () => {
    avatarError.value = '';
  },
);

const ensureLoggedIn = () => {
  if (!user.value) {
    router.replace({ name: 'auth-login', query: { redirect: route.fullPath } });
  }
};

const handleAvatarTap = () => {
  ensureLoggedIn();
  fileInput.value?.click();
};

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

const onAvatarFileSelected = (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  const file = target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result as string;
    loadCropImage(result);
  };
  reader.readAsDataURL(file);
  if (target) {
    target.value = '';
  }
};

const loadCropImage = (source: string) => {
  const img = new Image();
  img.onload = () => {
    cropSource.value = source;
    cropImage.value = img;
    const coverScale = Math.max(CROPPER_VIEWPORT / img.naturalWidth, CROPPER_VIEWPORT / img.naturalHeight);
    cropBaseWidth.value = img.naturalWidth * coverScale;
    cropBaseHeight.value = img.naturalHeight * coverScale;
    cropScale.value = 1.2;
    cropOffset.value = { x: 0, y: 0 };
    clampOffsets();
    showCropper.value = true;
  };
  img.src = source;
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
  try {
    const blob = await createCroppedBlob();
    const file = new File([blob], 'avatar.jpg', { type: blob.type || 'image/jpeg' });
    const profile = await uploadMyAvatar(file);
    setUserProfile(profile);
    avatarError.value = '';
    showCropper.value = false;
    cropSource.value = null;
    cropImage.value = null;
  } catch (err) {
    avatarError.value = err instanceof Error ? err.message : '上传失败';
  } finally {
    avatarUploading.value = false;
  }
};

const createCroppedBlob = () => {
  return new Promise<Blob>((resolve, reject) => {
    const image = cropImage.value;
    if (!image) {
      reject(new Error('No image to crop'));
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

    const effectiveScale =
      (Math.max(CROPPER_VIEWPORT / image.naturalWidth, CROPPER_VIEWPORT / image.naturalHeight) *
        cropScale.value);
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
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('截取失败'));
        }
      },
      'image/jpeg',
      0.92,
    );
  });
};

const handleNameTap = () => {
  ensureLoggedIn();
  if (!showNameField.value) return;
  nameDraft.value = displayName.value;
  nameEditorError.value = '';
  nameEditorVisible.value = true;
  nextTick(() => {
    nameInput.value?.focus();
  });
};

const closeNameEditor = () => {
  nameEditorVisible.value = false;
  nameEditorError.value = '';
};

const confirmNameEdit = async () => {
  if (!showNameField.value) {
    closeNameEditor();
    return;
  }
  const trimmed = nameDraft.value.trim();
  if (!trimmed) {
    nameEditorError.value = '请输入昵称';
    return;
  }
  if (trimmed === displayName.value) {
    closeNameEditor();
    return;
  }
  nameSaving.value = true;
  try {
    const profile = await updateProfile({ name: trimmed });
    setUserProfile(profile);
    displayName.value = profile.name || '';
    nameError.value = '';
    closeNameEditor();
  } catch (err) {
    nameEditorError.value = err instanceof Error ? err.message : '保存失败';
  } finally {
    nameSaving.value = false;
  }
};

const confirmSetup = async () => {
  ensureLoggedIn();
  if (avatarRequired.value && !hasAvatar.value) {
    avatarError.value = '请先添加头像';
    return;
  }
  if (requiresName.value && !displayName.value.trim()) {
    nameError.value = '请输入昵称';
    handleNameTap();
    return;
  }
  confirming.value = true;
  try {
    await fetchCurrentUser();
    await router.replace(redirectUrl.value);
  } catch (err) {
    nameError.value = err instanceof Error ? err.message : '保存失败';
  } finally {
    confirming.value = false;
  }
};

const skipSetup = () => {
  router.replace(redirectUrl.value);
};

const userId = computed(() => user.value?.id || '');
const userIdCopied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

const copyUserId = async () => {
  if (!userId.value) return;
  try {
    await navigator.clipboard.writeText(userId.value);
    userIdCopied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      userIdCopied.value = false;
    }, 1500);
  } catch (err) {
    console.error('Failed to copy user id', err);
  }
};

onMounted(() => {
  ensureLoggedIn();
  if (!displayName.value && requiresName.value) {
    nameError.value = '请输入昵称';
  }
});

onUnmounted(() => {
  dragging.value = false;
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<style scoped>
.setup-page {
  height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 32px) 20px calc(60px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, #fdfcfb, #f4fbff);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  overflow: hidden;
}

.setup-scene {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.avatar-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  position: relative;
  padding-top: 32px;
}

.avatar-circle {
  width: 210px;
  height: 210px;
  border-radius: 10px;
  border: none;
  background: transparent;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease;
  padding: 0;
}

.avatar-circle:active {
  transform: scale(0.98);
}

.avatar-image {
  width: 100%;
  height: 100%;
  border-radius: 10px;
  object-fit: cover;
  display: block;
}

.avatar-overlay-cta {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #fff;
  font-weight: 600;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  background: linear-gradient(180deg, rgba(2, 6, 23, 0.05), rgba(2, 6, 23, 0.55));
  opacity: 0;
  transition: opacity 0.2s ease;
  border-radius: inherit;
}

.avatar-overlay-cta--visible {
  opacity: 1;
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

.name-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
}

.name-text {
  margin: 0;
  font-size: 192px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.1;
}

.name-text--placeholder {
  color: #cbd5f5;
}

.name-edit {
  border: none;
  border-radius: 999px;
  padding: 10px 20px;
  font-weight: 600;
  font-size: 14px;
  color: #0ea5e9;
  background: rgba(14, 165, 233, 0.15);
}

.name-status {
  margin: 0;
}

.setup-actions {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirm-btn {
  border: none;
  border-radius: 999px;
  padding: 16px;
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  background: #0ea5e9;
}

.skip-btn {
  border: none;
  background: transparent;
  color: #0f172a;
  font-weight: 600;
  font-size: 14px;
}

.user-id-chip {
  margin-top: 6px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.12);
  color: #0369a1;
  font-size: 13px;
}

.user-id-chip .chip-text {
  font-weight: 600;
  letter-spacing: 0.02em;
}

.user-id-chip button {
  border: none;
  background: rgba(14, 165, 233, 0.18);
  border-radius: 999px;
  padding: 4px 12px;
  font-weight: 600;
  color: #0369a1;
  cursor: pointer;
  white-space: nowrap;
}

.user-id-block {
  text-align: center;
}

.user-id-label {
  margin: 18px 0 4px;
  font-size: 13px;
  color: #475569;
  letter-spacing: 0.08em;
}

.user-id-chip--floating button {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.status {
  margin: 4px 0 0;
  font-size: 13px;
  color: #b91c1c;
}

.setup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.setup-overlay__panel {
  width: min(420px, 100%);
  background: #fff;
  border-radius: 24px;
  padding: 20px;
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.2);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.overlay-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #0f172a;
}

.cropper-viewport {
  width: min(320px, calc(100vw - 80px));
  height: min(320px, calc(100vw - 80px));
  border-radius: 32px;
  background: #0b1220;
  position: relative;
  overflow: hidden;
  margin: 0 auto;
  touch-action: none;
}

.cropper-image-base {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.cropper-image-shift {
  position: relative;
}

.cropper-image-shift img {
  display: block;
  transform-origin: center;
  user-select: none;
  pointer-events: none;
}

.cropper-mask {
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 0 1200px rgba(2, 6, 23, 0.5);
  border-radius: 32px;
  pointer-events: none;
}

.slider-row input[type='range'] {
  width: 100%;
}

.overlay-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.overlay-actions .primary,
.overlay-actions .ghost {
  border-radius: 999px;
  padding: 10px 18px;
  font-weight: 600;
  border: none;
}

.overlay-actions .primary {
  background: linear-gradient(120deg, #0090d9, #22bbaa);
  color: #fff;
}

.overlay-actions .ghost {
  background: rgba(15, 23, 42, 0.05);
  color: #0f172a;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 600px) {
  .name-text {
    font-size: 26px;
  }

  .setup-overlay {
    padding: 12px;
  }
}
</style>
