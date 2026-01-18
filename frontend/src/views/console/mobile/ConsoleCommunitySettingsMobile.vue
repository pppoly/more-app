<template>
  <div class="community-settings">
    <ConsoleTopBar v-if="showTopBar" :title="pageTitle" @back="goBack">
      <template #right>
        <button type="button" class="link-btn" @click="goPortal">ポータル</button>
      </template>
    </ConsoleTopBar>
    <form class="form-sections" @submit.prevent="handleSave">
      <section class="form-card sheet">
        <p class="card-label">基本情報</p>
        <div class="ios-input-block">
          <div class="ios-input-group">
            <div class="ios-row ios-row--input">
              <span class="ios-label">コミュニティ名</span>
              <div class="ios-value ios-value--inline-input">
                <input v-model="form.name" type="text" placeholder="Tokyo Community..." />
              </div>
            </div>
            <div class="ios-row ios-row--input" :class="{ 'ios-row--disabled': !isCreateMode }">
              <span class="ios-label">ホームページ名</span>
              <div class="ios-value ios-value--inline-input">
                <input v-model="form.slug" type="text" :disabled="!isCreateMode" />
                <span v-if="isCreateMode" class="ios-suffix">設定</span>
              </div>
            </div>
          </div>
          <div v-if="slugPreviewUrl" class="slug-preview" :class="{ 'is-expanded': isSlugPreviewExpanded }">
            <span
              class="slug-url"
              :class="{ 'is-expanded': isSlugPreviewExpanded }"
              :title="slugPreviewUrl"
              role="button"
              tabindex="0"
              :aria-expanded="isSlugPreviewExpanded ? 'true' : 'false'"
              @click="toggleSlugPreview"
              @keydown.enter.prevent="toggleSlugPreview"
              @keydown.space.prevent="toggleSlugPreview"
            >
              {{ slugPreviewUrl }}
            </span>
            <button v-if="canCopySlug" type="button" class="slug-copy" @click="copySlugUrl">
              コピー
            </button>
          </div>
          <p class="slug-note">この名前であなたのホームページが作られます。</p>
        </div>
        <button type="button" class="list-row" @click="triggerLogoUpload()">
          <div class="list-meta">
            <p class="list-title">ロゴ</p>
            <p class="list-desc">1:1 正方形、透過推奨</p>
          </div>
          <div class="list-thumb">
            <img v-if="logoPreview" :src="logoPreview" alt="logo preview" @error="handlePreviewError('logo')" />
            <span v-else class="thumb-placeholder i-lucide-image"></span>
          </div>
          <span class="i-lucide-chevron-right list-chevron"></span>
        </button>
        <button type="button" class="list-row" @click="triggerCoverUpload()">
          <div class="list-meta">
            <p class="list-title">カバー画像（任意）</p>
            <p class="list-desc">16:9 横長、1MB 以内</p>
          </div>
          <div class="list-thumb list-thumb--wide">
            <img v-if="coverPreview" :src="coverPreview" alt="cover preview" @error="handlePreviewError('cover')" />
            <span v-else class="thumb-placeholder i-lucide-image"></span>
          </div>
          <span class="i-lucide-chevron-right list-chevron"></span>
        </button>
      </section>

      <section class="form-card sheet">
        <button type="button" class="list-row" @click="openTagSheet">
          <div class="list-meta">
            <p class="list-title">コミュニティのタグ</p>
            <p class="list-desc">最大 5 つまで</p>
          </div>
          <div class="tag-badge-group">
            <span v-for="chip in labelChips" :key="chip" class="tag-badge">{{ chip }}</span>
            <span v-if="!labelChips.length" class="tag-placeholder">未選択</span>
          </div>
          <span class="i-lucide-chevron-right list-chevron"></span>
        </button>
      </section>

      <section class="form-card sheet">
        <button type="button" class="list-row" @click="visibilitySheetOpen = true">
          <div class="list-meta">
            <p class="list-title">公開範囲</p>
          </div>
          <div class="visible-pill">
            <span class="visible-label">{{ currentVisibleOption.label }}</span>
          </div>
          <span class="i-lucide-chevron-right list-chevron"></span>
        </button>
      </section>

      <section class="form-card sheet">
        <div class="card-head">
          <p class="card-label">コミュニティ紹介</p>
        </div>
        <textarea
          v-model="form.description"
          rows="12"
          placeholder="コミュニティのビジョン・活動内容・歓迎する人などを記載してください。"
        ></textarea>
      </section>

    <p v-if="error" class="form-error">{{ error }}</p>
    </form>

    <footer class="form-footer">
      <button type="button" class="primary-btn" :disabled="saving" @click="handleSave">
        {{ saving ? '保存中…' : '保存する' }}
      </button>
    </footer>
    <input ref="logoInput" type="file" class="hidden-input" accept="image/*" @change="handleLogoUpload" />
    <input ref="coverInput" type="file" class="hidden-input" accept="image/*" @change="handleCoverUpload" />
    <ImageCropperModal
      :model-value="showCropper"
      :src="cropSource"
      :aspect-ratio="cropAspect"
      :result-width="cropResultWidth"
      :result-type="cropTarget === 'logo' ? 'image/png' : 'image/jpeg'"
      :show-circle-guide="cropTarget === 'logo'"
      :loading="croppingLoading"
      title="画像を調整"
      confirm-text="保存する"
      cancel-text="キャンセル"
      @update:modelValue="(val) => (showCropper = val)"
      @confirm="handleCropConfirm"
      @cancel="resetCropper"
    />

    <transition name="fade">
      <div v-if="tagSheetOpen" class="sheet-overlay" @click.self="tagSheetOpen = false">
        <div class="sheet-panel sheet-panel--full">
          <header class="sheet-head">
            <p class="sheet-title">タグを選択（最大5つ）</p>
            <button type="button" class="sheet-close" @click="tagSheetOpen = false">
              ×
            </button>
          </header>
          <div class="tag-sheet">
            <div v-if="tagLoading" class="tag-empty">読み込み中…</div>
            <template v-else>
              <div v-if="!tagCategories.length" class="tag-empty">タグが設定されていません</div>
              <div v-for="cat in tagCategories" :key="cat.id" class="tag-group">
                <p class="tag-group-title">{{ displayName(cat) }}</p>
                <div class="tag-chip-list">
                  <button
                    v-for="tag in cat.tags"
                    :key="tag.id"
                    type="button"
                    class="tag-chip"
                    :class="{ 'is-selected': selectedTags.includes(displayName(tag)) }"
                    @click="toggleTag(displayName(tag))"
                  >
                    <span class="tag-label">{{ displayName(tag) }}</span>
                    <span v-if="selectedTags.includes(displayName(tag))" class="i-lucide-check"></span>
                  </button>
                </div>
              </div>
            </template>
          </div>
          <div class="sheet-actions">
            <button type="button" class="ghost-btn" @click="tagSheetOpen = false">閉じる</button>
            <button type="button" class="primary-btn" @click="tagSheetOpen = false">決定</button>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="visibilitySheetOpen" class="sheet-overlay" @click.self="visibilitySheetOpen = false">
        <div class="sheet-panel">
          <header class="sheet-head">
            <p class="sheet-title">公開範囲を選択</p>
            <button type="button" class="sheet-close" @click="visibilitySheetOpen = false">
              ×
            </button>
          </header>
          <div class="visible-list">
            <button
              v-for="option in visibleOptions"
              :key="option.value"
              type="button"
              class="visible-row"
              :class="{ 'is-active': form.visibleLevel === option.value }"
              @click="setVisible(option.value)"
            >
              <div class="visible-text">
                <p class="visible-title">{{ option.label }}</p>
                <p class="visible-desc">{{ option.desc }}</p>
                <p v-if="option.note" class="visible-note">{{ option.note }}</p>
              </div>
              <span class="radio-indicator" :class="{ 'is-checked': form.visibleLevel === option.value }"></span>
            </button>
          </div>
          <div class="sheet-actions">
            <button type="button" class="ghost-btn" @click="visibilitySheetOpen = false">閉じる</button>
            <button type="button" class="primary-btn" @click="visibilitySheetOpen = false">決定</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted, onActivated, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  fetchConsoleCommunity,
  updateConsoleCommunity,
  uploadCommunityAsset,
  fetchCommunityTags,
  createConsoleCommunity,
} from '../../../api/client';
import type { ConsoleCommunityDetail, CommunityTagCategory } from '../../../types/api';
import { getLocalizedText } from '../../../utils/i18nContent';
import { resolveAssetUrl } from '../../../utils/assetUrl';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import { useI18n } from 'vue-i18n';
import { useToast } from '../../../composables/useToast';
import { isLiffClient } from '../../../utils/device';
import { isLineInAppBrowser } from '../../../utils/liff';
import { APP_TARGET } from '../../../config';
import ImageCropperModal from '../../../components/ImageCropperModal.vue';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';

