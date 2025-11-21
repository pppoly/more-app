<template>
  <div class="assistant-screen" :style="screenStyle">
    <section class="assistant-chat-surface">
      <div class="chat-tools">
        <span class="status-chip">{{ assistantStatusText }}</span>
        <span class="mode-chip">{{ stageLabels[currentStage] }}</span>
        <span class="prompt-chip" v-if="aiResult">Prompt {{ lastPromptVersion }}</span>
        <button type="button" class="history-toggle" @click="toggleHistory">
          <span class="i-lucide-clock-4"></span>
          {{ historyPreview ? '收起历史' : '会话历史' }}
        </button>
      </div>
      <section v-if="shouldShowGuide" class="assistant-guide">
        <p class="guide-title">SOCIALMORE AI 使用说明</p>
        <ol>
          <li><strong>Speak</strong>：随便说出你的想法或需求。</li>
          <li><strong>Guide</strong>：AI Coach/Editor 会提问，逐条回答即可。</li>
          <li><strong>Write</strong>：完成提问后，AI 会生成方案，并可一键送表单或存草案。</li>
        </ol>
        <button v-if="chatMessages.length" type="button" class="guide-dismiss" @click="toggleGuide">
          收起说明
        </button>
      </section>
      <button
        v-else
        type="button"
        class="guide-inline-toggle"
        @click="toggleGuide"
      >
        <span class="i-lucide-info"></span>
        查看使用说明
      </button>
      <div v-if="showHistory" class="history-overlay" @click.self="toggleHistory">
        <section class="history-sheet">
          <header class="history-head">
            <div>
              <p class="history-title">历史草案</p>
              <p class="history-subtitle">最近 10 条保存的 AI 方案</p>
            </div>
            <button type="button" class="history-close" @click="toggleHistory">关闭</button>
          </header>
          <div v-if="!historyEntries.length" class="history-empty">まだ保存された履歴がありません</div>
          <div v-else class="history-list">
            <article
              v-for="entry in historyEntries"
              :key="entry.id"
              :class="['history-item', historyPreview?.id === entry.id ? 'is-active' : '']"
              @click="previewHistoryEntry(entry)"
            >
              <div class="history-item-body">
                <h4>{{ entry.title || '無題の案' }}</h4>
                <p>{{ entry.summary }}</p>
              </div>
              <span class="history-item-time">
                {{ new Date(entry.createdAt).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
              </span>
            </article>
          </div>
          <div v-if="historyPreview" class="history-preview">
            <h4>{{ historyPreview.title || '無題の案' }}</h4>
            <p class="history-preview-summary">{{ historyPreview.summary || '暂无摘要' }}</p>
            <p class="history-preview-desc" v-if="historyPreview.description">{{ historyPreview.description }}</p>
            <p class="history-preview-note">载入将把该草案插入当前对话；送到表单则直接打开活动编辑页并填入 AI 提案。</p>
            <div class="history-preview-links">
              <button type="button" class="history-preview-link" @click="openPlanPreview(historyPreview.raw)">
                方案预览
              </button>
            </div>
            <div class="history-preview-actions">
              <button type="button" class="primary ghost" @click="restoreHistoryToChat(historyPreview)">
                载入到对话
              </button>
              <button type="button" class="primary gradient" @click="applyProposalToForm(historyPreview.raw)">
                送到表单
              </button>
            </div>
          </div>
        </section>
      </div>
      <div class="chat-log" ref="chatLogRef">
        <div
          v-for="msg in chatMessages"
          :key="msg.id"
          :class="['chat-bubble', msg.role === 'user' ? 'chat-bubble--user' : 'chat-bubble--assistant']"
        >
          <div v-if="msg.type === 'text'" class="chat-text-block">
            <p class="chat-text">{{ msg.content }}</p>
            <button
              v-if="msg.action === 'direct-form'"
              type="button"
              class="chat-inline-link"
              @click="goToForm(false)"
            >
              直接配置表单
            </button>
            <div v-if="msg.options?.length" class="chat-options">
              <p class="chat-options-title">当前需要回答的核心问题</p>
              <p class="chat-options-question">{{ msg.options[0] }}</p>
              <p v-if="msg.options.length > 1" class="chat-options-note">
                还有其他问题，将在你回答完这一条后继续提出。
              </p>
            </div>
            <div v-if="msg.thinkingSteps?.length" class="thinking-collapsible">
              <button type="button" class="thinking-toggle" @click="toggleThinking(msg.id)">
                <span>AI 思考过程</span>
                <span class="thinking-toggle__action">{{ expandedThinkingId === msg.id ? '收起' : '展开' }}</span>
              </button>
              <div v-show="expandedThinkingId === msg.id" class="thinking-inline">
                <p class="thinking-inline-title">AI 思考过程</p>
                <ol>
                  <li v-for="(step, idx) in msg.thinkingSteps" :key="`${msg.id}-thinking-${idx}`">
                    <span class="thinking-inline-index">{{ idx + 1 }}</span>
                    <span class="thinking-inline-text">{{ step }}</span>
                  </li>
                </ol>
              </div>
            </div>
            <div v-if="msg.coachPrompts?.length" class="coach-prompts">
              <p class="coach-prompts-title">下一步灵感（Coach）</p>
              <ol>
                <li v-for="(prompt, idx) in msg.coachPrompts" :key="`${msg.id}-coach-${idx}`">
                  {{ prompt }}
                </li>
              </ol>
            </div>
            <div v-if="msg.editorChecklist?.length" class="editor-checklist">
              <p class="editor-checklist-title">需要补充/确认（Editor）</p>
              <ul>
                <li v-for="(item, idx) in msg.editorChecklist" :key="`${msg.id}-editor-${idx}`">
                  <label>
                    <input type="checkbox" disabled />
                    <span>{{ item }}</span>
                  </label>
                </li>
              </ul>
            </div>
            <div v-if="msg.writerSummary" class="writer-summary">
              <p class="writer-summary-title">草稿摘要（Writer）</p>
              <div class="writer-summary-grid">
                <p v-if="msg.writerSummary.headline"><strong>标题</strong>{{ msg.writerSummary.headline }}</p>
                <p v-if="msg.writerSummary.audience"><strong>受众</strong>{{ msg.writerSummary.audience }}</p>
                <p v-if="msg.writerSummary.logistics"><strong>细节</strong>{{ msg.writerSummary.logistics }}</p>
                <p v-if="msg.writerSummary.riskNotes"><strong>风险</strong>{{ msg.writerSummary.riskNotes }}</p>
                <p v-if="msg.writerSummary.nextSteps"><strong>下一步</strong>{{ msg.writerSummary.nextSteps }}</p>
              </div>
              <div v-if="msg.confirmQuestions?.length" class="writer-confirm">
                <p class="writer-confirm-label">请确认：</p>
                <ul>
                  <li v-for="(question, idx) in msg.confirmQuestions" :key="`${msg.id}-confirm-${idx}`">
                    {{ question }}
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div
            v-else
            class="proposal-card"
            :class="{ 'proposal-card--clickable': Boolean(msg.payload?.raw) }"
            @click="msg.payload?.raw && openPlanPreview(msg.payload.raw)"
          >
            <p class="proposal-title">{{ msg.payload?.title }}</p>
            <p class="proposal-desc">{{ msg.payload?.description }}</p>
            <p class="proposal-hint" v-if="msg.payload?.raw">点击查看完整草案</p>
          </div>
          <span class="chat-meta">{{ msg.createdAt }}</span>
        </div>
      </div>
      <div v-if="aiLoading" class="thinking-banner">
        <span class="thinking-spinner"></span>
        <p>AI 正在思考...</p>
      </div>
      <div v-if="aiError" class="assistant-error">{{ aiError }}</div>
    </section>

    <section v-if="aiResult" class="final-plan-card">
      <header class="final-plan-header">
        <div>
          <p class="final-plan-label">AI 活动方案</p>
          <p class="final-plan-title">{{ finalPlanTitle }}</p>
        </div>
        <button type="button" class="plan-preview-link" @click="openPlanPreview(aiResult)">方案预览</button>
      </header>
      <div class="final-plan-section" v-if="extractText(aiResult.description)">
        <p class="final-plan-subtitle">活动亮点</p>
        <p class="final-plan-text">{{ extractText(aiResult.description) }}</p>
      </div>
      <div class="final-plan-grid">
        <article v-if="aiResult.notes && extractText(aiResult.notes)">
          <p class="final-plan-subtitle">备注/准备</p>
          <p class="final-plan-text">{{ extractText(aiResult.notes) }}</p>
        </article>
        <article v-if="aiResult.riskNotice && extractText(aiResult.riskNotice)">
          <p class="final-plan-subtitle">风险提示</p>
          <p class="final-plan-text">{{ extractText(aiResult.riskNotice) }}</p>
        </article>
      </div>
      <div class="final-plan-section" v-if="finalPlanLogistics.length">
        <p class="final-plan-subtitle">时间 & 地点</p>
        <ul class="final-plan-list">
          <li v-for="item in finalPlanLogistics" :key="`logistics-${item.label}`">
            <strong>{{ item.label }}：</strong>{{ item.value }}
          </li>
        </ul>
      </div>
      <div class="final-plan-section" v-if="finalPlanTickets.length">
        <p class="final-plan-subtitle">票务设置</p>
        <ul class="final-plan-ticket-list">
          <li v-for="(ticket, idx) in finalPlanTickets" :key="`ticket-${idx}`" class="final-plan-ticket">
            <span>{{ ticket.name }}</span>
            <span>{{ formatTicketPrice(ticket.price) }}</span>
          </li>
        </ul>
      </div>
      <div class="final-plan-section" v-if="finalPlanRequirements.length">
        <p class="final-plan-subtitle">参加要求</p>
        <ul class="final-plan-list">
          <li v-for="(req, idx) in finalPlanRequirements" :key="`req-${idx}`">
            {{ req.label }}{{ req.type === 'must' ? '（必需）' : '' }}
          </li>
        </ul>
      </div>
      <div class="final-plan-section" v-if="finalPlanFormFields.length">
        <p class="final-plan-subtitle">报名表字段</p>
        <ul class="final-plan-list">
          <li v-for="(field, idx) in finalPlanFormFields" :key="`form-${idx}`">
            {{ field.label }} · {{ field.type }}{{ field.required ? '（必填）' : '' }}
          </li>
        </ul>
      </div>
    </section>

    <div class="assistant-bottom">
      <div class="chat-input-row">
        <input
          ref="chatInputRef"
          v-model="chatDraft"
          class="chat-input"
          type="text"
          :placeholder="currentPrompt"
          @keyup.enter="handleSend('enter')"
        />
        <button class="chat-voice" type="button">
          <span class="chat-button-label">语音</span>
        </button>
        <button class="chat-send" type="button" @click="handleSend('button')" :disabled="!chatDraft.trim()">
          <span class="chat-button-label">发送</span>
        </button>
      </div>

      <section class="final-plan-actions" v-if="aiResult">
        <button class="primary gradient" type="button" :disabled="!communityId" @click="goToForm(true)">
          送到表单
        </button>
        <button class="primary" type="button" @click="saveProposalDraft(aiResult!)">保存草案</button>
      </section>
    </div>
  </div>
  <teleport to="body">
    <transition name="fade">
      <div v-if="planPreview" class="plan-preview-overlay" @click.self="closePlanPreview">
        <section class="plan-preview-panel">
          <header class="plan-preview-head">
            <div>
              <p class="plan-preview-label">AI 草案</p>
              <p class="plan-preview-title">{{ previewPlanTitle }}</p>
            </div>
            <button type="button" class="plan-preview-close" @click="closePlanPreview">
              <span class="i-lucide-x"></span>
            </button>
          </header>
          <div class="plan-preview-scroll">
            <article class="plan-preview-section" v-if="previewPlanDescription">
              <p class="plan-preview-subtitle">活动亮点</p>
              <p class="plan-preview-text">{{ previewPlanDescription }}</p>
            </article>
            <div class="plan-preview-grid">
              <article v-if="previewPlanNotes">
                <p class="plan-preview-subtitle">备注/准备</p>
                <p class="plan-preview-text">{{ previewPlanNotes }}</p>
              </article>
              <article v-if="previewPlanRisk">
                <p class="plan-preview-subtitle">风险提示</p>
                <p class="plan-preview-text">{{ previewPlanRisk }}</p>
              </article>
            </div>
            <article class="plan-preview-section" v-if="previewPlanLogistics.length">
              <p class="plan-preview-subtitle">时间 & 地点</p>
              <ul class="plan-preview-list">
                <li v-for="item in previewPlanLogistics" :key="`preview-logistics-${item.label}`">
                  <strong>{{ item.label }}：</strong>{{ item.value }}
                </li>
              </ul>
            </article>
            <article class="plan-preview-section" v-if="previewPlanTickets.length">
              <p class="plan-preview-subtitle">票务设置</p>
              <ul class="plan-preview-ticket-list">
                <li v-for="(ticket, idx) in previewPlanTickets" :key="`preview-ticket-${idx}`">
                  <span>{{ ticket.name }}</span>
                  <span>{{ formatTicketPrice(ticket.price) }}</span>
                </li>
              </ul>
            </article>
            <article class="plan-preview-section" v-if="previewPlanRequirements.length">
              <p class="plan-preview-subtitle">参加要求</p>
              <ul class="plan-preview-list">
                <li v-for="(req, idx) in previewPlanRequirements" :key="`preview-req-${idx}`">
                  {{ req.label }}{{ req.type === 'must' ? '（必需）' : '' }}
                </li>
              </ul>
            </article>
            <article class="plan-preview-section" v-if="previewPlanFormFields.length">
              <p class="plan-preview-subtitle">报名表字段</p>
              <ul class="plan-preview-list">
                <li v-for="(field, idx) in previewPlanFormFields" :key="`preview-form-${idx}`">
                  {{ field.label }} · {{ field.type }}{{ field.required ? '（必填）' : '' }}
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

type ChatRole = 'user' | 'assistant';
type ChatMessageType = 'text' | 'proposal';
interface ChatMessage {
  id: string;
  role: ChatRole;
  type: ChatMessageType;
  content: string;
  createdAt: string;
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
const activeCommunityDetail = ref<ConsoleCommunityDetail | null>(null);
const introConversationStarted = ref(false);

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
const historyPreview = ref<AssistantHistoryEntry | null>(null);
const showHistory = ref(false);
const showGuide = ref(true);
const expandedThinkingId = ref<string | null>(null);
const lastAssistantStatus = ref<EventAssistantStatus>('collecting');
const lastPromptVersion = ref('coach-v2');
const currentStage = ref<EventAssistantStage>('coach');
const pendingQuestion = ref<string | null>(null);
const stageLabels: Record<EventAssistantStage, string> = {
  coach: '模式：Coach（点火）',
  editor: '模式：Editor（打灯）',
  writer: '模式：Writer（草稿确认）',
};
const lastTurnCount = ref(0);
const lastLanguage = ref('ja');
const assistantStatusText = computed(() => {
  switch (lastAssistantStatus.value) {
    case 'ready':
      return '方案已生成';
    case 'options':
      return '候选提案';
    default:
      return '信息收集中';
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
    entries.push({ label: '开始时间', value: formatDateTime(logistics.startTime) });
  }
  if (logistics.endTime) {
    entries.push({ label: '结束时间', value: formatDateTime(logistics.endTime) });
  }
  if (logistics.locationText) {
    entries.push({ label: '地点', value: logistics.locationText });
  }
  if (logistics.locationNote) {
    entries.push({ label: '地点备注', value: logistics.locationNote });
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
  if (price == null) return '免费';
  return `¥${price.toLocaleString('ja-JP')}`;
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
const shouldShowGuide = computed(() => showGuide.value);

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
  () => {
    introConversationStarted.value = false;
    loadActiveCommunityDetail();
  },
);

watch(
  () => chatMessages.value.length,
  (len, prev) => {
    if (prev === 0 && len > 0) {
      showGuide.value = false;
    }
  },
);

watch(
  () => showHistory.value,
  (visible) => {
    if (visible) {
      historyPreview.value = historyEntries.value[0] ?? null;
    } else {
      historyPreview.value = null;
    }
  },
);

const scrollChatToBottom = () => {
  nextTick(() => {
    const container = chatLogRef.value;
    if (container) {
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
) => {
  chatMessages.value.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
  });
  if (chatMessages.value.length > 200) {
    chatMessages.value.shift();
  }
  scrollChatToBottom();
};

const loadActiveCommunityDetail = async () => {
  if (!communityId.value) {
    activeCommunityDetail.value = null;
    introConversationStarted.value = false;
    await startIntroConversation();
    return;
  }
  try {
    activeCommunityDetail.value = await fetchConsoleCommunity(communityId.value);
  } catch (error) {
    console.warn('Failed to load community detail', error);
    activeCommunityDetail.value = null;
  } finally {
    introConversationStarted.value = false;
    await startIntroConversation();
  }
};

const startIntroConversation = async () => {
  if (introConversationStarted.value) return;
  introConversationStarted.value = true;
  const community = activeCommunityDetail.value;
  const aboutText = community?.description ? getLocalizedText(community.description) : '';
  const communityName = community?.name ?? 'Tokyo Community Organizations Meetup Group';
  const introPrompt = aboutText
    ? `コミュニティ紹介：${communityName}\n${aboutText}\n\n上記の背景を踏まえて、主催者が最初のアイデアを話しやすいようCoachモードで歓迎し、最初の質問を投げかけてください。`
    : 'コミュニティ紹介情報はありません。主催者を歓迎し、最初のアイデアを引き出す質問から始めてください。';
  await requestAssistantReply(introPrompt, {
    overrideSummary: `コミュニティ紹介: ${communityName}`,
  });
};

const handleSend = async (source: 'button' | 'enter' = 'button') => {
  if (!chatDraft.value.trim() || aiLoading.value) return;
  const content = chatDraft.value.trim();
  chatDraft.value = '';
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
  pushMessage(
    'assistant',
    'text',
    result.message,
    undefined,
    undefined,
    result.options,
    steps,
    result.coachPrompts,
    result.editorChecklist,
    stageIsWriter ? result.writerSummary : undefined,
    result.confirmQuestions,
  );
    pendingQuestion.value = result.options?.[0] ?? null;
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
    await saveEventAssistantLog(communityId.value, {
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
    });
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
  showHistory.value = false;
  historyPreview.value = null;
};

const previewHistoryEntry = (entry: AssistantHistoryEntry) => {
  historyPreview.value = entry;
};

const restoreHistoryToChat = (entry: AssistantHistoryEntry | null) => {
  if (!entry) return;
  aiResult.value = { ...entry.raw, summary: entry.summary };
  pushMessage('assistant', 'proposal', '', {
    title: entry.title,
    description: entry.description,
    raw: aiResult.value,
  });
  showHistory.value = false;
  historyPreview.value = null;
  scrollChatToBottom();
};

const toggleHistory = () => {
  showHistory.value = !showHistory.value;
  if (!showHistory.value) {
    historyPreview.value = null;
  }
};

const toggleGuide = () => {
  showGuide.value = !showGuide.value;
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
  return chatMessages.value.slice(-10).map((msg) => ({
    role: msg.role,
    content:
      msg.type === 'text'
        ? msg.content
        : `提案: ${msg.payload?.title ?? ''} ${msg.payload?.description ?? ''}`,
  }));
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

const goToForm = (useAi: boolean) => {
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
  window.alert('AI案をフォームに送信します。次の画面で各項目を確認してください。');
  router.push({
    name: 'ConsoleMobileEventForm',
    params: { communityId: communityId.value },
    query: { source: 'ai-assistant' },
  });
};

onMounted(async () => {
  await loadProfileDefaults();
  await communityStore.loadCommunities();
  if (communityId.value) {
    communityStore.setActiveCommunity(communityId.value);
  }
  loadHistoryEntries();
  await loadActiveCommunityDetail();

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
});
</script>

<style scoped>
.assistant-screen {
  position: fixed;
  inset: 0;
  height: 100vh;
  display: grid;
  grid-template-rows: 1fr auto;
  color: #0f172a;
  background: var(--m-color-bg, #f8fafc);
  --keyboard-offset: 0px;
  overflow-x: hidden;
}

@supports (height: 100dvh) {
  .assistant-screen {
    height: 100dvh;
    min-height: 100dvh;
  }
}

.assistant-chat-surface {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 12px 8px;
  overflow: hidden;
  touch-action: pan-y;
  box-sizing: border-box;
  max-width: 100vw;
}

.chat-tools {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
}

.prompt-chip {
  font-size: 11px;
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.15);
  border-radius: 999px;
  padding: 4px 10px;
}

.status-chip {
  font-size: 12px;
  color: #0f172a;
  background: rgba(14, 165, 233, 0.15);
  border-radius: 999px;
  padding: 4px 10px;
  font-weight: 600;
}

.mode-chip {
  font-size: 11px;
  color: #0f172a;
  background: rgba(226, 232, 240, 0.6);
  border-radius: 999px;
  padding: 4px 10px;
}

.history-toggle {
  border: 1px solid #e2e8f0;
  border-radius: var(--app-border-radius);
  background: rgba(255, 255, 255, 0.9);
  color: #0f172a;
  font-size: 12px;
  padding: 6px 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.history-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.65);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 0 calc(env(safe-area-inset-bottom, 0px) + 16px);
  z-index: 40;
}

.history-sheet {
  width: min(640px, 100%);
  border-radius: 28px 28px 0 0;
  background: #fff;
  box-shadow: 0 -20px 50px rgba(2, 6, 23, 0.35);
  padding: 18px 20px calc(env(safe-area-inset-bottom, 0px) + 18px);
  max-height: calc(80vh);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.history-head p {
  margin: 0;
  font-weight: 600;
  color: #0f172a;
}
.history-title {
  font-size: 16px;
}
.history-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: #94a3b8;
}
.history-close {
  border: none;
  background: transparent;
  color: #0ea5e9;
  font-size: 12px;
}

.history-empty {
  font-size: 12px;
  color: #94a3b8;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-item {
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 12px 14px;
  background: #f9fafb;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
}
.history-item.is-active {
  border-color: #0ea5e9;
  background: rgba(14, 165, 233, 0.08);
}
.history-item h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}
.history-item p {
  margin: 0 0 6px;
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
}
.history-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #94a3b8;
  gap: 8px;
}
.history-actions {
  display: flex;
  gap: 6px;
}
.history-item-time {
  font-size: 11px;
  color: #94a3b8;
}

.history-preview {
  margin-top: 6px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(248, 250, 252, 0.9);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-preview-summary {
  margin: 0;
  font-size: 14px;
  color: #475569;
  line-height: 1.5;
}

.history-preview-desc {
  margin: 0;
  font-size: 14px;
  color: #1f2937;
  line-height: 1.6;
}

.history-preview-note {
  margin: 6px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.history-preview-links {
  display: flex;
  justify-content: flex-end;
}

.history-preview-link {
  border: none;
  background: rgba(15, 23, 42, 0.06);
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 999px;
}

.history-preview-link:active {
  opacity: 0.7;
}

.history-preview-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.history-preview-actions .primary {
  flex: 1;
  justify-content: center;
}

.chat-log {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 0 4px 8px;
  align-items: stretch;
  overflow-x: hidden;
}

.chat-bubble {
  width: 100%;
  font-size: 16px;
  line-height: 1.7;
  color: #0f172a;
  padding: 0;
  border: none;
}
.chat-bubble--assistant {
  align-self: stretch;
  text-align: left;
}
.chat-bubble--user {
  align-self: stretch;
  font-weight: 600;
  text-align: right;
}

.chat-text-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  width: 100%;
}

.chat-text {
  margin: 0;
  white-space: pre-line;
  width: 100%;
  word-break: break-word;
}
.chat-bubble--user .chat-text-block {
  align-items: flex-end;
  text-align: right;
}

.chat-inline-link {
  border: none;
  background: transparent;
  color: #0ea5e9;
  font-size: 12px;
  font-weight: 600;
  text-decoration: underline;
  padding: 0;
}
.chat-inline-link:disabled {
  opacity: 0.5;
}

.chat-options {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  margin-top: 10px;
  border-radius: 16px;
  background: rgba(224, 231, 255, 0.85);
  border: 1px solid rgba(99, 102, 241, 0.25);
  padding: 12px 14px;
}

.chat-options-title {
  margin: 0 0 8px;
  font-size: 14px;
  color: #4338ca;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.chat-options-question {
  margin: 0;
  font-size: 15px;
  color: #1e1b4b;
  font-weight: 600;
  line-height: 1.6;
}

.chat-options-note {
  margin: 10px 0 0;
  font-size: 13px;
  color: #57534e;
}

.final-plan-card {
  margin: 12px 16px 0;
  padding: 16px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(148, 163, 184, 0.15);
  max-height: 320px;
  overflow-y: auto;
  box-sizing: border-box;
  max-width: calc(100vw - 32px);
}

.final-plan-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.final-plan-label {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.2em;
  color: #64748b;
}

.final-plan-title {
  margin: 4px 0 10px;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.final-plan-section {
  margin-bottom: 12px;
}

.final-plan-subtitle {
  margin: 0 0 4px;
  font-size: 12px;
  color: #475569;
  font-weight: 600;
}

.final-plan-text {
  margin: 0;
  font-size: 13px;
  color: #0f172a;
  line-height: 1.5;
}

.final-plan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.final-plan-grid article {
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.8);
  border: 1px solid rgba(203, 213, 225, 0.6);
}

.final-plan-list {
  margin: 0;
  padding-left: 16px;
  font-size: 13px;
  color: #0f172a;
}
.final-plan-list li {
  margin: 4px 0;
}
.final-plan-list strong {
  font-weight: 600;
}

.final-plan-ticket-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.final-plan-ticket {
  display: flex;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.04);
  font-size: 13px;
}

.plan-preview-link {
  border: none;
  background: rgba(15, 23, 42, 0.07);
  color: #0f172a;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 999px;
}

.plan-preview-link:active {
  opacity: 0.7;
}

.plan-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.65);
  backdrop-filter: blur(12px);
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
  border-radius: 28px;
  padding: 24px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.35);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.plan-preview-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.plan-preview-label {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.2em;
  color: #94a3b8;
  text-transform: uppercase;
}

.plan-preview-title {
  margin: 4px 0 0;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.3;
}

.plan-preview-close {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: transparent;
  color: #0f172a;
  font-size: 1.1rem;
}

.plan-preview-scroll {
  overflow-y: auto;
  padding-right: 4px;
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.thinking-inline {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  align-self: stretch;
  margin-top: 10px;
  border-radius: 16px;
  background: rgba(244, 247, 255, 0.92);
  padding: 12px 14px;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.thinking-inline-title {
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: #475569;
  text-transform: uppercase;
}

.thinking-inline ol {
  margin: 0;
  padding-left: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.thinking-inline li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #0f172a;
}

.thinking-inline-index {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.12);
  font-size: 10px;
  font-weight: 700;
  color: #2563eb;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.thinking-inline-text {
  flex: 1;
  line-height: 1.55;
  font-size: 13px;
  word-break: break-word;
}

.thinking-collapsible {
  width: 100%;
}

.thinking-toggle {
  width: 100%;
  padding: 10px 14px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(226, 232, 240, 0.4);
  color: #0f172a;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.thinking-toggle__action {
  font-size: 12px;
  color: #2563eb;
}

.coach-prompts {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  align-self: stretch;
  margin-top: 10px;
  border-radius: 16px;
  padding: 12px 14px;
  background: rgba(219, 234, 254, 0.9);
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.coach-prompts-title {
  margin: 0 0 6px;
  font-size: 14px;
  color: #1d4ed8;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.coach-prompts ol {
  margin: 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #1e3a8a;
  font-size: 14px;
  line-height: 1.55;
}

.editor-checklist {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  margin-top: 10px;
  border-radius: 16px;
  padding: 12px 14px;
  background: rgba(240, 253, 250, 0.95);
  border: 1px dashed rgba(15, 118, 110, 0.5);
}

.editor-checklist-title {
  margin: 0 0 8px;
  font-size: 14px;
  color: #0f766e;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.editor-checklist ul {
  margin: 0;
  padding-left: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.editor-checklist li label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #0f766e;
}

.editor-checklist input {
  width: 16px;
  height: 16px;
}

.writer-summary {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  margin-top: 12px;
  border-radius: 18px;
  padding: 16px 18px;
  background: rgba(255, 247, 237, 0.95);
  border: 1px solid rgba(251, 191, 36, 0.45);
  align-self: stretch;
}

.writer-summary-title {
  margin: 0 0 12px;
  font-size: 15px;
  color: #a16207;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.writer-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
  font-size: 15px;
  line-height: 1.65;
}

.writer-summary-grid p {
  margin: 0;
  color: #7c2d12;
}

.writer-summary-grid strong {
  display: block;
  font-size: 13px;
  text-transform: uppercase;
  color: #b45309;
}

.writer-confirm {
  margin-top: 10px;
  border-top: 1px solid rgba(251, 191, 36, 0.4);
  padding-top: 8px;
}

.writer-confirm-label {
  margin: 0 0 4px;
  font-size: 12px;
  color: #92400e;
}

.writer-confirm ul {
  margin: 0;
  padding-left: 1.1rem;
  color: #7c2d12;
  font-size: 13px;
}

.chat-meta {
  display: block;
  font-size: 11px;
  margin-top: 4px;
  color: #94a3b8;
}

.chat-typing {
  font-size: 12px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
}

.typing-dots {
  display: inline-flex;
  gap: 4px;
}

.typing-dots span {
  width: 6px;
  height: 6px;
  border-radius: 10px;
  background: #94a3b8;
  animation: dotPulse 1s infinite ease-in-out;
}

.typing-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dotPulse {
  0% {
    opacity: 0.2;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-2px);
  }
  100% {
    opacity: 0.2;
    transform: translateY(0);
  }
}

.proposal-card {
  background: rgba(226, 232, 240, 0.55);
  border-radius: 12px;
  padding: 12px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  transition: background 0.2s ease;
}
.proposal-card--clickable {
  cursor: pointer;
}
.proposal-card--clickable:active {
  background: rgba(148, 163, 184, 0.25);
}
.proposal-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}
.proposal-desc {
  margin: 0;
  font-size: 13px;
  color: #1f2937;
  white-space: pre-line;
}
.proposal-hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: #475569;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.assistant-bottom {
  padding: 8px 12px calc(env(safe-area-inset-bottom, 0px) + 12px);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.8), rgba(255, 255, 255, 1));
  box-shadow: 0 -12px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 10px;
  transform: translateY(calc(var(--keyboard-offset, 0px) * -1));
  transition: transform 0.2s ease;
}

