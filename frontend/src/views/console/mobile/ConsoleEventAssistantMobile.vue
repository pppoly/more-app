<template>
  <div class="assistant-screen">
    <section class="assistant-hero">
      <div class="hero-top">
        <button type="button" class="hero-back" @click="goBack">
          <span class="i-lucide-chevron-left text-lg"></span>
          戻る
        </button>
        <div class="hero-actions">
          <button type="button" class="hero-logs" @click="openLogs">
            <span class="i-lucide-history text-sm"></span>
            履歴
          </button>
          <span class="stage-chip" :class="`stage-chip--${assistantStage}`">{{ assistantStageLabel }}</span>
        </div>
      </div>
      <div class="hero-body">
        <p class="hero-label">コミュニティ</p>
        <h1 class="hero-title">{{ communityName || '未選択' }}</h1>
        <p class="hero-desc">
          AIアシスタントがイベントの骨組み（目的・対象・雰囲気）を整理してくれます。出来上がった案はフォームで細部を調整できます。
        </p>
        <p class="hero-stage-hint">{{ assistantStageDescription }}</p>
      </div>
    </section>

    <section class="assistant-progress">
      <div class="progress-label">
        現在のテーマ: <strong>{{ currentPrompt }}</strong>
      </div>
      <div class="progress-bar">
        <span class="progress-value" :style="{ width: progressPercent + '%' }"></span>
      </div>
    </section>

    <section class="assistant-chat-card">
      <div class="chat-log">
        <div
          v-for="msg in chatMessages"
          :key="msg.id"
          :class="['chat-bubble', msg.role === 'user' ? 'chat-bubble--user' : 'chat-bubble--assistant']"
        >
          <p class="chat-text" v-if="msg.type === 'text'">{{ msg.content }}</p>
          <div v-else class="proposal-card">
            <p class="proposal-title">{{ msg.payload?.title }}</p>
            <p class="proposal-desc">{{ msg.payload?.description }}</p>
          </div>
          <span class="chat-meta">{{ msg.createdAt }}</span>
        </div>
        <div v-if="aiLoading" class="chat-typing">AIが案をまとめています...</div>
      </div>
      <div v-if="aiError" class="assistant-error">{{ aiError }}</div>
      <div class="chat-input-row">
        <input
          v-model="chatDraft"
          class="chat-input"
          type="text"
          :placeholder="currentPrompt"
          @keyup.enter="handleSend"
        />
        <button class="chat-send" type="button" @click="handleSend" :disabled="!chatDraft.trim()">
          <span class="i-lucide-send"></span>
        </button>
      </div>
      <button
        class="generate-button"
        type="button"
        :disabled="aiLoading || !readyToGenerate"
        @click="requestGeneration"
      >
        <span class="i-lucide-sparkles"></span>
        AIに案をまとめてもらう
      </button>
    </section>

    <section class="assistant-summary-card" v-if="aiResult">
      <div class="summary-head">
        <p class="summary-label">AI提案</p>
        <span class="summary-time">{{ generatedTime }}</span>
      </div>
      <h2>{{ extractText(aiResult.title) }}</h2>
      <p class="summary-text">{{ extractText(aiResult.description) }}</p>
      <div class="summary-notes" v-if="extractText(aiResult.notes)">
        <p class="summary-note-title">Note</p>
        <p class="summary-note-body">{{ extractText(aiResult.notes) }}</p>
      </div>
    </section>

    <section class="assistant-actions">
      <button class="primary" type="button" :disabled="!communityId" @click="goToForm(false)">
        フォームだけで作成する
      </button>
      <button
        class="primary gradient"
        type="button"
        :disabled="!communityId || !aiResult"
        @click="goToForm(true)"
      >
        AI案をフォームに送る
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  buildEventAssistantPrompt,
  determineEventAssistantStage,
  type EventAssistantStage,
} from '../../../ai/eventCreationAssistant';
import { generateEventContent, saveEventAssistantLog } from '../../../api/client';
import type { EventDraft, GeneratedEventContent } from '../../../types/api';
import { CONSOLE_AI_EVENT_DRAFT_KEY } from '../../../constants/console';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';

type ChatRole = 'user' | 'assistant';
type ChatMessageType = 'text' | 'proposal';
interface ChatMessage {
  id: string;
  role: ChatRole;
  type: ChatMessageType;
  content: string;
  createdAt: string;
  payload?: {
    title?: string;
    description?: string;
    raw?: (GeneratedEventContent & { summary?: string }) | null;
  };
}

