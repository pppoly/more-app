<template>
  <PageMarker label="P2" />
  <div class="community-form">
    <header class="hero-card">
      <button class="hero-back" type="button" @click="goBack">
        <span class="i-lucide-chevron-left"></span>
      </button>
      <div class="hero-text">
        <p class="hero-eyebrow">{{ isEdit ? '社群設定' : '新しい社群' }}</p>
        <h1>{{ isEdit ? '社群資料を更新' : '社群を登録' }}</h1>
        <p class="hero-subtext">
          AI が社群情報を参照しながら活動助手を最適化します。ベーシックな情報から入力しましょう。
        </p>
      </div>
      <span class="hero-status">{{ isEdit ? '編集中' : '草稿' }}</span>
    </header>

    <form class="form-sections" @submit.prevent="handleSubmit">
      <section class="form-card">
        <p class="card-label">基本情報</p>
        <div class="ios-field">
          <label>社群名称</label>
          <input v-model="form.name" type="text" placeholder="Tokyo Community..." required />
        </div>
        <div class="ios-field">
          <label>Slug</label>
          <input v-model="form.slug" type="text" :disabled="isEdit" placeholder="tokyo-community" required />
        </div>
      </section>

      <section class="form-card">
        <div class="card-head">
          <p class="card-label">ラベル</p>
          <p class="card-hint">カンマ区切りで入力 / ワンタップで編集</p>
        </div>
        <div class="ios-field">
          <label>キーワード</label>
          <input v-model="form.labels" type="text" placeholder="親子, 多文化, NPO" />
        </div>
        <div v-if="labelChips.length" class="chip-row">
          <span v-for="chip in labelChips" :key="chip" class="chip">{{ chip }}</span>
        </div>
      </section>

      <section class="form-card">
        <div class="card-head">
          <p class="card-label">公開範囲</p>
          <p class="card-hint">ユーザー側にどこまで公開するかを決めます</p>
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
            <p class="upload-title">ロゴ画像</p>
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
          <p class="card-label">紹介文</p>
          <p class="card-hint">AI に渡る原稿です。ミッション・活動内容・対象者などを書きましょう。</p>
        </div>
        <textarea
          v-model="form.description"
          rows="6"
          placeholder="例：Tokyo Community Organizations Meetup Group は..."
        ></textarea>
      </section>

      <p v-if="error" class="form-error">{{ error }}</p>
    </form>

    <footer class="form-footer">
      <button type="button" class="ghost-btn" @click="goBack">キャンセル</button>
      <button type="button" class="primary-btn" :disabled="submitting" @click="handleSubmit">
        {{ submitting ? '保存中…' : '保存する' }}
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { createConsoleCommunity, fetchConsoleCommunity, updateConsoleCommunity, uploadCommunityAsset } from '../../../api/client';
import type { ConsoleCommunityDetail } from '../../../types/api';
import { resolveAssetUrl } from '../../../utils/assetUrl';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import PageMarker from '../../../components/PageMarker.vue';

const route = useRoute();
const router = useRouter();
const communityStore = useConsoleCommunityStore();
const communityId = computed(() => route.params.communityId as string | undefined);
const isEdit = computed(() => Boolean(communityId.value));

const form = reactive({
  name: '',
  slug: '',
  labels: '',
  visibleLevel: 'public',
  coverImageUrl: '',
  logoImageUrl: '',
  description: '',
});
const logoInput = ref<HTMLInputElement | null>(null);
const coverInput = ref<HTMLInputElement | null>(null);
const logoPreview = ref<string | null>(null);
const coverPreview = ref<string | null>(null);
const uploadingLogo = ref(false);
const uploadingCover = ref(false);
const pendingLogoFile = ref<File | null>(null);
const pendingCoverFile = ref<File | null>(null);

const submitting = ref(false);
const error = ref<string | null>(null);

const visibleOptions = [
  { value: 'public', label: '公開', desc: '誰でも閲覧できる' },
  { value: 'semi-public', label: '社群内公開', desc: 'Console / 既存メンバーのみ' },
  { value: 'private', label: '非公開', desc: '運営メモ用・外部非公開' },
];

const labelChips = computed(() =>
  form.labels
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean),
);

