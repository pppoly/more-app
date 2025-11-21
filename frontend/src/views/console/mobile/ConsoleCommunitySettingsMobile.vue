<template>
  <div class="community-settings">
    <header class="hero-card">
      <button class="hero-back" type="button" @click="router.back()">
        <span class="i-lucide-chevron-left"></span>
      </button>
      <div class="hero-text">
        <p class="hero-eyebrow">社群設定</p>
        <h1>{{ form.name || 'コミュニティ' }}</h1>
        <p class="hero-subtext">公開情報と AI が参照するプロフィールをここで管理します。</p>
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
                <img :src="logoPreview" alt="logo preview" />
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
                <img :src="coverPreview" alt="cover preview" />
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
            <button class="link-btn" type="button" :disabled="stripeOnboardLoading" @click="startStripeOnboard">
              <span class="i-lucide-credit-card"></span>
              {{ stripeOnboardLoading ? '接続中…' : 'Stripe収款を連携' }}
            </button>
          </div>
        </div>
        <textarea
          v-model="form.description"
          rows="6"
          placeholder="社群のビジョン・活動内容・歓迎する人などを記載してください。"
        ></textarea>
        <p v-if="stripeOnboardLink" class="stripe-hint">
          リンクを開けない場合はこちら:
          <a :href="stripeOnboardLink" target="_blank">Stripe Onboard</a>
        </p>
      </section>

      <p v-if="error" class="form-error">{{ error }}</p>
    </form>

    <footer class="form-footer">
      <button type="button" class="ghost-btn" :disabled="saving" @click="router.back()">戻る</button>
      <button type="button" class="primary-btn" :disabled="saving" @click="handleSave">
        {{ saving ? '保存中…' : '保存する' }}
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  fetchConsoleCommunity,
  startCommunityStripeOnboarding,
  updateConsoleCommunity,
  uploadCommunityAsset,
} from '../../../api/client';
import type { ConsoleCommunityDetail } from '../../../types/api';
import { getLocalizedText } from '../../../utils/i18nContent';
import { resolveAssetUrl } from '../../../utils/assetUrl';

const route = useRoute();
const router = useRouter();
const communityId = route.params.communityId as string;

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

const saving = ref(false);
const error = ref<string | null>(null);

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
    form.coverImageUrl = detail.coverImageUrl || '';
    coverPreview.value = form.coverImageUrl ? resolveAssetUrl(form.coverImageUrl) : null;
    const descriptionObj =
      typeof detail.description === 'object' && detail.description
        ? (detail.description as ConsoleCommunityDetail['description']) as any
        : null;
    form.description = getLocalizedText(detail.description);
    form.logoImageUrl = descriptionObj?.logoImageUrl ?? '';
    logoPreview.value = form.logoImageUrl ? resolveAssetUrl(form.logoImageUrl) : null;
    stripeOnboardLink.value = descriptionObj?._stripeOnboardLink ?? null;
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

const stripeOnboardLoading = ref(false);
const stripeOnboardLink = ref<string | null>(null);

const startStripeOnboard = async () => {
  stripeOnboardLoading.value = true;
  error.value = null;
  try {
    const { url } = await startCommunityStripeOnboarding(communityId);
    stripeOnboardLink.value = url;
    window.open(url, '_blank');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Stripe 連携リンクの取得に失敗しました';
  } finally {
    stripeOnboardLoading.value = false;
  }
};

const cropImage = (file: File, aspectRatio: number, targetWidth: number) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        let cropWidth = width;
        let cropHeight = cropWidth / aspectRatio;
        if (cropHeight > height) {
          cropHeight = height;
          cropWidth = cropHeight * aspectRatio;
        }
        const startX = (width - cropWidth) / 2;
        const startY = (height - cropHeight) / 2;
        const outputWidth = Math.min(targetWidth, cropWidth);
        const outputHeight = outputWidth / aspectRatio;
        const canvas = document.createElement('canvas');
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not supported'));
          return;
        }
        ctx.drawImage(img, startX, startY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const dataUrlToFile = async (dataUrl: string, filename: string) => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
};

const handleCoverUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || uploadingCover.value) return;
  uploadingCover.value = true;
  try {
    const dataUrl = await cropImage(file, 16 / 9, 1280);
    coverPreview.value = dataUrl;
    const uploadFile = await dataUrlToFile(dataUrl, `cover-${Date.now()}.jpg`);
    const { imageUrl } = await uploadCommunityAsset(uploadFile, 'cover');
    form.coverImageUrl = imageUrl;
    coverPreview.value = resolveAssetUrl(imageUrl);
  } catch (err) {
    console.warn(err);
  } finally {
    uploadingCover.value = false;
  }
};

const handleLogoUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || uploadingLogo.value) return;
  uploadingLogo.value = true;
  try {
    const dataUrl = await cropImage(file, 1, 512);
    logoPreview.value = dataUrl;
    const uploadFile = await dataUrlToFile(dataUrl, `logo-${Date.now()}.jpg`);
    const { imageUrl } = await uploadCommunityAsset(uploadFile, 'logo');
    form.logoImageUrl = imageUrl;
    logoPreview.value = resolveAssetUrl(imageUrl);
  } catch (err) {
    console.warn(err);
  } finally {
    uploadingLogo.value = false;
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
  } catch (err) {
    error.value = err instanceof Error ? err.message : '更新に失敗しました';
  } finally {
    saving.value = false;
  }
};

onMounted(loadCommunity);
</script>

<style scoped>
.community-settings {
  min-height: 100vh;
  background: #f4f6fb;
  padding-bottom: calc(90px + env(safe-area-inset-bottom, 0px));
}
.hero-card {
  margin: 16px;
  padding: 18px;
  border-radius: 24px;
  background: linear-gradient(135deg, #0f3057, #45aee2);
  color: #f0f9ff;
  box-shadow: 0 25px 45px rgba(15, 23, 42, 0.2);
  position: relative;
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