const route = useRoute();
const router = useRouter();
const communityStore = useConsoleCommunityStore();
const communityId = computed(() => route.params.communityId as string | undefined);
const communityName = computed(() => {
  const id = communityId.value;
  if (!id) return '';
  const match = communityStore.communities.value.find((item) => item.id === id);
  return match?.name ?? '';
});

const qaState = reactive({
  baseLanguage: 'ja',
  topic: '',
  audience: '',
  style: '',
  details: '',
});

const questions = [
  {
    key: 'topic',
    prompt: 'どんなイベントを企画していますか？（例：親子BBQ、言語交換など）',
  },
  {
    key: 'audience',
    prompt: '主な対象や届けたい人は誰ですか？',
  },
  {
    key: 'style',
    prompt: '雰囲気やスタイルはどうしたいですか？（family-friendly / casual など）',
  },
  {
    key: 'details',
    prompt: '場所・所要時間・持ち物など、補足したいことを自由にどうぞ。',
  },
];

const stageLabels: Record<EventAssistantStage, string> = {
  coach: 'Coachモード',
  editor: 'Editorモード',
  writer: 'チェックモード',
};

const stageHints: Record<EventAssistantStage, string> = {
  coach: '動機とイメージを掘り下げています',
  editor: '決めるべき項目を整理中です',
  writer: '草稿を組み立てています',
};

const chatMessages = ref<ChatMessage[]>([]);
const chatDraft = ref('');
const aiLoading = ref(false);
const aiError = ref<string | null>(null);
const aiResult = ref<(GeneratedEventContent & { summary: string }) | null>(null);
const currentQuestionIndex = ref(0);
const awaitingConfirmation = ref(false);
const savingLog = ref(false);

const assistantDraftSnapshot = computed<Partial<EventDraft>>(() => ({
  title: qaState.topic || '',
  description: qaState.details || qaState.topic,
  targetAudience: qaState.audience,
  vibe: qaState.style,
  locationText: qaState.details,
  ticketTypes: [],
  registrationFormSchema: [],
}));

const assistantStage = computed<EventAssistantStage>(() =>
  determineEventAssistantStage(assistantDraftSnapshot.value),
);
const assistantStageLabel = computed(() => stageLabels[assistantStage.value]);
const assistantStageDescription = computed(() => stageHints[assistantStage.value]);

const readyToGenerate = computed(() => questions.every((q) => (qaState as any)[q.key]?.length));
const progressPercent = computed(() => {
  const answered = Math.min(currentQuestionIndex.value, questions.length);
  return Math.round((answered / questions.length) * 100);
});
const currentPrompt = computed(() => {
  if (currentQuestionIndex.value >= questions.length) {
    return '「AIに案をまとめてもらう」を押しましょう';
  }
  return questions[currentQuestionIndex.value].prompt;
});
const generatedTime = computed(() => {
  if (!aiResult.value) return '';
  return new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
});

const pushMessage = (role: ChatRole, type: ChatMessageType, content: string, payload?: ChatMessage['payload']) => {
  chatMessages.value.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    type,
    content,
    createdAt: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    payload,
  });
  if (chatMessages.value.length > 200) {
    chatMessages.value.shift();
  }
};

const handleSend = () => {
  if (!chatDraft.value.trim()) return;
  const content = chatDraft.value.trim();
  chatDraft.value = '';
  pushMessage('user', 'text', content);
  handleChatAnswer(content);
};

const handleChatAnswer = (text: string) => {
  if (awaitingConfirmation.value) {
    if (shouldGenerate(text)) {
      pushMessage('assistant', 'text', '了解しました。AIが文章を組み立てます。');
      requestGeneration();
    } else {
      pushMessage('assistant', 'text', '準備ができたら「生成」やボタンを押してくださいね。');
    }
    return;
  }
  const question = questions[currentQuestionIndex.value];
  if (question) {
    (qaState as any)[question.key] = text;
  }
  if (currentQuestionIndex.value < questions.length - 1) {
    currentQuestionIndex.value += 1;
    pushMessage('assistant', 'text', questions[currentQuestionIndex.value].prompt);
  } else {
    awaitingConfirmation.value = true;
    pushMessage('assistant', 'text', 'ありがとう！この内容でAI案を作成しても良いですか？「生成」と送ってください。');
  }
};

