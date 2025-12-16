<template>
  <div class="assistant-shell" :style="screenStyle">
    <div class="assistant-topbar-wrap">
      <ConsoleTopBar class="assistant-topbar" title="イベントアシスタント" :sticky="true" @back="goBack" />
      <div class="top-actions" v-if="communityId">
        <button type="button" class="new-session-btn" @click="startNewConversation">
          ＋ 新しい相談
        </button>
        <button
          type="button"
          class="history-btn"
          @click="goHistory"
          aria-label="履歴"
          title="履歴"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M4 8.5c0-2.485 2.21-4.5 4.933-4.5h6.134C17.79 4 20 6.015 20 8.5v7c0 2.485-2.21 4.5-4.933 4.5H8.933C6.21 20 4 17.985 4 15.5v-7Z" />
            <path d="M8 6.5V4" stroke-linecap="round" />
            <path d="M16 6.5V4" stroke-linecap="round" />
            <path d="M8 10.5h8" stroke-linecap="round" />
            <path d="M8 14h5" stroke-linecap="round" />
            <path d="M8 17.5h3" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>

    <section class="chat-surface">
      <div class="chat-log" ref="chatLogRef">
        <div
          v-for="msg in chatMessages"
          :key="msg.id"
          :class="[
            'chat-bubble',
            msg.role === 'user' ? 'chat-bubble--user' : 'chat-bubble--assistant',
            msg.role === 'assistant' && msg.id === currentQuestionId ? 'is-current-question' : '',
            msg.role === 'assistant' && msg.id !== currentQuestionId ? 'is-previous' : '',
          ]"
        >
          <div v-if="msg.type === 'text'" class="chat-stack">
            <p class="chat-text">{{ msg.content }}</p>
            <button
              v-if="msg.action === 'direct-form'"
              type="button"
              class="inline-link"
              @click="goToForm(false)"
            >
              すぐにフォームを編集
            </button>
            <div v-if="msg.options?.length && msg.id === currentQuestionId" class="chat-follow-up">
              <p class="follow-up-label">次の質問</p>
              <p class="follow-up-text">{{ msg.options[0] }}</p>
              <div class="follow-up-actions">
                <button
                  v-for="(option, idx) in msg.options"
                  :key="`${msg.id}-option-${idx}`"
                  type="button"
                  class="ghost-link"
                  @click="handleOptionSelect(option)"
                >
                  {{ option }}
                </button>
              </div>
              <div v-if="msg.thinkingSteps?.length" class="hint-row-inline">
                <button type="button" class="hint-toggle" @click="toggleThinking(msg.id)">
                  <span>ヒントを見る</span>
                  <span class="hint-toggle__state">{{ expandedThinkingId === msg.id ? '隠す' : '表示' }}</span>
                </button>
                <ol v-if="expandedThinkingId === msg.id" class="thinking-list">
                  <li v-for="(step, idx) in msg.thinkingSteps" :key="`${msg.id}-thinking-${idx}`">
                    <span class="dot"></span>
                    <span>{{ step }}</span>
                  </li>
                </ol>
              </div>
            </div>
            <div v-if="msg.writerSummary" class="summary-block">
              <p class="summary-eyebrow">AI 下書きサマリー</p>
              <ul class="summary-list">
                <li v-if="msg.writerSummary.headline"><strong>タイトル</strong>{{ msg.writerSummary.headline }}</li>
                <li v-if="msg.writerSummary.audience"><strong>対象</strong>{{ msg.writerSummary.audience }}</li>
                <li v-if="msg.writerSummary.logistics"><strong>詳細</strong>{{ msg.writerSummary.logistics }}</li>
                <li v-if="msg.writerSummary.riskNotes"><strong>リスク</strong>{{ msg.writerSummary.riskNotes }}</li>
                <li v-if="msg.writerSummary.nextSteps"><strong>次のステップ</strong>{{ msg.writerSummary.nextSteps }}</li>
              </ul>
            </div>
          </div>
          <div v-else class="proposal-bubble" @click="msg.payload?.raw && openPlanPreview(msg.payload.raw)">
            <div class="proposal-head">
              <p class="proposal-title">{{ msg.payload?.title }}</p>
              <p class="proposal-desc">{{ msg.payload?.description }}</p>
            </div>
            <div class="proposal-actions" v-if="msg.payload?.raw">
              <button type="button" class="ghost-link" @click.stop="applyProposalToForm(msg.payload?.raw)">
                フォームに反映
              </button>
              <button type="button" class="ghost-link" @click.stop="saveProposalDraft(msg.payload?.raw)">
                下書きを保存
              </button>
              <button type="button" class="ghost-link" @click.stop="openPlanPreview(msg.payload?.raw)">
                全文を見る
              </button>
            </div>
          </div>
          <span class="chat-meta">{{ msg.createdAt }}</span>
        </div>

        <div v-if="aiLoading" class="chat-bubble chat-bubble--assistant chat-bubble--typing">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <p class="chat-text">AI がアイデアを整理しています…</p>
        </div>
        <div v-if="aiError" class="chat-bubble chat-bubble--assistant chat-bubble--error">
          <p class="chat-text">{{ aiError }}</p>
        </div>

      </div>
    </section>

    <footer class="input-bar">
      <div class="input-shell">
        <input
          ref="chatInputRef"
          v-model="chatDraft"
          class="chat-input"
          type="text"
          :placeholder="currentPrompt"
          @keyup.enter="handleSend('enter')"
        />
        <button class="chat-send" type="button" @click="handleSend('button')" :disabled="!chatDraft.trim()">
          <span class="i-lucide-send"></span>
        </button>
      </div>
      <p class="input-hint">ひとこと送ると、AI が質問を続けたり案を出します</p>
    </footer>
  </div>
  <teleport to="body">
    <transition name="fade">
      <div v-if="planPreview" class="plan-preview-overlay" @click.self="closePlanPreview">
        <section class="plan-preview-panel">
          <header class="plan-preview-head">
            <div>
              <p class="plan-preview-label">AI 下書き</p>
              <p class="plan-preview-title">{{ previewPlanTitle }}</p>
            </div>
            <button type="button" class="plan-preview-close" @click="closePlanPreview">
              <span class="i-lucide-x"></span>
            </button>
          </header>
          <div class="plan-preview-scroll">
            <article class="plan-preview-section" v-if="previewPlanDescription">
              <p class="plan-preview-subtitle">イベントのポイント</p>
              <p class="plan-preview-text">{{ previewPlanDescription }}</p>
            </article>
            <div class="plan-preview-grid">
              <article v-if="previewPlanNotes">
                <p class="plan-preview-subtitle">備考 / 準備</p>
                <p class="plan-preview-text">{{ previewPlanNotes }}</p>
              </article>
              <article v-if="previewPlanRisk">
                <p class="plan-preview-subtitle">リスク</p>
                <p class="plan-preview-text">{{ previewPlanRisk }}</p>
              </article>
            </div>
            <article class="plan-preview-section" v-if="previewPlanLogistics.length">
              <p class="plan-preview-subtitle">時間・場所</p>
              <ul class="plan-preview-list">
                <li v-for="item in previewPlanLogistics" :key="`preview-logistics-${item.label}`">
                  <strong>{{ item.label }}：</strong>{{ item.value }}
                </li>
              </ul>
            </article>
            <article class="plan-preview-section" v-if="previewPlanTickets.length">
              <p class="plan-preview-subtitle">チケット設定</p>
              <ul class="plan-preview-ticket-list">
                <li v-for="(ticket, idx) in previewPlanTickets" :key="`preview-ticket-${idx}`">
                  <span>{{ ticket.name }}</span>
                  <span>{{ formatTicketPrice(ticket.price) }}</span>
                </li>
              </ul>
            </article>
            <article class="plan-preview-section" v-if="previewPlanRequirements.length">
              <p class="plan-preview-subtitle">参加要件</p>
              <ul class="plan-preview-list">
                <li v-for="(req, idx) in previewPlanRequirements" :key="`preview-req-${idx}`">
                  {{ req.label }}{{ req.type === 'must' ? '（必須）' : '' }}
                </li>
              </ul>
            </article>
            <article class="plan-preview-section" v-if="previewPlanFormFields.length">
              <p class="plan-preview-subtitle">申込フォーム項目</p>
              <ul class="plan-preview-list">
                <li v-for="(field, idx) in previewPlanFormFields" :key="`preview-form-${idx}`">
                  {{ field.label }} · {{ field.type }}{{ field.required ? '（必須）' : '' }}
                </li>
              </ul>
            </article>
          </div>
        </section>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { buildEventAssistantPrompt } from '../../../ai/eventCreationAssistant';
