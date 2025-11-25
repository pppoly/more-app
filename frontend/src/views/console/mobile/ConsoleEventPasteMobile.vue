<template>
  <div class="paste-page">
    <header class="paste-header">
      <button class="nav-text-btn" type="button" @click="goBack">返回</button>
      <h1 class="header-title">我已有活动方案</h1>
      <div class="nav-text-btn placeholder" aria-hidden="true">返回</div>
    </header>

    <section class="intro-card">
      <p class="intro-title">粘贴你的活动草案</p>
      <p class="intro-desc">我们会自动提取标题 / 简介 / 注意事项，填入表单，省去重复输入。</p>
      <ul class="intro-list">
        <li>帮你先填好关键字段</li>
        <li>给出下一步编辑建议</li>
        <li>提示合规/风险要点</li>
      </ul>
    </section>

    <section class="input-card">
      <textarea
        v-model="draft"
        class="draft-input"
        placeholder="粘贴活动标题、简介、规则或宣传文案…"
        rows="12"
      ></textarea>
      <p v-if="error" class="error">{{ error }}</p>
    </section>

    <div class="action-row">
      <button class="secondary-btn" type="button" @click="goBack">返回</button>
      <button class="primary-next" type="button" :disabled="!draft.trim() || loading" @click="confirmApply">
        <span v-if="loading">请稍候…</span>
        <span v-else>下一步</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from '../../../composables/useToast';
import { extractEventDraft } from '../../../api/client';

const route = useRoute();
const router = useRouter();
const draft = ref('');
const error = ref<string | null>(null);
const toast = useToast();
const loading = ref(false);

const goBack = () => {
  router.back();
};

const confirmApply = async () => {
  if (!draft.value.trim() || loading.value) return;
  loading.value = true;
  error.value = null;
  try {
    sessionStorage.setItem('CONSOLE_EVENT_ENTRY', 'paste');
    sessionStorage.setItem('CONSOLE_EVENT_PASTE_DRAFT', draft.value);
    const communityId = route.params.communityId as string | undefined;
    if (communityId) {
      const parsed = await extractEventDraft(communityId, { draft: draft.value });
      sessionStorage.setItem('CONSOLE_EVENT_PASTE_RESULT', JSON.stringify(parsed));
    }
    router.push({
      name: 'ConsoleMobileEventForm',
      params: route.params,
      query: { entry: 'paste' },
    });
  } catch (e) {
    error.value = '提交失败，请稍后重试';
    toast.show(error.value);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.paste-page {
  min-height: 100vh;
  background: #f5f7fb;
  padding: 0.6rem 0.6rem calc(env(safe-area-inset-bottom, 0px) + 20px);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.paste-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  position: sticky;
  top: 0;
  z-index: 5;
  padding: calc(0.75rem + env(safe-area-inset-top, 0px)) 0.6rem 0.6rem;
  margin-left: -0.6rem;
  margin-right: -0.6rem;
  background: #ffffff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.nav-text-btn {
  border: none;
  background: transparent;
  color: #0f172a;
  font-weight: 700;
  font-size: 14px;
  padding: 8px 4px;
}
.nav-text-btn.placeholder {
  opacity: 0;
  pointer-events: none;
}
.header-title {
  margin: 0;
  text-align: center;
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
}
.intro-card,
.input-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  padding: 16px 14px;
}
.intro-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: #0f172a;
}
.intro-desc {
  margin: 6px 0 10px;
  font-size: 14px;
  color: #475569;
  line-height: 1.5;
}
.intro-list {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #0f172a;
  font-size: 14px;
}
.input-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}
.preview-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.preview-title {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
}
.preview-row {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.preview-row .label {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.preview-row .value {
  margin: 0;
  font-size: 14px;
  color: #0f172a;
  line-height: 1.5;
}
.preview-row ul {
  margin: 0;
  padding-left: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #0f172a;
  font-size: 14px;
}
.error {
  margin: 4px 0 0;
  color: #ef4444;
  font-size: 12px;
}
.draft-input {
  width: 100%;
  min-height: 360px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  padding: 12px;
  font-size: 14px;
  line-height: 1.5;
  background: #f8fafc;
  box-sizing: border-box;
}
.hint {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}
.primary-next {
  width: 100%;
  border: none;
  border-radius: 14px;
  padding: 14px;
  background: linear-gradient(135deg, #0ea5e9, #22c55e);
  color: #fff;
  font-size: 16px;
  font-weight: 800;
  box-shadow: 0 12px 26px rgba(14, 165, 233, 0.25);
}
.primary-next:disabled {
  opacity: 0.5;
}
.secondary-btn {
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}
.action-row {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 10px;
}
.spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(15, 23, 42, 0.15);
  border-top-color: #0ea5e9;
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