const route = useRoute();
const router = useRouter();
const communityStore = useConsoleCommunityStore();
const communityId = ref<string | null>((route.params.communityId as string) || null);
const { t } = useI18n();
const toast = useToast();
const isCreateMode = computed(() => !communityId.value || communityId.value === 'new');
const isLiffClientMode = computed(() => APP_TARGET === 'liff' || isLineInAppBrowser() || isLiffClient());
const isLiffEntry = computed(() => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.has('liff.state') || params.has('liff.referrer')) return true;
  const from = params.get('from') || params.get('src') || params.get('entrySource');
  if (from && from.toLowerCase() === 'liff') return true;
  if (
    typeof document !== 'undefined' &&
    (document.referrer.includes('liff.line.me') || document.referrer.includes('miniapp.line.me'))
  )
    return true;
  return false;
});
const showTopBar = computed(() => !isLiffClientMode.value && !isLiffEntry.value);

const form = reactive({
  name: '',
  slug: '',
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
const tagSheetOpen = ref(false);
const tagCategories = ref<CommunityTagCategory[]>([]);
const tagLoading = ref(false);
const tagLoaded = ref(false);
const visibilitySheetOpen = ref(false);
const isSlugPreviewExpanded = ref(false);

const saving = ref(false);
const creatingFromUpload = ref(false);
const error = ref<string | null>(null);
const showCropper = ref(false);
const cropSource = ref<string | null>(null);
const cropTarget = ref<'cover' | 'logo' | null>(null);
const selectedTags = ref<string[]>([]);
const pageTitle = computed(() => (isCreateMode.value ? 'コミュニティ作成' : 'コミュニティ設定'));
const goBack = () => {
  router.back();
};

const copySlugUrl = async () => {
  if (!slugPreviewUrl.value) return;
  if (!navigator?.clipboard?.writeText) {
    toast.show('コピーに失敗しました。手動でコピーしてください。', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(slugPreviewUrl.value);
    toast.show('リンクをコピーしました', 'success');
  } catch (err) {
    console.warn('Failed to copy slug url', err);
    toast.show('コピーに失敗しました。時間をおいて再試行してください。', 'error');
  }
};

const toggleTag = (tag: string) => {
  const value = tag.trim();
  if (!value) return;
  const exists = selectedTags.value.includes(value);
  if (exists) {
    selectedTags.value = selectedTags.value.filter((t) => t !== value);
    return;
  }
  if (selectedTags.value.length >= 5) {
    return;
  }
  selectedTags.value = [...selectedTags.value, value];
};

const visibleOptions = [
  {
    value: 'public',
    label: '公開（誰でも見える）',
    desc: 'ログイン不要。ポータル・検索・共有リンクから表示されます。',
    note: '外部向けに広く見せたい場合におすすめ。',
  },
  {
    value: 'semi-public',
    label: 'メンバー限定',
    desc: 'ログイン済みのフォロー/参加メンバーと運営だけが閲覧できます。',
    note: '非メンバーは閲覧できません。',
  },
  {
    value: 'private',
    label: '運営のみ（非公開）',
    desc: '運営・管理者だけが閲覧可能。メンバーにも表示しません。',
    note: '準備中や内部メモ向け。',
  },
];

const labelChips = computed(() => selectedTags.value.slice(0, 5));
const currentVisibleOption = computed(
  () => visibleOptions.find((o) => o.value === form.visibleLevel) ?? visibleOptions[0],
);
const portalBaseUrl = computed(() => {
  if (typeof window === 'undefined') return '/community/';
  return `${window.location.origin}/community/`;
});
const slugPreviewUrl = computed(() => {
  const slug = form.slug.trim();
  if (!slug) return '';
  return `${portalBaseUrl.value}${slug}`;
});
const canCopySlug = computed(() => Boolean(slugPreviewUrl.value) && !isCreateMode.value);
const toggleSlugPreview = () => {
  isSlugPreviewExpanded.value = !isSlugPreviewExpanded.value;
};

watch(slugPreviewUrl, () => {
  isSlugPreviewExpanded.value = false;
});

const loadCommunity = async () => {
  if (isCreateMode.value || !communityId.value) return;
  try {
    const detail = await fetchConsoleCommunity(communityId.value);
    form.name = detail.name;
    form.slug = detail.slug;
    selectedTags.value = (detail.labels || []).slice(0, 5);
    form.visibleLevel = detail.visibleLevel ?? 'public';
    const coverRaw = detail.coverImageUrl || '';
    form.coverImageUrl = normalizeManagedAsset(coverRaw);
    coverPreview.value = form.coverImageUrl ? resolveAssetUrl(form.coverImageUrl) : coverRaw ? coverRaw : null;
    const descriptionObj =
      typeof detail.description === 'object' && detail.description
        ? (detail.description as ConsoleCommunityDetail['description']) as any
        : null;
    form.description = getLocalizedText(detail.description);
    const logoUrl = detail.logoImageUrl ?? descriptionObj?.logoImageUrl ?? '';
    form.logoImageUrl = normalizeManagedAsset(logoUrl);
    logoPreview.value = form.logoImageUrl ? resolveAssetUrl(form.logoImageUrl) : logoUrl || null;
    stripeOnboardLink.value = descriptionObj?._stripeOnboardLink ?? null;
    if (descriptionObj?._portalConfig && typeof descriptionObj._portalConfig.theme === 'string') {
      const theme = descriptionObj._portalConfig.theme;
      portalTheme.value = themeOptions.includes(theme) ? theme : 'immersive';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'コミュニティ情報の取得に失敗しました';
  }
};

const setVisible = (value: string) => {
  form.visibleLevel = value;
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

const loadTags = async () => {
  if (tagLoaded.value || tagLoading.value) return;
  tagLoading.value = true;
  try {
    const categories = await fetchCommunityTags();
    tagCategories.value = categories.sort((a, b) => a.order - b.order);
    tagLoaded.value = true;
  } catch (err) {
    console.warn('Failed to load tags', err);
  } finally {
    tagLoading.value = false;
  }
};

const openTagSheet = async () => {
  tagSheetOpen.value = true;
  await loadTags();
};

const displayName = (item: { nameJa?: string | null; nameZh?: string | null; nameEn?: string | null }) => {
  return item.nameJa || item.nameZh || item.nameEn || '';
};

const cropResultWidth = computed(() => (cropTarget.value === 'cover' ? 1280 : 512));
const croppingLoading = computed(() => cropTarget.value === 'cover' ? uploadingCover.value : uploadingLogo.value);

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });

const ensureCommunityReady = async () => {
  if (communityId.value) return communityId.value;
  if (!form.name.trim()) {
    form.name = '名称未設定';
  }
  if (!form.slug.trim()) {
    form.slug = `community-${Date.now().toString(36)}`;
  }
  try {
    creatingFromUpload.value = true;
    const created = await createConsoleCommunity({
      name: form.name,
      slug: form.slug,
      labels: labelChips.value,
      visibleLevel: form.visibleLevel,
      description: buildDescription(),
      coverImageUrl: form.coverImageUrl || null,
    });
    communityId.value = created.id;
    await communityStore.loadCommunities(true);
    communityStore.refreshActiveCommunity();
    toast.show('保存しました。続けて画像をアップできます', 'success');
    return created.id;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'コミュニティの保存に失敗しました';
    return null;
  } finally {
    creatingFromUpload.value = false;
  }
};

const handleCoverUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || uploadingCover.value) return;
  if (!communityId.value) {
    const id = await ensureCommunityReady();
    if (!id) {
      target.value = '';
      return;
    }
  }
  try {
    const dataUrl = await readFileAsDataUrl(file);
    cropTarget.value = 'cover';
    cropSource.value = dataUrl;
    showCropper.value = true;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '画像の読み込みに失敗しました';
  }
  target.value = '';
};

const handleLogoUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || uploadingLogo.value) return;
  if (!communityId.value) {
    const id = await ensureCommunityReady();
    if (!id) {
      target.value = '';
      return;
    }
  }
  try {
    const dataUrl = await readFileAsDataUrl(file);
    cropTarget.value = 'logo';
    cropSource.value = dataUrl;
    showCropper.value = true;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '画像の読み込みに失敗しました';
  }
  target.value = '';
};

