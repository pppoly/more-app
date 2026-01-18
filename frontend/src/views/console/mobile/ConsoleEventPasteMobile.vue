<template>
  <div class="paste-page" :class="{ 'is-liff': isLiffClientMode }">
    <ConsoleTopBar v-if="!isLiffClientMode" title="文章からイベントを作成" @back="goBack" />

    <section class="intro-card">
      <p class="intro-title">{{ preview ? '受け取った内容を確認しよう' : 'まずは一言でOK' }}</p>
      <p class="intro-desc">
        {{
          preview
            ? 'ここから一緒に整えます。必要なら戻って書き足せます。'
            : '文章の情報をそのまま入れてください。AIが下書きを組み立てます。'
        }}
      </p>
    </section>

    <section v-if="!preview" class="input-card">
      <textarea
        v-model="draft"
        class="draft-input"
        placeholder="例）土曜午前のヨガ。初心者向け。場所は代々木公園。"
        rows="12"
      ></textarea>
      <p class="input-hint" :class="{ 'input-hint--warn': validationBlocked }">
        <span class="input-hint-main">
          {{ validationMessage }}
          <span class="input-hint-meta">（{{ charCount }}/{{ MAX_CHARS }}文字）</span>
        </span>
        <br />
        <span class="input-hint-sub">{{ inputSubHint }}</span>
      </p>
      <p v-if="error" class="error">{{ error }}</p>
    </section>

    <section v-else class="preview-card">
      <div class="preview-item">
        <p class="preview-label">タイトル</p>
        <p class="preview-value">{{ preview.title || '未検出' }}</p>
      </div>
      <div class="preview-item">
        <p class="preview-label">説明</p>
        <p class="preview-value">{{ preview.description || '未検出' }}</p>
      </div>
      <div class="preview-item">
        <p class="preview-label">注意事項 / ルール</p>
        <p class="preview-value">{{ preview.rules || '未検出' }}</p>
      </div>
      <div v-if="extractSummary" class="preview-summary">
        <p class="preview-label">検出サマリー</p>
        <p class="preview-value">{{ extractSummary }}</p>
      </div>
      <p class="preview-hint">他の項目は次の画面で調整できます。</p>
    </section>

    <div class="action-row">
      <button v-if="!preview" class="ghost-link" type="button" @click="goBack">キャンセル</button>
      <button v-else class="ghost-link" type="button" @click="editDraft">戻って修正</button>
      <button
        class="primary-next"
        type="button"
        :disabled="primaryDisabled"
        @click="preview ? proceedToForm() : confirmApply()"
      >
        <span v-if="loading">少々お待ちください…</span>
        <span v-else>{{ preview ? 'この内容で進む' : 'AIに見せてみる' }}</span>
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
const preview = ref<{ title?: string; description?: string; rules?: string } | null>(null);
const parsedResult = ref<any | null>(null);
const toast = useToast();
const loading = ref(false);

const MIN_CHARS = 30;
const RECOMMENDED_MAX = 1000;
const MAX_CHARS = 2000;

const normalizedDraft = computed(() => draft.value.trim());
const charCount = computed(() => normalizedDraft.value.length);
const validationState = computed(() => {
  const count = charCount.value;
  if (count < MIN_CHARS) return 'too_short';
  if (count <= RECOMMENDED_MAX) return 'ok';
  if (count <= MAX_CHARS) return 'long';
  return 'too_long';
});
const validationBlocked = computed(
  () => validationState.value === 'too_short' || validationState.value === 'too_long',
);
const validationMessage = computed(() => {
  switch (validationState.value) {
    case 'too_short':
      return '内容が短すぎます（30文字以上）';
    case 'ok':
      return '入力内容を反映できます（30〜1,000文字）';
    case 'long':
      return '少し長めです。要点だけにまとめると反映しやすくなります。';
    case 'too_long':
      return '文字数が多すぎます（最大2,000文字）。不要な部分を削除してください。';
    default:
      return '入力内容を反映できます（30〜1,000文字）';
  }
});
const inputSubHint = computed(() => '箇条書き・短文など何でもOK。あとから整えます。');
const primaryDisabled = computed(() => {
  if (loading.value) return true;
  if (preview.value) return !parsedResult.value;
  return validationBlocked.value;
});

const goBack = () => {
  router.back();
};

const confirmApply = async () => {
  if (loading.value || validationBlocked.value) return;
  loading.value = true;
  error.value = null;
  try {
    const communityId = route.params.communityId as string | undefined;
    if (communityId) {
      const urlMatches = draft.value.match(/https?:\/\/[^\s]+/gi) || [];
      const parsed = await extractEventDraft(communityId, {
        draft: draft.value,
        urls: urlMatches,
      });
      parsedResult.value = parsed;
      preview.value = {
        title: parsed?.title,
        description: parsed?.description,
        rules: parsed?.rules,
      };
      extractSummary.value = buildSummary(parsed);
    } else {
      error.value = 'コミュニティIDが必要です。';
    }
  } catch (e) {
    error.value = '送信に失敗しました。時間をおいて再試行してください。';
    toast.show(error.value);
  } finally {
    loading.value = false;
  }
};

const proceedToForm = () => {
  if (!parsedResult.value) return;
  sessionStorage.setItem('CONSOLE_EVENT_ENTRY', 'paste');
  sessionStorage.setItem('CONSOLE_EVENT_PASTE_DRAFT', draft.value);
  sessionStorage.setItem('CONSOLE_EVENT_PASTE_RESULT', JSON.stringify(parsedResult.value));
  router.push({
    name: 'ConsoleMobileEventForm',
    params: route.params,
    query: { entry: 'paste' },
  });
};

const editDraft = () => {
  preview.value = null;
  parsedResult.value = null;
  extractSummary.value = null;
};

const extractSummary = ref<string | null>(null);
const buildSummary = (parsed: any) => {
  const lines: string[] = [];
  if (parsed?.startTime) lines.push(`日時: ${parsed.startTime}${parsed.endTime ? ` - ${parsed.endTime}` : ''}`);
  if (parsed?.locationText) lines.push(`場所: ${parsed.locationText}`);
  if (parsed?.ticketPrice) lines.push(`参加費: ${parsed.ticketPrice}円`);
  if (parsed?.category) lines.push(`カテゴリ: ${parsed.category}`);
  if (parsed?.refundPolicy) lines.push('返金ポリシー検出済み');
  return lines.length ? lines.join(' / ') : null;
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
.paste-page.is-liff {
  padding-top: calc(env(safe-area-inset-top, 0px) + 12px);
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
.preview-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.preview-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.preview-label {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.preview-value {
  margin: 0;
  font-size: 14px;
  color: #0f172a;
  line-height: 1.6;
  white-space: pre-wrap;
}

.preview-hint {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
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
.input-hint--warn {
  color: #f97316;
}
.input-hint-main {
  font-weight: 600;
}
.input-hint-meta {
  font-weight: 600;
  opacity: 0.85;
}
.input-hint-sub {
  font-weight: 400;
  opacity: 0.9;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
