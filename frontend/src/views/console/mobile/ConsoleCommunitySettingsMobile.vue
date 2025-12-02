<template>
  <PageMarker label="P3" />
  <div class="community-settings">
    <header class="hero-card" :class="`theme-${portalTheme}`">
      <div class="hero-text">
        <p class="hero-eyebrow">社群設定</p>
        <h1>{{ form.name || 'コミュニティ' }}</h1>
        <p class="hero-subtext">公開情報と AI が参照するプロフィールをここで管理します。</p>
        <button class="portal-btn" type="button" @click="goPortal">
          <span class="i-lucide-layout-template"></span>
          ポータルをカスタマイズ
        </button>
      </div>
      <span class="hero-status">{{ form.visibleLevel === 'private' ? '非公開' : '公開中' }}</span>
    </header>

    <form class="form-sections" @submit.prevent="handleSave">
      <section class="form-card">
        <p class="card-label">基本情報</p>
        <div class="ios-field">
          <label>社群名称</label>
          <input v-model="form.name" type="text" placeholder="Tokyo Community..." disabled />
        </div>
        <div class="ios-field">
          <label>Slug</label>
          <input v-model="form.slug" type="text" disabled />
        </div>
      </section>

      <section class="form-card">
        <div class="card-head">
          <p class="card-label">ラベル</p>
          <p class="card-hint">活動領域やキーワードをカンマ区切りで追加</p>
        </div>
        <div class="ios-field">
          <label>キーワード</label>
          <input v-model="form.labels" type="text" placeholder="多文化, 親子, コミュニティ" />
        </div>
        <div v-if="labelChips.length" class="chip-row">
          <span v-for="chip in labelChips" :key="chip" class="chip">{{ chip }}</span>
        </div>
      </section>

      <section class="form-card">
        <div class="card-head">
          <p class="card-label">公開範囲</p>
          <p class="card-hint">ユーザー側にどこまで表示するかを選びます</p>
        </div>
        <div class="radio-group">
          <label v-for="option in visibleOptions" :key="option.value" class="radio-tile">
            <input v-model="form.visibleLevel" :value="option.value" type="radio" />
            <div class="radio-content">
              <p class="radio-title">{{ option.label }}</p>
              <p class="radio-desc">{{ option.desc }}</p>
            </div>
          </label>
        </div>
      </section>

      <section class="form-card">
        <p class="card-label">ビジュアル</p>
        <div class="upload-grid">
          <div class="upload-card">
            <p class="upload-title">ロゴ</p>
            <div class="upload-drop" @click="triggerLogoUpload">
              <input ref="logoInput" type="file" accept="image/*" class="hidden-input" @change="handleLogoUpload" />
              <div v-if="logoPreview" class="upload-preview">
                <img :src="logoPreview" alt="logo preview" @error="handlePreviewError('logo')" />
              </div>
              <div v-else class="upload-empty">
                <span class="i-lucide-image-plus"></span>
                <p>タップしてアップロード</p>
              </div>
            </div>
          </div>
          <div class="upload-card">
            <p class="upload-title">カバー画像</p>
            <div class="upload-drop" @click="triggerCoverUpload">
              <input ref="coverInput" type="file" accept="image/*" class="hidden-input" @change="handleCoverUpload" />
              <div v-if="coverPreview" class="upload-preview">
                <img :src="coverPreview" alt="cover preview" @error="handlePreviewError('cover')" />
              </div>
              <div v-else class="upload-empty">
                <span class="i-lucide-image-plus"></span>
                <p>タップしてアップロード</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="form-card">
        <div class="card-head">
          <p class="card-label">社群紹介</p>
          <div class="card-head__right">
            <p class="card-hint">AI の憲法/歓迎文にも引用されます</p>
          </div>
        </div>
        <textarea
          v-model="form.description"
          rows="6"
          placeholder="社群のビジョン・活動内容・歓迎する人などを記載してください。"
        ></textarea>
      </section>

    <p v-if="error" class="form-error">{{ error }}</p>
    </form>

    <footer class="form-footer">
      <button type="button" class="ghost-btn" :disabled="saving" @click="router.back()">戻る</button>
      <button type="button" class="primary-btn" :disabled="saving" @click="handleSave">
        {{ saving ? '保存中…' : '保存する' }}
      </button>
    </footer>
    <button class="hero-back" type="button" @click="router.back()">
      <span class="i-lucide-arrow-left"></span>
    </button>
    <ImageCropperModal
      :model-value="showCropper"
      :src="cropSource"
      :aspect-ratio="cropAspect"
      :result-width="cropResultWidth"
      :result-type="cropTarget === 'logo' ? 'image/png' : 'image/jpeg'"
      :loading="croppingLoading"
      title="画像を調整"
      confirm-text="保存する"
      cancel-text="キャンセル"
      @update:modelValue="(val) => (showCropper = val)"
      @confirm="handleCropConfirm"
      @cancel="resetCropper"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted, onActivated } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  fetchConsoleCommunity,
  updateConsoleCommunity,
  uploadCommunityAsset,
} from '../../../api/client';
import type { ConsoleCommunityDetail } from '../../../types/api';
import { getLocalizedText } from '../../../utils/i18nContent';
import { resolveAssetUrl } from '../../../utils/assetUrl';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import PageMarker from '../../../components/PageMarker.vue';
import { useI18n } from 'vue-i18n';
import ImageCropperModal from '../../../components/ImageCropperModal.vue';