const shouldGenerate = (text: string) => {
  const normalized = text.trim().toLowerCase();
  const positiveWords = ['生成', 'はい', 'yes', 'ok', '好的', '好', 'go', 'start'];
  return positiveWords.some((word) => normalized.includes(word) || text.includes(word));
};

const requestGeneration = async () => {
  aiError.value = null;
  const qaSummary = buildQaSummary();
  const { stage, prompt } = buildEventAssistantPrompt({
    draft: assistantDraftSnapshot.value,
    locale: (qaState.baseLanguage as 'ja' | 'zh' | 'en') || 'ja',
    lastUserUtterance: qaState.details,
  });
  const promptDetails = `${qaSummary}\n\n--- Assistant Prompt ---\n${prompt}`;
  const payload = {
    baseLanguage: qaState.baseLanguage || 'ja',
    topic: qaState.topic || 'コミュニティイベント',
    audience: qaState.audience || '地域の仲間',
    style: qaState.style || 'family-friendly',
    details: promptDetails,
  };
  aiLoading.value = true;
  try {
    const result = await generateEventContent(payload);
    aiResult.value = { ...result, summary: qaSummary };
    pushMessage('assistant', 'text', `現在は${stageLabels[stage]}で案をまとめています。`);
    pushMessage('assistant', 'proposal', '', {
      title: extractText(result.title),
      description: extractText(result.description),
      raw: aiResult.value,
    });
    persistAssistantLog(stage, qaSummary);
    awaitingConfirmation.value = false;
  } catch (err) {
    aiError.value = err instanceof Error ? err.message : 'AI生成に失敗しました。少し時間を置いて再度お試しください。';
    pushMessage('assistant', 'text', aiError.value ?? 'AI生成に失敗しました。');
  } finally {
    aiLoading.value = false;
  }
};

const persistAssistantLog = async (stage: string, summary: string) => {
  if (!communityId.value || !aiResult.value) return;
  try {
    savingLog.value = true;
    const plainMessages = chatMessages.value.map((msg) => ({
      id: msg.id,
      role: msg.role,
      type: msg.type,
      content: msg.content,
      createdAt: msg.createdAt,
      payload: msg.payload
        ? {
            title: msg.payload.title ?? null,
            description: msg.payload.description ?? null,
          }
        : null,
    }));
    await saveEventAssistantLog(communityId.value, {
      stage,
      summary,
      qaState: JSON.parse(JSON.stringify(qaState)),
      messages: plainMessages,
      aiResult: {
        title: aiResult.value.title,
        description: aiResult.value.description,
        notes: aiResult.value.notes,
        riskNotice: aiResult.value.riskNotice,
      },
    });
  } catch (err) {
    console.warn('Failed to save assistant log', err);
  } finally {
    savingLog.value = false;
  }
};

const buildQaSummary = () => {
  return `AIの理解：対象は「${qaState.audience || '地域の参加者'}」、イベントは「${qaState.topic || 'コミュニティ活動'}」、雰囲気は「${qaState.style || 'カジュアル'}」。補足情報: ${qaState.details || '特記事項なし'}`;
};

const extractText = (content: any) => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object' && content.original) {
    return content.original as string;
  }
  return '';
};

const goBack = () => {
  router.back();
};

const goToForm = (useAi: boolean) => {
  if (!communityId.value) return;
  if (useAi && aiResult.value) {
    sessionStorage.setItem(
      CONSOLE_AI_EVENT_DRAFT_KEY,
      JSON.stringify({
        title: extractText(aiResult.value.title),
        description: extractText(aiResult.value.description),
        notes: extractText(aiResult.value.notes),
        riskNotice: extractText(aiResult.value.riskNotice),
        ticketPrice: 0,
        generatedAt: Date.now(),
      }),
    );
  } else {
    sessionStorage.removeItem(CONSOLE_AI_EVENT_DRAFT_KEY);
  }
  router.push({
    name: 'ConsoleMobileEventCreateForm',
    params: { communityId: communityId.value },
  });
};

const openLogs = () => {
  if (!communityId.value) return;
  router.push({ name: 'ConsoleMobileEventAssistantLogs', params: { communityId: communityId.value } });
};

const loadInitialMessage = () => {
  pushMessage('assistant', 'text', 'こんにちは！まずはイベントの概要を教えてください。');
  pushMessage('assistant', 'text', questions[0].prompt);
};

onMounted(async () => {
  await communityStore.loadCommunities();
  if (communityId.value) {
    communityStore.setActiveCommunity(communityId.value);
  }
  loadInitialMessage();
});
</script>