import type { EventAssistantStage } from '../../../ai/eventCreationAssistant';
import {
  fetchAssistantProfileDefaults,
  generateEventContent,
  requestEventAssistantReply,
  fetchEventAssistantLogs,
  saveEventAssistantLog,
  fetchConsoleCommunity,
} from '../../../api/client';
import type {
  EventAssistantProfileDefaults,
  EventAssistantStatus,
  EventAssistantReply,
  EventDraft,
  GeneratedEventContent,
  ConsoleCommunityDetail,
} from '../../../types/api';
import { CONSOLE_AI_EVENT_DRAFT_KEY } from '../../../constants/console';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import { getLocalizedText } from '../../../utils/i18nContent';
import { useToast } from '../../../composables/useToast';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';

type ChatRole = 'user' | 'assistant';
type ChatMessageType = 'text' | 'proposal';
interface ChatMessage {
  id: string;
  role: ChatRole;
  type: ChatMessageType;
  content: string;
  createdAt: string;
  includeInContext?: boolean;
  action?: 'direct-form';
  options?: string[];
  thinkingSteps?: string[];
  coachPrompts?: string[];
  editorChecklist?: string[];
  writerSummary?: EventAssistantReply['writerSummary'];
  confirmQuestions?: string[];
  payload?: {
    title?: string;
    description?: string;
    raw?: (GeneratedEventContent & { summary?: string }) | null;
  };
}

interface AssistantHistoryEntry {
  id: string;
  createdAt: number;
  summary: string;
  title: string;
  description: string;
  raw: GeneratedEventContent & { summary?: string };
}

const HISTORY_STORAGE_KEY = 'console-ai-assistant-history';
const DRAFT_STORAGE_KEY = 'console-ai-assistant-drafts';
const RESUME_WINDOW_HOURS = 24;

const route = useRoute();
const router = useRouter();
const communityStore = useConsoleCommunityStore();
const toast = useToast();
const communityId = computed(() => route.params.communityId as string | undefined);
const forceNewSession = computed(() => route.query.newSession === '1');
const activeCommunityDetail = ref<ConsoleCommunityDetail | null>(null);
const introConversationStarted = ref(false);
const welcomeText = 'おかえりなさい。どんなイベントを作りたいか教えてください。';
const leadPrompts = [
  'まず、どんなイベントを考えていますか？',
  '誰に来てほしいですか？参加条件はありますか？',
  '日時や場所、雰囲気が決まっていればゆるく教えてください。',
];

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

