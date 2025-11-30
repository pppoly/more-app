<template>
  <div class="portal-config-page">
    <header class="portal-config__header">
      <button class="ghost-icon-btn" type="button" @click="goBack">
        <span class="i-lucide-arrow-left"></span>
      </button>
      <div class="header-center">
        <p class="header-eyebrow">{{ t('console.portal.title') }}</p>
        <h1 class="header-title">{{ t('console.portal.subtitle') }}</h1>
      </div>
      <button class="ghost-icon-btn" type="button" @click="goSettings">
        <span class="i-lucide-sliders"></span>
      </button>
    </header>

    <div v-if="loading" class="portal-skeleton">
      <section class="portal-config__card">
        <div class="skeleton-line title"></div>
        <div class="skeleton-theme-row">
          <div class="skeleton-tile" v-for="n in 3" :key="`theme-${n}`">
            <div class="skeleton-block preview"></div>
            <div class="skeleton-line name"></div>
            <div class="skeleton-line desc"></div>
          </div>
        </div>
      </section>
      <section class="portal-config__card">
        <div class="skeleton-line title short"></div>
        <div class="skeleton-module" v-for="n in 3" :key="`mod-${n}`">
          <div class="skeleton-checkbox"></div>
          <div class="skeleton-line"></div>
        </div>
      </section>
    </div>
    <div v-else-if="locked" class="portal-locked">
      <div class="lock-icon">
        <span class="i-lucide-lock"></span>
      </div>
      <p class="locked-title">{{ t('console.portal.lockedTitle') }}</p>
      <p class="locked-desc">{{ t('console.portal.lockedDesc') }}</p>
      <button class="btn primary" type="button" @click="goSubscription">
        {{ t('console.portal.upgrade') }}
      </button>
    </div>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <div v-else class="portal-config__body">
      <section class="portal-config__card">
        <h2>{{ t('console.portal.themeTitle') }}</h2>
        <div class="theme-list">
          <button
            v-for="theme in themes"
            :key="theme.id"
            type="button"
            class="theme-card"
            :class="{ active: selectedTheme === theme.id }"
            @click="selectedTheme = theme.id"
          >
            <div class="theme-preview" :class="theme.previewClass"></div>
            <div class="theme-meta">
              <p class="theme-name">{{ theme.name }}</p>
              <p class="theme-desc">{{ theme.desc }}</p>
            </div>
            <span v-if="selectedTheme === theme.id" class="badge">{{ t('console.portal.saving') === 'Saving…' ? '選択中' : '' }}</span>
          </button>
        </div>
      </section>

      <section class="portal-config__card">
        <h2>{{ t('console.portal.layoutTitle') }}</h2>
        <div class="module-list">
          <label v-for="block in moduleOptions" :key="block.id" class="module-row">
            <input type="checkbox" :value="block.id" v-model="selectedLayout" />
            <div>
              <p class="module-name">{{ block.name }}</p>
              <p class="module-desc">{{ block.desc }}</p>
            </div>
          </label>
        </div>
      </section>
    </div>

    <div v-if="!locked && !loading && !error" class="portal-footer">
      <button class="btn primary" type="button" :disabled="saving" @click="saveConfig">
        {{ saving ? t('console.portal.saving') : t('console.portal.save') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { fetchCommunityPortalConfig, updateCommunityPortalConfig, fetchConsoleCommunity } from '../../../api/client';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const communityId = computed(() => route.params.communityId as string);
const communityStore = useConsoleCommunityStore();

const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const locked = ref(false);
const selectedTheme = ref('immersive');
const selectedLayout = ref<string[]>(['hero', 'about', 'upcoming', 'past', 'moments']);

const themes = computed(() => [
  { id: 'clean', name: t('console.portal.themes.clean.name'), desc: t('console.portal.themes.clean.desc'), previewClass: 'preview-clean' },
  { id: 'immersive', name: t('console.portal.themes.immersive.name'), desc: t('console.portal.themes.immersive.desc'), previewClass: 'preview-immersive' },
  { id: 'warm', name: t('console.portal.themes.warm.name'), desc: t('console.portal.themes.warm.desc'), previewClass: 'preview-warm' },
  { id: 'collage', name: t('console.portal.themes.collage.name'), desc: t('console.portal.themes.collage.desc'), previewClass: 'preview-collage' },
]);

const moduleOptions = computed(() => [
  { id: 'hero', name: t('console.portal.modules.hero.name'), desc: t('console.portal.modules.hero.desc') },
  { id: 'about', name: t('console.portal.modules.about.name'), desc: t('console.portal.modules.about.desc') },
  { id: 'upcoming', name: t('console.portal.modules.upcoming.name'), desc: t('console.portal.modules.upcoming.desc') },
  { id: 'past', name: t('console.portal.modules.past.name'), desc: t('console.portal.modules.past.desc') },
  { id: 'moments', name: t('console.portal.modules.moments.name'), desc: t('console.portal.modules.moments.desc') },
]);

const loadConfig = async () => {
  if (!communityId.value) return;
  await communityStore.loadCommunities(true);
  loading.value = true;
  error.value = null;
  locked.value = false;
  try {
    const detail = await fetchConsoleCommunity(communityId.value);
    const planId = detail.pricingPlanId ?? null;
    if (!planId) {
      locked.value = true;
      loading.value = false;
      return;
    }
    const { config } = await fetchCommunityPortalConfig(communityId.value);
    selectedTheme.value = config.theme || selectedTheme.value;
    if (Array.isArray(config.layout) && config.layout.length) {
      selectedLayout.value = [...new Set(config.layout)];
    }
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 400) {
      locked.value = true;
    } else {
      error.value = err?.response?.data?.message || '設定を読み込めませんでした';
    }
  } finally {
    loading.value = false;
  }
};

const saveConfig = async () => {
  if (!communityId.value) return;
  saving.value = true;
  error.value = null;
  try {
    await updateCommunityPortalConfig(communityId.value, {
      theme: selectedTheme.value,
      layout: selectedLayout.value,
    });
    await communityStore.loadCommunities(true);
    router.push({
      name: 'ConsoleMobileCommunitySettings',
      params: { communityId: communityId.value },
    });
  } catch (err: any) {
    error.value = err?.response?.data?.message || '保存に失敗しました';
  } finally {
    saving.value = false;
  }
};

const goBack = () => router.back();
const goSubscription = () => {
  router.push({ name: 'ConsoleMobileSubscriptionStandalone' });
};
const goSettings = () => {
  router.push({
    name: 'ConsoleMobileCommunitySettings',
    params: { communityId: communityId.value },
  });
};

onMounted(loadConfig);
</script>

<style scoped>
.portal-config-page {
  min-height: 100vh;
  background: var(--color-page-bg);
  padding: 12px 12px calc(80px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.portal-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.skeleton-line,
.skeleton-block,
.skeleton-checkbox,
.skeleton-tile {
  position: relative;
  overflow: hidden;
  background: #e5e7eb;
}
.skeleton-line::after,
.skeleton-block::after,
.skeleton-checkbox::after,
.skeleton-tile::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.65), transparent);
  animation: shimmer 1.2s infinite;
}
.skeleton-line {
  height: 14px;
  border-radius: 8px;
}
.skeleton-line.title {
  width: 52%;
  height: 18px;
}
.skeleton-line.title.short {
  width: 38%;
}
.skeleton-line.name {
  width: 70%;
  height: 14px;
}
.skeleton-line.desc {
  width: 88%;
  height: 12px;
}
.skeleton-theme-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 8px;
}
.skeleton-tile {
  border-radius: 12px;
  padding: 12px;
  background: #eef2f7;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.skeleton-block.preview {
  height: 78px;
  border-radius: 10px;
}
.skeleton-module {
  display: grid;
  grid-template-columns: 18px 1fr;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.skeleton-checkbox {
  width: 18px;
  height: 18px;
  border-radius: 6px;
}
@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}