<style scoped>
.assistant-screen {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 8px) 12px calc(72px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, #f4fbff 0%, #eef5fb 60%, #f9f9fb 100%);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.assistant-hero {
  background: #fff;
  border-radius: 24px;
  padding: 16px;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hero-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hero-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.hero-back {
  border: none;
  background: rgba(15, 23, 42, 0.06);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #0f172a;
  font-weight: 600;
}

.hero-logs {
  border: none;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #0f172a;
}

.stage-chip {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
}

.stage-chip--coach {
  background: #f3e8ff;
  color: #7e22ce;
}
.stage-chip--editor {
  background: #dbf4ff;
  color: #0369a1;
}
.stage-chip--writer {
  background: #dcfce7;
  color: #15803d;
}

.hero-label {
  margin: 0;
  font-size: 11px;
  text-transform: uppercase;
  color: #64748b;
  letter-spacing: 0.08em;
}

.hero-title {
  margin: 4px 0;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
}

.hero-desc {
  margin: 0;
  font-size: 12px;
  color: #475569;
  line-height: 1.5;
}
.hero-stage-hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: #0f172a;
  font-weight: 600;
}

.assistant-progress {
  background: #fff;
  border-radius: 20px;
  padding: 12px 16px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.progress-label {
  font-size: 12px;
  color: #475569;
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.progress-bar {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.progress-value {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #0090d9, #22bbaa);
}

.assistant-chat-card {
  background: #fff;
  border-radius: 24px;
  padding: 16px;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 320px;
}

.chat-log {
  max-height: 360px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-bubble {
  max-width: 85%;
  padding: 10px 12px;
  border-radius: 18px;
  font-size: 13px;
  position: relative;
}

.chat-bubble--assistant {
  align-self: flex-start;
  background: #f8fafc;
  color: #0f172a;
}
.chat-bubble--user {
  align-self: flex-end;
  background: #0090d9;
  color: #fff;
}

.chat-text {
  margin: 0;
  white-space: pre-line;
}

.chat-meta {
  display: block;
  font-size: 10px;
  margin-top: 2px;
  opacity: 0.7;
}

.chat-typing {
  font-size: 11px;
  color: #475569;
}

.proposal-card {
  background: #fff;
  border-radius: 14px;
  padding: 10px;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
}
.proposal-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
}
.proposal-desc {
  margin: 0;
  font-size: 12px;
  color: #475569;
  white-space: pre-line;
}

.chat-input-row {
  display: flex;
  gap: 8px;
}

.chat-input {
  flex: 1;
  border-radius: 16px;
  border: 1px solid #cbd5f5;
  padding: 10px 12px;
  font-size: 13px;
}

.chat-send {
  width: 44px;
  border: none;
  border-radius: 16px;
  background: #0090d9;
  color: #fff;
  font-size: 16px;
}

.generate-button {
  border: none;
  border-radius: 16px;
  padding: 10px 14px;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
}
.generate-button:disabled {
  opacity: 0.5;
}

.assistant-error {
  font-size: 11px;
  color: #dc2626;
  text-align: center;
}

.assistant-summary-card {
  background: #fff;
  border-radius: 24px;
  padding: 16px;
  box-shadow: 0 15px 35px rgba(15, 23, 42, 0.08);
}

.summary-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.summary-label {
  margin: 0;
  font-size: 12px;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.summary-time {
  font-size: 11px;
  color: #94a3b8;
}
.assistant-summary-card h2 {
  margin: 6px 0;
  font-size: 18px;
  color: #0f172a;
}
.summary-text {
  margin: 0;
  font-size: 13px;
  color: #475569;
  white-space: pre-line;
}

.summary-notes {
  margin-top: 10px;
  padding: 10px;
  border-radius: 14px;
  background: #f8fafc;
}
.summary-note-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: #0f172a;
}
.summary-note-body {
  margin: 4px 0 0;
  font-size: 12px;
  color: #475569;
}

.assistant-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
}

.primary {
  border: none;
  border-radius: 20px;
  padding: 14px;
  font-size: 14px;
  font-weight: 600;
  background: #e2e8f0;
  color: #0f172a;
}
.primary.gradient {
  background: linear-gradient(90deg, #0090d9, #22bbaa);
  color: #fff;
  box-shadow: 0 15px 30px rgba(0, 144, 217, 0.3);
}
.primary:disabled {
  opacity: 0.5;
}
</style>