const chatMessages = ref<ChatMessage[]>([]);
const chatLogRef = ref<HTMLElement | null>(null);
const keyboardOffset = ref(0);
const autoScrollEnabled = ref(true);
const currentQuestionId = ref<string | null>(null);
const screenStyle = computed(() => ({
  '--keyboard-offset': `${keyboardOffset.value}px`,
}));
const chatDraft = ref('');
const chatInputRef = ref<HTMLInputElement | null>(null);
const aiLoading = ref(false);
const aiError = ref<string | null>(null);
const aiResult = ref<(GeneratedEventContent & { summary: string }) | null>(null);
const planPreview = ref<(GeneratedEventContent & { summary?: string }) | null>(null);
const currentQuestionIndex = ref(0);
const savingLog = ref(false);
const historyEntries = ref<AssistantHistoryEntry[]>([]);
const expandedThinkingId = ref<string | null>(null);
const lastAssistantStatus = ref<EventAssistantStatus>('collecting');
const lastPromptVersion = ref('coach-v2');
const currentStage = ref<EventAssistantStage>('coach');
const pendingQuestion = ref<string | null>(null);
const stageLabels: Record<EventAssistantStage, string> = {
  coach: 'ディスカッション',
  editor: '詳細調整',
  writer: '下書き作成',
};
const lastTurnCount = ref(0);
const lastLanguage = ref('ja');
const activeLogId = ref<string | null>(null);
const assistantStatusText = computed(() => {
  switch (lastAssistantStatus.value) {
    case 'completed':
      return '完了';
    case 'ready':
      return '提案ができました';
    case 'options':
      return '候補提案';
    default:
      return '情報収集中';
  }
});

const profileDefaults = ref<EventAssistantProfileDefaults['defaults']>({
  baseLanguage: 'zh',
  topic: 'コミュニティイベント',
  audience: '地域の仲間',
  style: 'family-friendly',
});

const latestCoachPrompts = computed(() => {
  for (let i = chatMessages.value.length - 1; i >= 0; i -= 1) {
    const message = chatMessages.value[i];
    if (message.role === 'assistant' && message.coachPrompts?.length) {
      return message.coachPrompts;
    }
  }
  return [] as string[];
});
const latestChecklist = ref<string[]>([]);
const latestConfirmQuestions = ref<string[]>([]);

const getPlanTitle = (
  plan?: (GeneratedEventContent & { summary?: string }) | null,
  fallbackTopic?: string,
) => {
  if (!plan) return '';
  const title = extractText(plan.title);
  return title || fallbackTopic || 'AI 提案';
};

const buildPlanLogistics = (plan?: (GeneratedEventContent & { summary?: string }) | null) => {
  const logistics = plan?.logistics;
  if (!logistics) return [];
  const entries: Array<{ label: string; value: string }> = [];
  if (logistics.startTime) {
    entries.push({ label: '開始', value: formatDateTime(logistics.startTime) });
  }
  if (logistics.endTime) {
    entries.push({ label: '終了', value: formatDateTime(logistics.endTime) });
  }
  if (logistics.locationText) {
    entries.push({ label: '場所', value: logistics.locationText });
  }
  if (logistics.locationNote) {
    entries.push({ label: '備考', value: logistics.locationNote });
  }
  return entries;
};

const getPlanTickets = (plan?: (GeneratedEventContent & { summary?: string }) | null) =>
  plan?.ticketTypes ?? [];
const getPlanRequirements = (plan?: (GeneratedEventContent & { summary?: string }) | null) =>
  plan?.requirements ?? [];
const getPlanFormFields = (plan?: (GeneratedEventContent & { summary?: string }) | null) =>
  plan?.registrationForm ?? [];

const finalPlanTitle = computed(() => getPlanTitle(aiResult.value, qaState.topic));
const finalPlanLogistics = computed(() => buildPlanLogistics(aiResult.value));
const finalPlanTickets = computed(() => getPlanTickets(aiResult.value));
const finalPlanRequirements = computed(() => getPlanRequirements(aiResult.value));
const finalPlanFormFields = computed(() => getPlanFormFields(aiResult.value));
const previewPlanTitle = computed(() => getPlanTitle(planPreview.value));
const previewPlanDescription = computed(() => extractText(planPreview.value?.description));
const previewPlanNotes = computed(() => extractText(planPreview.value?.notes));
const previewPlanRisk = computed(() => extractText(planPreview.value?.riskNotice));
const previewPlanLogistics = computed(() => buildPlanLogistics(planPreview.value));
const previewPlanTickets = computed(() => getPlanTickets(planPreview.value));
const previewPlanRequirements = computed(() => getPlanRequirements(planPreview.value));
const previewPlanFormFields = computed(() => getPlanFormFields(planPreview.value));
const formatTicketPrice = (price?: number) => {
  if (price == null) return '無料';
  return `¥${price.toLocaleString('ja-JP')}`;
};
const formatDateTime = (value: string) => {
  try {
    return new Date(value).toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
};

const assistantDraftSnapshot = computed<Partial<EventDraft>>(() => ({
  title: qaState.topic || '',
  description: qaState.details || qaState.topic,
  targetAudience: qaState.audience,
  vibe: qaState.style,
  locationText: qaState.details,
  ticketTypes: [],
  registrationFormSchema: [],
}));
const currentPrompt = computed(() => {
  if (pendingQuestion.value) {
    return pendingQuestion.value;
  }
  if (latestCoachPrompts.value.length) {
    return latestCoachPrompts.value[0];
  }
  if (currentQuestionIndex.value >= questions.length) {
    return '追加で伝えたいことや質問を入力してください';
  }
  return questions[currentQuestionIndex.value].prompt;
});

watch(
  () => communityId.value,
  async () => {
    introConversationStarted.value = false;
    activeLogId.value = null;
    chatMessages.value = [];
    aiResult.value = null;
    await loadActiveCommunityDetail();
    const resumed = await tryResumeConversation();
    if (!resumed) {
      startNewConversation();
    } else {
      scrollChatToBottom(true);
    }
  },
);

const scrollChatToBottom = (force = false) => {
  nextTick(() => {
    const container = chatLogRef.value;
    if (container && (autoScrollEnabled.value || force)) {
      container.scrollTop = container.scrollHeight;
    }
  });
};

const pushMessage = (
  role: ChatRole,
  type: ChatMessageType,
  content: string,
  payload?: ChatMessage['payload'],
  action?: ChatMessage['action'],
  options?: string[],
  steps?: string[],
  coachPrompts?: string[],
  editorChecklist?: string[],
  writerSummary?: EventAssistantReply['writerSummary'],
  confirmQuestions?: string[],
  extras?: { includeInContext?: boolean },
) => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  chatMessages.value.push({
    id,
    role,
    type,
    content,
    createdAt: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    payload,
    action,
    options,
    thinkingSteps: steps && steps.length ? steps : undefined,
    coachPrompts,
    editorChecklist,
    writerSummary,
    confirmQuestions,
    includeInContext: extras?.includeInContext ?? true,
  });
  if (chatMessages.value.length > 200) {
    chatMessages.value.shift();
  }
  scrollChatToBottom();
  return id;
};