const load = async () => {
  if (!communityId.value) return;
  try {
    const data = await fetchConsoleCommunity(communityId.value);
    form.name = data.name;
    form.slug = data.slug;
    form.visibleLevel = data.visibleLevel || 'public';
    form.labels = (data.labels || []).join(', ');
    form.coverImageUrl = data.coverImageUrl || '';
    coverPreview.value = form.coverImageUrl ? resolveAssetUrl(form.coverImageUrl) : null;
    const descriptionObj =
      typeof data.description === 'object' && data.description
        ? (data.description as ConsoleCommunityDetail['description'])
        : null;
    form.description = descriptionObj?.original ?? '';
    form.logoImageUrl = (descriptionObj as any)?.logoImageUrl ?? '';
    logoPreview.value = form.logoImageUrl ? resolveAssetUrl(form.logoImageUrl) : null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '読み込みに失敗しました';
  }
};

const buildDescription = () => ({
  original: form.description,
  lang: 'ja',
  translations: {},
  logoImageUrl: form.logoImageUrl || null,
});

const triggerLogoUpload = () => {
  logoInput.value?.click();
};

const triggerCoverUpload = () => {
  coverInput.value?.click();
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

const handleLogoUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || uploadingLogo.value) return;
  uploadingLogo.value = true;
  try {
    const dataUrl = await cropImage(file, 1, 512);
    logoPreview.value = dataUrl;
    const uploadFile = await dataUrlToFile(dataUrl, `logo-${Date.now()}.jpg`);
    if (isEdit.value && communityId.value) {
      const { imageUrl } = await uploadCommunityAsset(communityId.value, uploadFile, 'logo');
      form.logoImageUrl = imageUrl;
      logoPreview.value = resolveAssetUrl(imageUrl);
      pendingLogoFile.value = null;
    } else {
      pendingLogoFile.value = uploadFile;
      form.logoImageUrl = '';
    }
  } catch (err) {
    console.warn(err);
  } finally {
    uploadingLogo.value = false;
  }
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
    if (isEdit.value && communityId.value) {
      const { imageUrl } = await uploadCommunityAsset(communityId.value, uploadFile, 'cover');
      form.coverImageUrl = imageUrl;
      coverPreview.value = resolveAssetUrl(imageUrl);
      pendingCoverFile.value = null;
    } else {
      pendingCoverFile.value = uploadFile;
      form.coverImageUrl = '';
    }
  } catch (err) {
    console.warn(err);
  } finally {
    uploadingCover.value = false;
  }
};

const handleSubmit = async () => {
  submitting.value = true;
  error.value = null;
  const basePayload = {
    name: form.name,
    slug: form.slug,
    labels: labelChips.value,
    visibleLevel: form.visibleLevel,
    coverImageUrl: isEdit.value ? form.coverImageUrl || null : null,
    logoImageUrl: isEdit.value ? form.logoImageUrl || null : null,
    description: buildDescription(),
  };
  const uploadPendingAssets = async (targetId: string) => {
    const updates: Record<string, any> = {};
    if (pendingCoverFile.value) {
      const { imageUrl } = await uploadCommunityAsset(targetId, pendingCoverFile.value, 'cover');
      form.coverImageUrl = imageUrl;
      coverPreview.value = resolveAssetUrl(imageUrl);
      pendingCoverFile.value = null;
      updates.coverImageUrl = imageUrl;
    }
    if (pendingLogoFile.value) {
      const { imageUrl } = await uploadCommunityAsset(targetId, pendingLogoFile.value, 'logo');
      form.logoImageUrl = imageUrl;
      logoPreview.value = resolveAssetUrl(imageUrl);
      pendingLogoFile.value = null;
      updates.logoImageUrl = imageUrl;
    }
    if (Object.keys(updates).length) {
      updates.description = buildDescription();
      await updateConsoleCommunity(targetId, updates);
    }
  };
  try {
    if (isEdit.value && communityId.value) {
      await updateConsoleCommunity(communityId.value, basePayload);
      await uploadPendingAssets(communityId.value);
      await communityStore.loadCommunities(true);
      communityStore.refreshActiveCommunity();
    } else {
      const created = await createConsoleCommunity({ ...basePayload, coverImageUrl: null, logoImageUrl: null });
      const targetId = created?.id;
      if (targetId) {
        await uploadPendingAssets(targetId);
        await communityStore.loadCommunities(true);
        communityStore.setActiveCommunity(targetId);
      } else {
        await communityStore.loadCommunities(true);
      }
    }
    router.replace({ name: 'ConsoleMobileHome' });
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存に失敗しました';
  } finally {
    submitting.value = false;
  }
};

const goBack = () => {
  router.back();
};

onMounted(load);
</script>

<style scoped>
/* same styles as previous mobile version */
.community-form {
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
  overflow: hidden;
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
  opacity: 0.9;
  font-size: 14px;
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
.ios-field input:disabled {
  opacity: 0.6;
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
.cover-preview {
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.08);
}
.cover-preview img {
  display: block;
  width: 100%;
  height: auto;
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