const route = useRoute();
const router = useRouter();
const communityStore = useConsoleCommunityStore();
const communityId = route.params.communityId as string;
const { t } = useI18n();

const form = reactive({
  name: '',
  slug: '',
  labels: '',
  visibleLevel: 'public',
  coverImageUrl: '',
  logoImageUrl: '',
  description: '',
});

const coverPreview = ref<string | null>(null);
const logoPreview = ref<string | null>(null);
const coverInput = ref<HTMLInputElement | null>(null);
const logoInput = ref<HTMLInputElement | null>(null);
const uploadingCover = ref(false);
const uploadingLogo = ref(false);
const portalTheme = ref('immersive');
const themeOptions = ['clean', 'immersive', 'warm', 'collage'];

const saving = ref(false);
const error = ref<string | null>(null);
const showCropper = ref(false);
const cropSource = ref<string | null>(null);
const cropTarget = ref<'cover' | 'logo' | null>(null);

const visibleOptions = [
  { value: 'public', label: '公開', desc: '誰でも閲覧できる' },
  { value: 'semi-public', label: '社群限定', desc: 'Console / 既存メンバーのみ' },
  { value: 'private', label: '非公開', desc: '運営メモ用・外部非公開' },
];

const labelChips = computed(() =>
  form.labels
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean),
);

const loadCommunity = async () => {
  if (!communityId) return;
  try {
    const detail = await fetchConsoleCommunity(communityId);
    form.name = detail.name;
    form.slug = detail.slug;
    form.labels = (detail.labels || []).join(', ');
    form.visibleLevel = detail.visibleLevel ?? 'public';
    form.coverImageUrl = normalizeManagedAsset(detail.coverImageUrl);
    coverPreview.value = form.coverImageUrl ? resolveAssetUrl(form.coverImageUrl) : null;
    const descriptionObj =
      typeof detail.description === 'object' && detail.description
        ? (detail.description as ConsoleCommunityDetail['description']) as any
        : null;
    form.description = getLocalizedText(detail.description);
    const logoUrl = descriptionObj?.logoImageUrl ?? '';
    form.logoImageUrl = normalizeManagedAsset(logoUrl);
    logoPreview.value = form.logoImageUrl ? resolveAssetUrl(form.logoImageUrl) : null;
    stripeOnboardLink.value = descriptionObj?._stripeOnboardLink ?? null;
    if (descriptionObj?._portalConfig && typeof descriptionObj._portalConfig.theme === 'string') {
      const theme = descriptionObj._portalConfig.theme;
      portalTheme.value = themeOptions.includes(theme) ? theme : 'immersive';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '社群情報の取得に失敗しました';
  }
};

const buildDescription = () => ({
  original: form.description,
  lang: 'ja',
  translations: {},
  logoImageUrl: form.logoImageUrl || null,
  _stripeOnboardLink: stripeOnboardLink.value || null,
});

const triggerCoverUpload = () => coverInput.value?.click();
const triggerLogoUpload = () => logoInput.value?.click();

const stripeOnboardLink = ref<string | null>(null);

const cropAspect = computed(() => {
  if (cropTarget.value === 'cover') return 16 / 9;
  if (cropTarget.value === 'logo') return 1;
  return 1;
});

const cropResultWidth = computed(() => (cropTarget.value === 'cover' ? 1280 : 512));
const croppingLoading = computed(() => cropTarget.value === 'cover' ? uploadingCover.value : uploadingLogo.value);

const handleCoverUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || uploadingCover.value) return;
  if (!communityId) {
    error.value = 'コミュニティ ID が取得できません。ページを再読み込みしてください。';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    cropTarget.value = 'cover';
    cropSource.value = reader.result as string;
    showCropper.value = true;
  };
  reader.readAsDataURL(file);
  target.value = '';
};

const handleLogoUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || uploadingLogo.value) return;
  if (!communityId) {
    error.value = 'コミュニティ ID が取得できません。ページを再読み込みしてください。';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    cropTarget.value = 'logo';
    cropSource.value = reader.result as string;
    showCropper.value = true;
  };
  reader.readAsDataURL(file);
  target.value = '';
};

const resetCropper = () => {
  showCropper.value = false;
  cropSource.value = null;
  cropTarget.value = null;
};

const handleCropConfirm = async (blob: Blob) => {
  if (!cropTarget.value || !communityId) return;
  const filename = `${cropTarget.value}-${Date.now()}.jpg`;
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });

  if (cropTarget.value === 'cover') {
    uploadingCover.value = true;
    try {
      const { imageUrl } = await uploadCommunityAsset(communityId, file, 'cover');
      form.coverImageUrl = normalizeManagedAsset(imageUrl);
      coverPreview.value = form.coverImageUrl ? resolveAssetUrl(form.coverImageUrl) : null;
    } catch (err) {
      console.warn(err);
    } finally {
      uploadingCover.value = false;
      resetCropper();
    }
    return;
  }

  if (cropTarget.value === 'logo') {
    uploadingLogo.value = true;
    try {
      const { imageUrl } = await uploadCommunityAsset(communityId, file, 'logo');
      form.logoImageUrl = normalizeManagedAsset(imageUrl);
      logoPreview.value = form.logoImageUrl ? resolveAssetUrl(form.logoImageUrl) : null;
    } catch (err) {
      console.warn(err);
    } finally {
      uploadingLogo.value = false;
      resetCropper();
    }
  }
};

const handleSave = async () => {
  if (!communityId) return;
  saving.value = true;
  error.value = null;
  const payload = {
    labels: labelChips.value,
    visibleLevel: form.visibleLevel,
    coverImageUrl: form.coverImageUrl || null,
    logoImageUrl: form.logoImageUrl || null,
    description: buildDescription(),
  };
  try {
    await updateConsoleCommunity(communityId, payload);
    await loadCommunity();
    await communityStore.loadCommunities(true);
    communityStore.refreshActiveCommunity();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '更新に失敗しました';
  } finally {
    saving.value = false;
  }
};

const goPortal = () => {
  if (!communityId) return;
  router.push({ name: 'ConsoleMobileCommunityPortal', params: { communityId } });
};

const handlePreviewError = (type: 'cover' | 'logo') => {
  if (type === 'cover') {
    coverPreview.value = null;
    form.coverImageUrl = '';
  } else {
    logoPreview.value = null;
    form.logoImageUrl = '';
  }
};

const normalizeManagedAsset = (url?: string | null) => {
  if (!url) return '';
  let v = url.trim();
  if (!v) return '';
  // strip api prefix
  if (v.startsWith('/api/v1/')) {
    v = v.slice('/api/v1/'.length - 1);
  }
  if (v.startsWith('/uploads/')) {
    v = v.slice('/uploads/'.length);
  } else if (v.startsWith('uploads/')) {
    v = v.slice('uploads/'.length);
  }
  if (!v) return '';
  return v;
};