const seedWelcomeMessages = () => {
  if (chatMessages.value.some((msg) => msg.content === welcomeText)) return;
  pushMessage('assistant', 'text', welcomeText);
  const question = leadPrompts[0];
  const messageId = pushMessage('assistant', 'text', question, undefined, undefined, [question], undefined, undefined, undefined, undefined, {
    includeInContext: true,
  });
  pendingQuestion.value = question;
  currentQuestionId.value = messageId;
};

const loadActiveCommunityDetail = async () => {
  if (!communityId.value) {
    activeCommunityDetail.value = null;
    return;
  }
  try {
    activeCommunityDetail.value = await fetchConsoleCommunity(communityId.value);
  } catch (error) {
    console.warn('Failed to load community detail', error);
    activeCommunityDetail.value = null;
  }
};

const startIntroConversation = async () => {
  if (introConversationStarted.value) return;
  introConversationStarted.value = true;
  const community = activeCommunityDetail.value;
  const aboutText = community?.description ? getLocalizedText(community.description) : '';
  const communityName = community?.name ?? 'Tokyo Community Organizations Group';
  const introPrompt = aboutText
    ? `コミュニティ紹介：${communityName}\n${aboutText}\n\n上記の背景を踏まえて、主催者が最初のアイデアを話しやすいようCoachモードで歓迎し、最初の質問を投げかけてください。`
    : 'コミュニティ紹介情報はありません。主催者を歓迎し、最初のアイデアを引き出す質問から始めてください。';
  await requestAssistantReply(introPrompt, {
    overrideSummary: `コミュニティ紹介: ${communityName}`,
  });
};

const handleSend = async (source: 'button' | 'enter' = 'button') => {
  if (!chatDraft.value.trim() || aiLoading.value) return;
  autoScrollEnabled.value = true;
  const content = chatDraft.value.trim();
  chatDraft.value = '';
  currentQuestionId.value = null;
  if (source === 'button') {
    chatInputRef.value?.blur();
    keyboardOffset.value = 0;
  }
  pushMessage('user', 'text', content);
  await handleChatAnswer(content);
};

const detectLanguage = (text: string) => {
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
  if (/[a-zA-Z]/.test(text)) return 'en';
  return 'ja';
};

const applyLanguageFromInput = (text: string) => {
  const detected = detectLanguage(text);
  if (detected && qaState.baseLanguage !== detected) {
    qaState.baseLanguage = detected;
  }
};

const handleChatAnswer = async (text: string) => {
  applyLanguageFromInput(text);
  const question = questions[currentQuestionIndex.value];
  if (question) {
    (qaState as any)[question.key] = text;
  }
  if (currentQuestionIndex.value < questions.length - 1) {
    currentQuestionIndex.value += 1;
  }
  pendingQuestion.value = null;
  await requestAssistantReply(text);
};

const handleOptionSelect = async (option: string) => {
  if (!option || aiLoading.value) return;
  autoScrollEnabled.value = true;
  currentQuestionId.value = null;
  pushMessage('user', 'text', option);
  await handleChatAnswer(option);
};