.portal-config__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 6px;
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(12px);
  background: linear-gradient(180deg, rgba(247, 247, 251, 0.9) 0%, rgba(247, 247, 251, 0.6) 100%);
}

.header-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.header-eyebrow {
  margin: 0;
  font-size: 11px;
  color: #64748b;
  letter-spacing: 0.02em;
}

.header-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  text-align: center;
}

.ghost-icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #0f172a;
}

.portal-config__card {
  background: #fff;
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.1);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.portal-config__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.theme-card {
  border: 1px solid var(--m-color-border);
  border-radius: 12px;
  padding: 10px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  width: 100%;
}

.theme-card.active {
  border-color: #2563eb;
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.18);
}

.theme-preview {
  height: 70px;
  border-radius: 10px;
  background: linear-gradient(135deg, #e2e8f0, #cbd5e1);
}

.preview-immersive {
  background: linear-gradient(135deg, #0f172a, #1e293b);
}
.preview-warm {
  background: linear-gradient(135deg, #fbbf24, #f97316);
}
.preview-clean {
  background: linear-gradient(135deg, #e0f2fe, #ecfeff);
}
.preview-collage {
  background: linear-gradient(135deg, #d946ef, #6366f1);
}

.theme-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.theme-name {
  margin: 0;
  font-weight: 700;
}

.theme-desc {
  margin: 0;
  font-size: 12px;
  color: var(--m-color-text-secondary);
}

.badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 11px;
  padding: 4px 6px;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
}

.module-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.module-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--m-color-border);
  border-radius: 10px;
  background: #f8fafc;
}

.module-name {
  margin: 0;
  font-weight: 600;
}

.module-desc {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--m-color-text-secondary);
}

.portal-footer {
  position: sticky;
  bottom: 0;
  padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, rgba(247, 247, 251, 0) 0%, rgba(247, 247, 251, 0.9) 40%, #f7f7fb 100%);
}

.btn.primary {
  width: 100%;
  border: none;
  border-radius: 12px;
  padding: 14px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #22c55e);
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.22);
}

.status.error {
  color: #b91c1c;
  background: #fef2f2;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #fecdd3;
}

.portal-locked {
  background: #fff;
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lock-icon {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  margin: 0 auto;
  background: linear-gradient(135deg, #2563eb, #22c55e);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 24px;
  box-shadow: 0 10px 28px rgba(37, 99, 235, 0.25);
}
.locked-title {
  margin: 4px 0 0;
  font-weight: 700;
  font-size: 16px;
}
.locked-desc {
  margin: 0;
  color: #475569;
  font-size: 14px;
  line-height: 1.5;
}
</style>