onMounted(loadCommunity);
onActivated(loadCommunity);
</script>

<style scoped>
.community-settings {
  min-height: auto;
  background: #f4f6fb;
  padding-bottom: calc(90px + env(safe-area-inset-bottom, 0px));
}
.hero-card {
  margin: 16px 16px 0;
  padding: 18px;
  border-radius: 24px;
  background: linear-gradient(135deg, #0f3057, #45aee2);
  color: #f0f9ff;
  box-shadow: 0 25px 45px rgba(15, 23, 42, 0.2);
  position: relative;
}
.hero-card.theme-clean {
  background: linear-gradient(135deg, #e2e8f0, #cbd5e1);
  color: #0f172a;
}
.hero-card.theme-immersive {
  background: linear-gradient(135deg, #0f3057, #45aee2);
}
.hero-card.theme-warm {
  background: linear-gradient(135deg, #c2410c, #f97316);
}
.hero-card.theme-collage {
  background: linear-gradient(135deg, #6b21a8, #4f46e5);
}
.hero-back {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: none;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  margin-bottom: 12px;
}
.hero-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.portal-btn {
  align-self: flex-start;
  margin-top: 6px;
  border: none;
  border-radius: 14px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.16);
  color: #f8fafc;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.18);
}
.hero-eyebrow {
  margin: 0;
  font-size: 12px;
  opacity: 0.85;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.hero-text h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
}
.hero-subtext {
  margin: 0;
  font-size: 14px;
  opacity: 0.9;
}
.hero-status {
  position: absolute;
  top: 18px;
  right: 18px;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  font-size: 12px;
}
.form-sections {
  padding: 0 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-card {
  background: #fff;
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 18px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card-label {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.card-hint {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
.card-head__right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.link-btn {
  border: none;
  background: linear-gradient(135deg, #2563eb, #60a5fa);
  color: #fff;
  border-radius: 999px;
  padding: 8px 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 13px;
}
.ios-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ios-field label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}
.ios-field input {
  border: none;
  background: rgba(15, 23, 42, 0.04);
  border-radius: 14px;
  padding: 12px;
  font-size: 15px;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  font-size: 12px;
  color: #0f172a;
}
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.radio-tile {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.04);
}
.radio-tile input {
  width: 18px;
  height: 18px;
}
.radio-content {
  flex: 1;
}
.radio-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.radio-desc {
  margin: 0;
  font-size: 12px;
  color: #475569;
}
.upload-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.upload-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.upload-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}
.upload-drop {
  border-radius: 16px;
  border: 1px dashed rgba(15, 23, 42, 0.2);
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.03);
  cursor: pointer;
  position: relative;
  overflow: hidden;
}
.hidden-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.upload-empty {
  text-align: center;
  color: #475569;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.upload-empty span {
  font-size: 28px;
  color: #0f172a;
}
.upload-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.form-card textarea {
  border: none;
  border-radius: 16px;
  padding: 14px;
  font-size: 15px;
  background: rgba(15, 23, 42, 0.04);
  resize: vertical;
}
.form-error {
  color: #dc2626;
  margin: 0 16px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(220, 38, 38, 0.1);
}
.form-footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  background: rgba(244, 246, 251, 0.95);
  box-shadow: 0 -12px 30px rgba(15, 23, 42, 0.12);
  display: flex;
  gap: 12px;
}
.ghost-btn,
.primary-btn {
  flex: 1;
  border-radius: 999px;
  padding: 14px;
  font-size: 15px;
  font-weight: 600;
  border: none;
}
.ghost-btn {
  background: #fff;
  color: #0f172a;
  border: 1px solid rgba(15, 23, 42, 0.12);
}
.primary-btn {
  background: linear-gradient(135deg, #0ea5e9, #2563eb);
  color: #fff;
  box-shadow: 0 12px 25px rgba(37, 99, 235, 0.25);
}
.primary-btn:disabled {
  opacity: 0.6;
  box-shadow: none;
}
</style>