const requestAssistantReply = async (userText: string, options?: { overrideSummary?: string }) => {
  aiError.value = null;
  const qaSummary = options?.overrideSummary ?? buildQaSummary(userText);
  const { stage, prompt } = buildEventAssistantPrompt({
    draft: assistantDraftSnapshot.value,
    locale: (qaState.baseLanguage as 'ja' | 'zh' | 'en') || 'ja',
    lastUserUtterance: userText,
  });
  currentStage.value = stage;
  const conversationContext = buildConversationContext();
  const promptDetails = `${qaSummary}\n\n--- Conversation ---\n${conversationContext}\n\n--- Assistant Prompt ---\n${prompt}`;
  const conversationMessages = buildConversationMessages();
  const payload = {
    baseLanguage: getProfileValue(qaState.baseLanguage, 'baseLanguage'),
    topic: getProfileValue(qaState.topic, 'topic'),
    audience: getProfileValue(qaState.audience, 'audience'),
    style: getProfileValue(qaState.style, 'style'),
    details: promptDetails,
    conversation: conversationMessages,
  };
  aiLoading.value = true;
  try {
    const result = await requestEventAssistantReply(payload);
    const steps = Array.isArray(result.thinkingSteps) ? result.thinkingSteps : [];
    const nextQuestion = result.options?.[0] ?? null;
    const optionList = nextQuestion ? [nextQuestion] : undefined;
    lastAssistantStatus.value = result.status;
    lastPromptVersion.value = result.promptVersion;
    lastTurnCount.value = result.turnCount;
    lastLanguage.value = result.language;
    if (result.stage && ['coach', 'editor', 'writer'].includes(result.stage)) {
      currentStage.value = result.stage as EventAssistantStage;
    }
    latestChecklist.value = result.editorChecklist ?? [];
    latestConfirmQuestions.value = result.confirmQuestions ?? [];
  const stageIsWriter = result.stage === 'writer';
  const messageId = pushMessage(
    'assistant',
    'text',
    result.message,
    undefined,
    undefined,
    optionList,
    steps,
    result.coachPrompts,
    result.editorChecklist,
    stageIsWriter ? result.writerSummary : undefined,
    result.confirmQuestions,
  );
    pendingQuestion.value = nextQuestion;
    currentQuestionId.value = optionList ? messageId : null;
    let preparedProposal: (GeneratedEventContent & { summary: string }) | null = null;
    const shouldPrepareProposal =
      (result.status === 'ready' || result.status === 'options' || Boolean(result.proposal)) &&
      result.stage === 'writer';
    if (shouldPrepareProposal) {
      const finalProposal =
        result.proposal ??
        (await generateEventContent({
          baseLanguage: qaState.baseLanguage || 'ja',
          topic: qaState.topic || 'コミュニティイベント',
          audience: qaState.audience || '地域の仲間',
          style: qaState.style || 'family-friendly',
          details: qaSummary,
        }));
      preparedProposal = { ...finalProposal, summary: qaSummary };
      aiResult.value = preparedProposal;
      const title = extractText(preparedProposal.title);
      const desc = extractText(preparedProposal.description);
      pushMessage('assistant', 'proposal', '', {
        title,
        description: desc,
        raw: aiResult.value,
      });
  } else {
    aiResult.value = null;
    pendingQuestion.value = null;
  }
    await persistAssistantLog(stage, qaSummary, {
      status: result.status,
      promptVersion: result.promptVersion,
      turnCount: result.turnCount,
      language: result.language,
      options: result.options ?? [],
      coachPrompts: result.coachPrompts ?? [],
      editorChecklist: result.editorChecklist ?? [],
      writerSummary: stageIsWriter ? result.writerSummary ?? null : null,
    });
    if (preparedProposal) {
      addHistoryEntry(preparedProposal);
    }
  } catch (err) {
    aiError.value = err instanceof Error ? err.message : 'AI生成に失敗しました。少し時間を置いて再度お試しください。';
    pushMessage('assistant', 'text', aiError.value ?? 'AI生成に失敗しました。');
  } finally {
    aiLoading.value = false;
    if (!pendingQuestion.value) {
      pendingQuestion.value = null;
    }
  }
};

const persistAssistantLog = async (
  stage: string,
  summary: string,
  meta?: {
    status?: string;
    promptVersion?: string;
    turnCount?: number;
    language?: string;
    options?: string[];
    coachPrompts?: string[];
    editorChecklist?: string[];
    writerSummary?: EventAssistantReply['writerSummary'] | null;
  },
) => {
  if (!communityId.value) return;
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
    const saved = await saveEventAssistantLog(communityId.value, {
      stage,
      summary,
      qaState: JSON.parse(JSON.stringify(qaState)),
      messages: plainMessages,
      aiResult: aiResult.value
        ? {
            title: aiResult.value.title,
            description: aiResult.value.description,
            notes: aiResult.value.notes,
            riskNotice: aiResult.value.riskNotice,
          }
        : null,
      promptVersion: meta?.promptVersion,
      status: meta?.status,
      turnCount: meta?.turnCount,
      language: meta?.language,
      meta: {
        options: meta?.options ?? [],
        coachPrompts: meta?.coachPrompts ?? [],
        editorChecklist: meta?.editorChecklist ?? [],
        writerSummary: meta?.writerSummary ?? null,
      },
      logId: activeLogId.value,
    });
    activeLogId.value = saved.id;
  } catch (err) {
    console.warn('Failed to save assistant log', err);
  } finally {
    savingLog.value = false;
  }
};

const addHistoryEntry = (result: GeneratedEventContent & { summary: string }) => {
  const entry: AssistantHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
    summary: result.summary,
    title: extractText(result.title),
    description: extractText(result.description),
    raw: result,
  };
  historyEntries.value = [entry, ...historyEntries.value].slice(0, 10);
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyEntries.value));
};

const loadHistoryEntries = () => {
  const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored) as AssistantHistoryEntry[];
    historyEntries.value = parsed;
  } catch (err) {
    console.warn('Failed to parse assistant history', err);
  }
};

const saveProposalDraft = (raw?: GeneratedEventContent & { summary?: string }) => {
  if (!raw) return;
  const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
  let drafts: AssistantHistoryEntry[] = [];
  if (stored) {
    try {
      drafts = JSON.parse(stored);
    } catch (err) {
      drafts = [];
    }
  }
  drafts = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
      summary: raw.summary || '',
      title: extractText(raw.title),
      description: extractText(raw.description),
      raw,
    },
    ...drafts,
  ].slice(0, 10);
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  pushMessage('assistant', 'text', 'この案を草稿として保存しました。履歴からいつでも復元できます。');
};

