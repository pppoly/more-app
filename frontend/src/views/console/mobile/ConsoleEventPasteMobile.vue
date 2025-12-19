<template>
  <div class="paste-page">
    <ConsoleTopBar v-if="!isLiffClientMode" title="下書きを貼り付ける" @back="goBack" />

    <section class="intro-card">
      <p class="intro-title">貼り付けるだけで OK</p>
      <p class="intro-desc">AI がタイトルや説明を下書きに入れます。足りない部分は次の画面で微調整できます。</p>
    </section>

    <section class="input-card">
      <textarea
        v-model="draft"
        class="draft-input"
        placeholder="イベントのタイトル・説明・メモをそのまま貼り付けてください"
        rows="12"
      ></textarea>
      <p class="input-hint">言語・形式は自由。メモのままでも構いません。</p>
      <p v-if="error" class="error">{{ error }}</p>
    </section>

    <div class="action-row">
      <button class="ghost-link" type="button" @click="goBack">キャンセル</button>
      <button class="primary-next" type="button" :disabled="!draft.trim() || loading" @click="confirmApply">
        <span v-if="loading">少々お待ちください…</span>
        <span v-else>次へ</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from '../../../composables/useToast';
import { extractEventDraft } from '../../../api/client';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';
import { isLiffClient } from '../../../utils/device';
import { isLineInAppBrowser } from '../../../utils/liff';
import { APP_TARGET } from '../../../config';

const route = useRoute();
const router = useRouter();
const isLiffClientMode = computed(() => APP_TARGET === 'liff' || isLineInAppBrowser() || isLiffClient());
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
    error.value = '送信に失敗しました。時間をおいて再試行してください。';
    toast.show(error.value);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.paste-page {
  min-height: 100vh;
  background: #f8fafc;
  padding: 0 16px calc(env(safe-area-inset-bottom, 0px) + 20px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}
.intro-card,
.input-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
  padding: 14px 14px;
}
.intro-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}
.intro-desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
}
.input-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}
.draft-input {
  width: 100%;
  min-height: 320px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  font-size: 15px;
  line-height: 1.6;
  background: #f8fafc;
  box-sizing: border-box;
}
.draft-input:focus {
  outline: none;
  border-color: #94a3b8;
  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.35);
}
.input-hint {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}
.error {
  margin: 0;
  color: #ef4444;
  font-size: 12px;
}
.action-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin: 6px 0 0;
}
.ghost-link,
.primary-next {
  height: 46px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  transition: transform 0.1s ease, opacity 0.1s ease;
  width: 100%;
}
.ghost-link {
  border: none;
  background: transparent;
  color: #475569;
}
.primary-next {
  background: linear-gradient(135deg, #0090d9, #22bbaa, #e4c250);
  color: #fff;
  box-shadow: 0 12px 30px rgba(34, 187, 170, 0.35);
}
.primary-next:disabled {
  opacity: 0.5;
}
</style>
