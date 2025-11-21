<template>
  <div class="portal-config-page">
    <header class="portal-config__header">
      <button class="back-btn" type="button" @click="goBack">←</button>
      <div>
        <p class="eyebrow">社群门户</p>
        <h1>门户模板</h1>
      </div>
    </header>

    <div v-if="loading" class="portal-config__card">
      <p>読み込み中...</p>
    </div>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <div v-else class="portal-config__card">
      <h2>选择模板</h2>
      <div class="theme-grid">
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
          <span v-if="selectedTheme === theme.id" class="badge">選択中</span>
        </button>
      </div>

      <h2>显示模块</h2>
      <div class="module-list">
        <label v-for="block in moduleOptions" :key="block.id" class="module-row">
          <input type="checkbox" :value="block.id" v-model="selectedLayout" />
          <div>
            <p class="module-name">{{ block.name }}</p>
            <p class="module-desc">{{ block.desc }}</p>
          </div>
        </label>
      </div>

      <div class="portal-actions">
        <button class="btn" type="button" :disabled="saving" @click="saveConfig">
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchCommunityPortalConfig, updateCommunityPortalConfig } from '../../../api/client';

const route = useRoute();
const router = useRouter();
const communityId = computed(() => route.params.communityId as string);

const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const selectedTheme = ref('immersive');
const selectedLayout = ref<string[]>(['hero', 'about', 'upcoming', 'past', 'moments']);

const themes = [
  { id: 'clean', name: '清爽卡片', desc: '浅色卡片 + 淡渐变', previewClass: 'preview-clean' },
  { id: 'immersive', name: '沉浸大片', desc: '暗色遮罩 + 大封面', previewClass: 'preview-immersive' },
  { id: 'warm', name: '暖色聚会', desc: '暖色调覆盖 + 圆角卡片', previewClass: 'preview-warm' },
  { id: 'collage', name: '拼贴影集', desc: '纹理叠加 + 照片感', previewClass: 'preview-collage' },
];

const moduleOptions = [
  { id: 'hero', name: '封面', desc: '封面大图与标签滚动' },
  { id: 'about', name: '简介', desc: '社群介绍文本' },
  { id: 'upcoming', name: '招募中活动', desc: '当前可报名的活动' },
  { id: 'past', name: '往期活动', desc: '历史活动列表' },
  { id: 'moments', name: '精彩瞬間', desc: '精选照片/封面拼贴' },
];

const loadConfig = async () => {
  if (!communityId.value) return;
  loading.value = true;
  error.value = null;
  try {
    const { config } = await fetchCommunityPortalConfig(communityId.value);
    selectedTheme.value = config.theme || selectedTheme.value;
    if (Array.isArray(config.layout) && config.layout.length) {
      selectedLayout.value = [...new Set(config.layout)];
    }
  } catch (err: any) {
    error.value = err?.response?.data?.message || '設定を読み込めませんでした';
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
  } catch (err: any) {
    error.value = err?.response?.data?.message || '保存に失敗しました';
  } finally {
    saving.value = false;
  }
};

const goBack = () => router.back();

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

.portal-config__header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--m-color-border);
  background: #fff;
}

.eyebrow {
  margin: 0;
  font-size: 12px;
  color: var(--m-color-text-secondary);
  letter-spacing: 0.02em;
}

h1 {
  margin: 0;
  font-size: 20px;
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

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
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

.portal-actions {
  display: flex;
  justify-content: flex-end;
}

.btn {
  width: 120px;
  height: 40px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #60a5fa);
  color: #fff;
  font-weight: 700;
}

.status.error {
  color: #b91c1c;
  background: #fef2f2;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #fecdd3;
}
</style>