const applyProposalToForm = (raw?: GeneratedEventContent & { summary?: string }) => {
  if (!raw) return;
  aiResult.value = { ...raw, summary: raw.summary || buildQaSummary() };
  goToForm(true);
};

const toggleThinking = (messageId: string) => {
  expandedThinkingId.value = expandedThinkingId.value === messageId ? null : messageId;
};

const openPlanPreview = (plan?: (GeneratedEventContent & { summary?: string }) | null) => {
  if (!plan) return;
  planPreview.value = plan;
};

const closePlanPreview = () => {
  planPreview.value = null;
};

const loadProfileDefaults = async () => {
  try {
    const response = await fetchAssistantProfileDefaults();
    profileDefaults.value = response.defaults;
    lastPromptVersion.value = response.version;
    applyDefaultsToState();
  } catch (err) {
    console.warn('Failed to load assistant defaults', err);
  }
};

const applyDefaultsToState = () => {
  if (!qaState.baseLanguage) qaState.baseLanguage = profileDefaults.value.baseLanguage;
  if (!qaState.topic) qaState.topic = profileDefaults.value.topic;
  if (!qaState.audience) qaState.audience = profileDefaults.value.audience;
  if (!qaState.style) qaState.style = profileDefaults.value.style;
};

const buildQaSummary = (latestInput?: string) => {
  return `AIの理解：対象は「${getProfileValue(qaState.audience, 'audience')}」、イベントは「${getProfileValue(
    qaState.topic,
    'topic',
  )}」、雰囲気は「${getProfileValue(qaState.style, 'style')}」。補足情報: ${
    latestInput || qaState.details || '特記事項なし'
  }`;
};

const buildConversationContext = () => {
  return chatMessages.value
    .filter((msg) => msg.includeInContext !== false)
    .slice(-8)
    .map((msg) => {
      const speaker = msg.role === 'user' ? 'User' : 'Assistant';
      const body =
        msg.type === 'text'
          ? msg.content
          : `提案: ${msg.payload?.title ?? ''} ${msg.payload?.description ?? ''}`;
      return `${speaker}: ${body}`;
    })
    .join('\n');
};

const buildConversationMessages = () => {
  return chatMessages.value
    .filter((msg) => msg.includeInContext !== false)
    .slice(-10)
    .map((msg) => ({
      role: msg.role,
      content:
        msg.type === 'text'
          ? msg.content
          : `提案: ${msg.payload?.title ?? ''} ${msg.payload?.description ?? ''}`,
    }));
};

const isInProgressStatus = (status?: string | null) => {
  if (!status) return true;
  return status !== 'completed' && status !== 'ready';
};

const computeQuestionIndexFromQaState = () => {
  let filled = 0;
  if (qaState.topic) filled += 1;
  if (qaState.audience) filled += 1;
  if (qaState.style) filled += 1;
  if (qaState.details) filled += 1;
  return Math.min(filled, questions.length);
};

const resetQaState = () => {
  qaState.baseLanguage = profileDefaults.value.baseLanguage;
  qaState.topic = '';
  qaState.audience = '';
  qaState.style = '';
  qaState.details = '';
};

const restoreFromLog = (log: ConsoleEventAssistantLog) => {
  const mappedMessages: ChatMessage[] = (log.messages || []).map((msg) => ({
    id: msg.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    type: msg.type === 'proposal' ? 'proposal' : 'text',
    content: msg.content || '',
    createdAt:
      msg.createdAt ||
      new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    payload:
      msg.type === 'proposal' && msg.payload
        ? {
            title: (msg.payload as any).title ?? '',
            description: (msg.payload as any).description ?? '',
          }
        : undefined,
    includeInContext: true,
  }));
  chatMessages.value = mappedMessages.slice(-200);
  if (log.qaState) {
    qaState.baseLanguage = (log.qaState as any).baseLanguage || qaState.baseLanguage;
    qaState.topic = (log.qaState as any).topic || '';
    qaState.audience = (log.qaState as any).audience || '';
    qaState.style = (log.qaState as any).style || '';
    qaState.details = (log.qaState as any).details || '';
  }
  currentQuestionIndex.value = computeQuestionIndexFromQaState();
  lastAssistantStatus.value = (log.status as EventAssistantStatus) || 'collecting';
  lastPromptVersion.value = log.promptVersion || lastPromptVersion.value;
  lastTurnCount.value = log.turnCount || 0;
  lastLanguage.value = (log.language as string) || lastLanguage.value;
  activeLogId.value = log.id;
  introConversationStarted.value = true;
  pendingQuestion.value = null;
  currentQuestionId.value = null;
  scrollChatToBottom(true);
};

const tryResumeConversation = async () => {
  if (!communityId.value || forceNewSession.value) return false;
  try {
    const existingLogs = await fetchEventAssistantLogs(communityId.value);
    const now = Date.now();
    const recentInProgress = existingLogs
      .filter((log) => {
        const createdAt = new Date((log as any).updatedAt || log.createdAt).getTime();
        const withinWindow = now - createdAt <= RESUME_WINDOW_HOURS * 60 * 60 * 1000;
        return isInProgressStatus(log.status) && withinWindow;
      })
      .sort(
        (a, b) =>
          new Date((b as any).updatedAt || b.createdAt).getTime() -
          new Date((a as any).updatedAt || a.createdAt).getTime(),
      );
    if (recentInProgress.length) {
      restoreFromLog(recentInProgress[0]);
      return true;
    }
  } catch (err) {
    console.warn('Failed to resume assistant log', err);
  }
  return false;
};