.chat-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #dbeafe;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.1);
}

.chat-input {
  flex: 1;
  border: none;
  background: transparent;
  color: #0f172a;
  font-size: 14px;
  padding: 0;
}
.chat-input::placeholder {
  color: #94a3b8;
}
.chat-input:focus {
  outline: none;
}

.chat-voice,
.chat-send {
  width: 42px;
  height: 42px;
  border: none;
  border-radius: var(--app-border-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}

.chat-voice {
  background: linear-gradient(135deg, #0090d9, #22bbaa, #e4c250);
  color: #fff;
  border: none;
}

.chat-send {
  background: linear-gradient(135deg, #0090d9, #22bbaa, #e4c250);
  color: #fff;
}
.chat-send:disabled {
  opacity: 0.4;
}

.chat-button-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.assistant-guide {
  margin: 12px 16px 0;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
}

.guide-title {
  margin: 0 0 6px;
  font-size: 12px;
  color: #475569;
  letter-spacing: 0.1em;
}

.assistant-guide ol {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: #1e293b;
}

.assistant-guide li {
  margin: 4px 0;
}

.assistant-guide strong {
  color: #2563eb;
}

.guide-dismiss {
  margin-top: 8px;
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #2563eb;
  background: rgba(37, 99, 235, 0.12);
  align-self: flex-start;
}

.guide-inline-toggle {
  margin: 8px 16px 0;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px dashed rgba(37, 99, 235, 0.4);
  background: rgba(15, 23, 42, 0.02);
  color: #2563eb;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
}

.assistant-error {
  font-size: 12px;
  color: #f87171;
  text-align: center;
}

.thinking-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  font-size: 12px;
  color: #475569;
}

.thinking-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(71, 85, 105, 0.3);
  border-top-color: #475569;
  border-radius: 10px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.primary {
  border-radius: var(--app-border-radius);
  padding: 15px;
  font-size: 16px;
  font-weight: 600;
  background: #ffffff;
  color: #0f172a;
  border: 1px solid #dbe4f5;
}
.primary.gradient {
  background: linear-gradient(135deg, #0090d9, #22bbaa, #e4c250);
  color: #fff;
  border: none;
}
.primary.ghost {
  background: rgba(15, 23, 42, 0.05);
  border: 1px dashed #cbd5f5;
  color: #0f172a;
}
.primary:disabled {
  opacity: 0.4;
}

.final-plan-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 12px 16px 24px;
}
</style>
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
