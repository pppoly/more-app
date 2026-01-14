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
              {{ avatarUploading ? 'アップロード中…' : hasAvatar ? 'タップして変更' : 'タップして追加' }}
            </span>
          </div>
        </button>
        <p v-if="avatarError" class="status">{{ avatarError }}</p>
      </div>

      <div class="name-block">
        <p class="name-text" :class="{ 'name-text--placeholder': !displayName }" @click="handleNameTap">
          {{ displayName || 'ニックネームを設定してください' }}
        </p>
        <button type="button" class="name-edit" @click="handleNameTap">
          {{ displayName ? 'ニックネームを変更' : 'ニックネームを設定' }}
        </button>
        <p v-if="nameError" class="status name-status">{{ nameError }}</p>
      </div>

      <div class="email-block">
        <p class="email-label">メールアドレス（任意）</p>
        <input
          v-model="emailDraft"
          type="email"
          placeholder="example@domain.com"
          @input="emailTouched = true; emailError = ''"
        />
        <p class="email-hint">コミュニティのサービス情報をメールで受け取れます。</p>
        <p v-if="emailError" class="status">{{ emailError }}</p>
      </div>
    </div>

    <div class="setup-actions">
      <button type="button" class="confirm-btn" :disabled="confirming" @click="confirmSetup">
        {{ confirming ? '処理中…' : '完了' }}
      </button>
      <button v-if="showSkip" type="button" class="skip-btn" @click="skipSetup">後で設定</button>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="sr-only"
      @change="onAvatarFileSelected"
    />

    <ImageCropperModal
      :model-value="showCropper"
      :src="cropSource"
      :aspect-ratio="1"
      :result-width="400"
      result-type="image/png"
      :loading="avatarUploading"
      title="アバターを切り抜き"
      confirm-text="このアバターを使う"
      cancel-text="キャンセル"
      :show-circle-guide="true"
      @update:modelValue="(val) => (showCropper = val)"
      @confirm="handleCropConfirm"
      @cancel="cancelCropper"
    />

    <teleport to="body">
      <transition name="fade">
        <div v-if="nameEditorVisible" class="setup-overlay">
          <div class="setup-overlay__panel">
            <p class="overlay-title">ニックネームを入力</p>
            <input
              ref="nameInput"
              v-model="nameDraft"
              class="name-input"
              type="text"
              maxlength="40"
              placeholder="ニックネームを入力してください"
            />
            <p v-if="nameEditorError" class="status">{{ nameEditorError }}</p>
            <div class="overlay-actions">
              <button type="button" class="ghost" @click="closeNameEditor">キャンセル</button>
              <button type="button" class="primary" :disabled="nameSaving" @click="confirmNameEdit">
                {{ nameSaving ? '保存中…' : '完了' }}
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
import { validateAvatarFile } from '../../utils/validateAvatarFile';
import ImageCropperModal from '../../components/ImageCropperModal.vue';

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
const emailDraft = ref(user.value?.email ?? '');
const emailError = ref('');
const emailTouched = ref(false);

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
watch(
  () => user.value?.email,
  (next) => {
    if (!emailTouched.value) {
      emailDraft.value = next ?? '';
    }
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
const showCropper = ref(false);

const onAvatarFileSelected = async (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  const file = target?.files?.[0];
  if (!file) return;
  try {
    avatarError.value = '';
    await validateAvatarFile(file, { requireSquare: false });
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      cropSource.value = result;
      showCropper.value = true;
    };
    reader.readAsDataURL(file);
  } catch (err) {
    avatarError.value =
      err instanceof Error
        ? 'この写真は適していません。鮮明な写真に変えてお試しください。'
        : 'アバターのアップロードに失敗しました。別の写真でお試しください。';
  } finally {
    if (target) target.value = '';
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
    avatarError.value = '';
    cancelCropper();
  } catch (err) {
    avatarError.value = 'アバターのアップロードに失敗しました。別の写真で試すか時間をおいてください。';
  } finally {
    avatarUploading.value = false;
  }
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
    nameEditorError.value = 'ニックネームを入力してください';
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
    nameEditorError.value = err instanceof Error ? err.message : '保存に失敗しました';
  } finally {
    nameSaving.value = false;
  }
};

const confirmSetup = async () => {
  ensureLoggedIn();
  if (avatarRequired.value && !hasAvatar.value) {
    avatarError.value = '先にアバターを追加してください';
    return;
  }
  if (requiresName.value && !displayName.value.trim()) {
    nameError.value = 'ニックネームを入力してください';
    handleNameTap();
    return;
  }
  const normalizedEmail = emailDraft.value.trim().toLowerCase();
  if (normalizedEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      emailError.value = 'メールアドレスの形式を確認してください';
      return;
    }
  }
  confirming.value = true;
  try {
    if (normalizedEmail && normalizedEmail !== (user.value?.email ?? '').toLowerCase()) {
      const profile = await updateProfile({ email: normalizedEmail });
      setUserProfile(profile);
      emailError.value = '';
    }
    await fetchCurrentUser();
    await router.replace(redirectUrl.value);
  } catch (err) {
    nameError.value = err instanceof Error ? err.message : '保存に失敗しました';
  } finally {
    confirming.value = false;
  }
};

const skipSetup = () => {
  router.replace(redirectUrl.value);
};

onMounted(() => {
  ensureLoggedIn();
  if (!displayName.value && requiresName.value) {
    nameError.value = 'ニックネームを入力してください';
  }
});

onUnmounted(() => {
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
  border-radius: 50%;
  border: none;
  background: transparent;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease;
  padding: 0;
  display: grid;
  place-items: center;
}

.avatar-circle:active {
  transform: scale(0.98);
}

.avatar-image {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: contain;
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

.email-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: min(320px, 100%);
  text-align: left;
}
.email-label {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}
.email-block input {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 15px;
  width: 100%;
  box-sizing: border-box;
}
.email-hint {
  margin: 0;
  font-size: 12px;
  color: #64748b;
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
.name-input {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 16px;
  min-height: 44px;
  width: 100%;
  box-sizing: border-box;
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