const resetCropper = () => {
  showCropper.value = false;
  cropSource.value = null;
  cropTarget.value = null;
};

const handleCropConfirm = async (blob: Blob) => {
  if (!cropTarget.value || !communityId.value) return;
  const filename = `${cropTarget.value}-${Date.now()}.jpg`;
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });

  if (cropTarget.value === 'cover') {
    uploadingCover.value = true;
    try {
    const { imageUrl } = await uploadCommunityAsset(communityId.value, file, 'cover');
    const normalized = normalizeManagedAsset(imageUrl?.replace('/api/v1', '') ?? imageUrl);
    form.coverImageUrl = normalized;
    coverPreview.value = normalized ? resolveAssetUrl(normalized) : null;
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
    const { imageUrl } = await uploadCommunityAsset(communityId.value, file, 'logo');
    const normalized = normalizeManagedAsset(imageUrl?.replace('/api/v1', '') ?? imageUrl);
    form.logoImageUrl = normalized;
    logoPreview.value = normalized ? resolveAssetUrl(normalized) : null;
    } catch (err) {
      console.warn(err);
    } finally {
      uploadingLogo.value = false;
      resetCropper();
    }
  }
};

const handleSave = async () => {
  saving.value = true;
  error.value = null;
  if (creatingFromUpload.value) {
    saving.value = false;
    return;
  }
  if (!form.name.trim() || !form.slug.trim()) {
    error.value = 'コミュニティ名とホームページ名は必須です';
    saving.value = false;
    return;
  }
  const payload = {
    labels: labelChips.value,
    visibleLevel: form.visibleLevel,
    coverImageUrl: form.coverImageUrl || null,
    logoImageUrl: form.logoImageUrl || null,
    description: buildDescription(),
  };
  try {
    if (isCreateMode.value || !communityId.value) {
      const created = await createConsoleCommunity({
        name: form.name,
        slug: form.slug,
        labels: labelChips.value,
        visibleLevel: form.visibleLevel,
        description: buildDescription(),
        coverImageUrl: form.coverImageUrl || null,
      });
      communityId.value = created.id;
      toast.show('作成しました', 'success');
      router.push({ name: 'ConsoleMobileCommunitySettings', params: { communityId: created.id } });
    } else {
      await updateConsoleCommunity(communityId.value, payload);
      await loadCommunity();
      toast.show('保存しました', 'success');
      router.push({ name: 'ConsoleMobileHome' });
    }
    await communityStore.loadCommunities(true);
    communityStore.refreshActiveCommunity();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '更新に失敗しました';
  } finally {
    saving.value = false;
  }
};