const startNewConversation = () => {
  activeLogId.value = null;
  chatMessages.value = [];
  aiResult.value = null;
  pendingQuestion.value = null;
  currentQuestionId.value = null;
  currentQuestionIndex.value = 0;
  aiError.value = null;
  latestChecklist.value = [];
  latestConfirmQuestions.value = [];
  resetQaState();
  introConversationStarted.value = false;
  seedWelcomeMessages();
  startIntroConversation();
};

const getProfileValue = (value: string | undefined | null, key: keyof typeof profileDefaults.value) => {
  if (value && value.trim()) {
    return value;
  }
  return profileDefaults.value[key];
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

const goHistory = () => {
  if (!communityId.value) return;
  router.push({ name: 'ConsoleMobileAssistantLogs', params: { communityId: communityId.value } });
};

const markSessionCompleted = async () => {
  if (!communityId.value) return;
  await persistAssistantLog(currentStage.value, buildQaSummary(), {
    status: 'completed',
    promptVersion: lastPromptVersion.value,
    turnCount: lastTurnCount.value,
    language: lastLanguage.value,
  });
  lastAssistantStatus.value = 'completed';
};

const goToForm = async (useAi: boolean) => {
  if (!communityId.value) return;
  if (useAi && aiResult.value) {
    sessionStorage.setItem(
      CONSOLE_AI_EVENT_DRAFT_KEY,
      JSON.stringify({
        title: extractText(aiResult.value.title),
        subtitle: extractText(aiResult.value.subtitle),
        description: extractText(aiResult.value.description),
        notes: extractText(aiResult.value.notes),
        riskNotice: extractText(aiResult.value.riskNotice),
        logistics: aiResult.value.logistics ?? null,
        ticketTypes: aiResult.value.ticketTypes ?? [],
        requirements: aiResult.value.requirements ?? [],
        registrationForm: aiResult.value.registrationForm ?? [],
        visibility: aiResult.value.visibility ?? 'public',
        checklist: latestChecklist.value,
        confirmQuestions: latestConfirmQuestions.value,
        generatedAt: Date.now(),
      }),
    );
  } else {
    sessionStorage.removeItem(CONSOLE_AI_EVENT_DRAFT_KEY);
  }
  toast.show('AI案をフォームに送信しました。次の画面で項目を確認してください。', 'info');
  await markSessionCompleted();
  router.push({
    name: 'ConsoleMobileEventForm',
    params: { communityId: communityId.value },
    query: { source: 'ai-assistant' },
  });
};

const removeScrollListener = ref<(() => void) | null>(null);

onMounted(async () => {
  await loadProfileDefaults();
  await communityStore.loadCommunities();
  if (communityId.value) {
    communityStore.setActiveCommunity(communityId.value);
  }
  loadHistoryEntries();
  await loadActiveCommunityDetail();
  const resumed = await tryResumeConversation();
  if (!resumed) {
    seedWelcomeMessages();
    await startIntroConversation();
  }
  nextTick(() => {
    const container = chatLogRef.value;
    if (!container) return;
    const handleScroll = () => {
      if (!container) return;
      const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
      autoScrollEnabled.value = nearBottom;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    removeScrollListener.value = () => container.removeEventListener('scroll', handleScroll);
  });
});

if (typeof window !== 'undefined' && window.visualViewport) {
  const handleViewport = () => {
    const viewport = window.visualViewport;
    const inner = window.innerHeight;
    const offset = Math.max(0, inner - viewport.height - viewport.offsetTop);
    keyboardOffset.value = offset;
  };
  window.visualViewport.addEventListener('resize', handleViewport);
  window.visualViewport.addEventListener('scroll', handleViewport);
  handleViewport();
  onUnmounted(() => {
    window.visualViewport?.removeEventListener('resize', handleViewport);
    window.visualViewport?.removeEventListener('scroll', handleViewport);
  });
}

onUnmounted(() => {
  if (removeScrollListener.value) {
    removeScrollListener.value();
    removeScrollListener.value = null;
  }
});
</script>

<style scoped>
.assistant-shell {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: radial-gradient(circle at 20% 20%, #e4f0ff 0%, #f7f9fb 45%, #f4f2ff 100%);
  color: #0f172a;
  --keyboard-offset: 0px;
}

@supports (height: 100dvh) {
  .assistant-shell {
    height: 100dvh;
    min-height: 100dvh;
  }
}

.assistant-topbar {
  position: relative;
  z-index: 30;
}

.assistant-topbar-wrap {
  position: sticky;
  top: 0;
  z-index: 35;
  background: radial-gradient(circle at 20% 20%, #e4f0ff 0%, #f7f9fb 45%, #f4f2ff 100%);
}

.top-actions {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 10px);
  right: 12px;
  display: flex;
  gap: 8px;
  z-index: 36;
}

.new-session-btn {
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.95);
  color: #0f172a;
  border-radius: 12px;
  padding: 8px 12px;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12);
  font-weight: 700;
}

.history-btn {
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.9);
  color: #0f172a;
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.chat-surface {
  flex: 1;
  min-height: 0;
}

.chat-log {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px 120px;
  box-sizing: border-box;
}

.chat-bubble {
  max-width: 92%;
  padding: 12px 14px;
  border-radius: 16px;
  box-sizing: border-box;
  word-break: break-word;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
}

.chat-bubble--assistant {
  align-self: flex-start;
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.05);
}

.chat-bubble.is-current-question {
  border-color: rgba(37, 99, 235, 0.4);
  box-shadow: 0 14px 28px rgba(37, 99, 235, 0.08);
}

.chat-bubble.is-previous {
  opacity: 0.85;
}

.chat-bubble--assistant.chat-bubble--typing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.chat-bubble--assistant.chat-bubble--error {
  border-color: rgba(248, 113, 113, 0.35);
  background: rgba(254, 242, 242, 0.9);
  color: #b91c1c;
}

.chat-bubble--user {
  align-self: flex-end;
  background: linear-gradient(135deg, #111827, #0f172a);
  color: #f8fafc;
  border: none;
}

.chat-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-text {
  margin: 0;
  white-space: pre-line;
  line-height: 1.6;
}

.inline-link {
  border: none;
  background: transparent;
  color: #0ea5e9;
  font-weight: 700;
  font-size: 13px;
  padding: 0;
  text-decoration: underline;
}

.chat-follow-up {
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(224, 231, 255, 0.6);
  border: 1px dashed rgba(99, 102, 241, 0.4);
}

.follow-up-label {
  margin: 0 0 4px;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: #4338ca;
  text-transform: uppercase;
}

.follow-up-text {
  margin: 0;
  font-weight: 700;
  color: #312e81;
  line-height: 1.5;
}

.follow-up-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.hint-row-inline {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.thinking-shell {
  border-radius: 14px;
  background: rgba(244, 247, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.25);
  padding: 10px 12px;
}

.hint-toggle {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: none;
  background: transparent;
  color: #475569;
  font-weight: 700;
  padding: 0;
}

.hint-toggle__state {
  font-size: 12px;
  color: #2563eb;
}

.thinking-list {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.thinking-list li {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  color: #0f172a;
  font-size: 14px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2563eb;
  margin-top: 6px;
  flex-shrink: 0;
}

.summary-block {
  border-radius: 14px;
  background: rgba(255, 247, 237, 0.9);
  border: 1px solid rgba(251, 191, 36, 0.35);
  padding: 10px 12px;
}

.summary-eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: #b45309;
  text-transform: uppercase;
}

.summary-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 6px;
  color: #7c2d12;
}

.summary-list strong {
  display: block;
  font-size: 12px;
  text-transform: uppercase;
  color: #b45309;
}

.proposal-bubble {
  background: linear-gradient(135deg, #eef2ff, #e0f2fe);
  border: 1px solid rgba(59, 130, 246, 0.35);
  border-radius: 16px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.proposal-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.proposal-title {
  margin: 0;
  font-weight: 800;
  color: #0f172a;
  font-size: 15px;
}

.proposal-desc {
  margin: 0;
  color: #1f2937;
  white-space: pre-line;
  line-height: 1.55;
}

.proposal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ghost-link {
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: rgba(255, 255, 255, 0.9);
  color: #0f172a;
  border-radius: 999px;
  padding: 6px 12px;
  font-weight: 700;
}

.chat-meta {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: #94a3b8;
}

.typing-dot {
  width: 8px;
  height: 8px;
  border-radius: 10px;
  background: #cbd5e1;
  animation: dotPulse 1s infinite ease-in-out;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.15s;
}

.typing-dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes dotPulse {
  0% {
    transform: translateY(0);
    opacity: 0.4;
  }
  50% {
    transform: translateY(-2px);
    opacity: 1;
  }
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
}

.input-bar {
  padding: 10px 14px calc(env(safe-area-inset-bottom, 0px) + 12px);
  background: rgba(255, 255, 255, 0.92);
  border-top: 1px solid rgba(15, 23, 42, 0.05);
  box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.06);
  transform: translateY(calc(var(--keyboard-offset, 0px) * -1));
  transition: transform 0.2s ease;
}

.input-shell {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 18px;
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.05);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.chat-input {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 15px;
  color: #0f172a;
}

.chat-input::placeholder {
  color: #94a3b8;
}

.chat-input:focus {
  outline: none;
}

.chat-send {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  border: none;
  background: linear-gradient(135deg, #2563eb, #0ea5e9);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.3);
}

.chat-send:disabled {
  opacity: 0.4;
  box-shadow: none;
}

.input-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #64748b;
}

.plan-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 90;
}

.plan-preview-panel {
  width: min(620px, 92vw);
  max-height: 90vh;
  background: #fff;
  border-radius: 24px;
  padding: 20px;
  box-shadow: 0 22px 60px rgba(15, 23, 42, 0.35);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.plan-preview-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.plan-preview-label {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.18em;
  color: #94a3b8;
  text-transform: uppercase;
}

.plan-preview-title {
  margin: 4px 0 0;
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.3;
}

.plan-preview-close {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: #fff;
  color: #0f172a;
}

.plan-preview-scroll {
  overflow-y: auto;
  padding-right: 4px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.plan-preview-section {
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.9);
  border: 1px solid rgba(203, 213, 225, 0.6);
}

.plan-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.plan-preview-grid article {
  background: rgba(248, 250, 252, 0.9);
  border: 1px solid rgba(203, 213, 225, 0.6);
  border-radius: 16px;
  padding: 12px 14px;
}

.plan-preview-subtitle {
  margin: 0 0 4px;
  font-size: 13px;
  color: #475569;
  font-weight: 600;
}

.plan-preview-text {
  margin: 0;
  font-size: 13px;
  color: #0f172a;
  line-height: 1.5;
  white-space: pre-line;
}

.plan-preview-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #0f172a;
}

.plan-preview-ticket-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plan-preview-ticket-list li {
  display: flex;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.04);
  font-size: 13px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