const goPortal = () => {
  if (!communityId.value) return;
  router.push({ name: 'ConsoleMobileCommunityPortal', params: { communityId: communityId.value } });
};

const handlePreviewError = (type: 'cover' | 'logo') => {
  if (type === 'cover') {
    coverPreview.value = null;
  } else {
    logoPreview.value = null;
  }
};

const normalizeManagedAsset = (url?: string | null) => {
  if (!url) return '';
  let v = url.trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  // keep uploads prefix, only strip API prefix
  if (v.startsWith('/api/v1/uploads')) {
    v = v.replace('/api/v1', '');
  } else if (v.startsWith('/api/v1/')) {
    v = v.slice('/api/v1/'.length - 1);
  }
  if (v.startsWith('uploads/')) {
    v = `/${v}`;
  }
  if (!v) return '';
  return v;
};

onMounted(loadCommunity);
onActivated(loadCommunity);
watch(
  () => route.params.communityId,
  (val) => {
    communityId.value = (val as string) || null;
    if (!isCreateMode.value) {
      loadCommunity();
    }
  },
);
</script>

<style scoped>
.community-settings {
  min-height: 100vh;
  background: #f8fafc;
  padding: 0 0 calc(90px + env(safe-area-inset-bottom, 0px));
  overflow-x: hidden;
}
.hero-meta {
  padding: 8px 16px 4px;
}
.hero-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}
.hero-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #94a3b8;
}
.link-btn {
  border: none;
  background: none;
  color: #2563eb;
  font-weight: 600;
  font-size: 14px;
  padding: 6px 8px;
}
.hero-card {
  margin: 16px 16px 0;
  padding: 20px 18px;
  border-radius: 24px;
  background: linear-gradient(135deg, #0ea5e9, #6366f1);
  color: #f0f9ff;
  box-shadow: 0 24px 40px rgba(14, 165, 233, 0.18);
  position: relative;
}
.hero-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.14), transparent 40%),
    radial-gradient(circle at 80% 10%, rgba(255, 255, 255, 0.12), transparent 35%);
  pointer-events: none;
}
.hero-card.theme-clean {
  background: linear-gradient(135deg, #eef2ff, #e2e8f0);
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
  background: rgba(255, 255, 255, 0.2);
  color: #f8fafc;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.14);
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
  padding: 12px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.section-eyebrow {
  margin: 12px 16px 6px;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: #94a3b8;
  text-transform: uppercase;
}
.form-card {
  background: #fff;
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
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
.list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 14px;
  background: transparent;
  border: 1px solid rgba(15, 23, 42, 0.08);
  width: 100%;
  text-align: left;
  box-sizing: border-box;
}
.list-row + .list-row {
  margin-top: 10px;
}
.list-meta {
  flex: 1;
  min-width: 0;
}
.list-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}
.list-desc {
  margin: 2px 0 0;
  font-size: 12px;
  color: #94a3b8;
}
.ios-input-group {
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  overflow: hidden;
  background: rgba(255, 255, 255, 0.98);
}
.ios-input-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ios-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 12px;
  position: relative;
  width: 100%;
  box-sizing: border-box;
}
.ios-row + .ios-row {
  border-top: 1px solid rgba(15, 23, 42, 0.08);
}
.ios-row--disabled {
  opacity: 0.7;
}
.ios-label {
  flex: 0 0 32%;
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}
.ios-value {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.ios-value--inline-input input {
  width: 100%;
  border: none;
  background: transparent;
  padding: 2px 0;
  font-size: 16px;
  line-height: 1.3;
  text-align: right;
  color: #0f172a;
  -webkit-appearance: none;
  appearance: none;
}
.ios-value--inline-input input:focus {
  outline: none;
}
.ios-value--inline-input input:disabled {
  color: #94a3b8;
}
.ios-suffix {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
}
.slug-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.04);
}
.slug-preview.is-expanded {
  align-items: flex-start;
}
.slug-note {
  margin: 6px 2px 0;
  font-size: 11px;
  color: #94a3b8;
}
.slug-url {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  letter-spacing: -0.01em;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
.slug-url.is-expanded {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  word-break: break-all;
}
.slug-copy {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  padding: 6px 10px;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.slug-copy:disabled {
  cursor: not-allowed;
  opacity: 0.5;
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
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.9);
  border-radius: 14px;
  padding: 12px 14px;
  font-size: 15px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.ios-field input:focus {
  outline: none;
  border-color: rgba(14, 165, 233, 0.6);
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
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
.tag-badge-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
  min-height: 24px;
  flex: 1;
}
.tag-badge {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.12);
  color: #0ea5e9;
  font-size: 12px;
  border: 1px solid rgba(14, 165, 233, 0.2);
}
.tag-placeholder {
  font-size: 12px;
  color: #94a3b8;
}
.thumb-placeholder {
  font-size: 20px;
  color: #94a3b8;
}
.list-thumb {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: #f8fafc;
  display: grid;
  place-items: center;
}
.list-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.list-thumb--wide {
  width: 92px;
  height: 64px;
}
.tag-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tag-group-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}
.tag-empty {
  text-align: center;
  color: #94a3b8;
  padding: 12px 0;
  font-size: 13px;
}
.tag-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #f8fafc;
  color: #0f172a;
  font-size: 15px;
}
.tag-chip.is-selected {
  border-color: rgba(14, 165, 233, 0.7);
  background: rgba(14, 165, 233, 0.15);
  color: #0f172a;
}
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.visible-list {
  display: flex;
  flex-direction: column;
  padding: 8px 12px 12px;
  gap: 10px;
}
.visible-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.96);
  text-align: left;
}
.visible-row.is-active {
  border-color: rgba(14, 165, 233, 0.6);
  background: rgba(14, 165, 233, 0.12);
}
.visible-text {
  flex: 1;
  min-width: 0;
}
.visible-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
}
.visible-desc {
  margin: 2px 0 0;
  font-size: 15px;
  color: #475569;
}
.visible-note {
  margin: 2px 0 0;
  font-size: 14px;
  color: #64748b;
}
.visible-pill {
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.12);
  color: #0ea5e9;
  font-weight: 700;
  font-size: 12px;
  border: 1px solid rgba(14, 165, 233, 0.2);
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
.radio-indicator {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(15, 23, 42, 0.25);
}
.radio-indicator.is-checked {
  border-color: rgba(14, 165, 233, 0.8);
  box-shadow: inset 0 0 0 4px rgba(14, 165, 233, 0.8);
}
.radio-indicator {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(15, 23, 42, 0.25);
}
.radio-indicator.is-checked {
  border-color: rgba(14, 165, 233, 0.8);
  box-shadow: inset 0 0 0 4px rgba(14, 165, 233, 0.8);
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
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.92), #fff);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.12s ease;
}
.upload-drop:hover {
  border-color: rgba(37, 99, 235, 0.55);
  box-shadow: 0 12px 22px rgba(37, 99, 235, 0.12);
}
.upload-drop:active {
  transform: scale(0.98);
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
  display: block;
  border-radius: 12px;
}
.tag-sheet {
  display: grid;
  gap: 10px;
  max-height: 320px;
  overflow-y: auto;
  padding: 4px 0;
}
.tag-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.96);
  color: #0f172a;
}
.tag-option.is-selected {
  border-color: rgba(14, 165, 233, 0.6);
  background: rgba(14, 165, 233, 0.12);
}
.tag-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #0ea5e9;
}
.tag-label {
  flex: 1;
  text-align: left;
  font-size: 15px;
}
.form-card textarea {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 16px;
  padding: 14px;
  font-size: 15px;
  background: rgba(255, 255, 255, 0.9);
  resize: vertical;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.form-card textarea:focus {
  outline: none;
  border-color: rgba(37, 99, 235, 0.5);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  z-index: 80;
}
.sheet-panel {
  width: min(520px, 100%);
  background: #fff;
  border-radius: 18px 18px 12px 12px;
  box-shadow: 0 -12px 40px rgba(15, 23, 42, 0.18);
  overflow: hidden;
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.25);
}
.sheet-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
}
.sheet-close {
  border: none;
  background: rgba(15, 23, 42, 0.06);
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #0f172a;
  font-size: 18px;
  line-height: 1;
}

.sheet-preview {
  padding: 12px 16px 0;
}
.sheet-preview img {
  width: 100%;
  max-height: 220px;
  object-fit: contain;
  border-radius: 14px;
  display: block;
  background: #f8fafc;
}
.sheet-preview--logo img {
  max-width: 180px;
  margin: 0 auto;
}
.sheet-placeholder {
  border: 1px dashed rgba(148, 163, 184, 0.6);
  border-radius: 14px;
  padding: 28px 16px;
  text-align: center;
  color: #94a3b8;
  background: #f8fafc;
}
.sheet-actions {
  padding: 14px 16px 16px;
  display: flex;
  gap: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}
.sheet-actions .ghost-btn,
.sheet-actions .primary-btn {
  border-radius: 12px;
  font-size: 16px;
}
.sheet-panel--full {
  height: 90vh;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.sheet-panel--full .tag-sheet {
  flex: 1;
  max-height: none;
  padding: 12px 16px 10px;
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
  background: #0090d9;
  color: #fff;
  box-shadow: none;
}
.primary-btn:disabled {
  opacity: 0.6;
  box-shadow: none;
}
</style>
