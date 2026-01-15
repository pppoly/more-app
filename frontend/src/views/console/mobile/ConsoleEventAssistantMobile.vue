<template>
  <div class="assistant-shell" :style="screenStyle">
    <div class="assistant-topbar-wrap">
      <ConsoleTopBar
        v-if="!isLiffClientMode"
        class="assistant-topbar"
        title="イベントアシスタント"
        :sticky="true"
        @back="goBack"
      />
      <div class="top-actions" v-if="communityId">
        <button
          type="button"
          class="new-session-btn"
          :disabled="isEmptyConversation"
          :class="{ 'is-disabled': isEmptyConversation }"
          @click="startNewConversation"
          aria-label="新しい相談"
          title="新しい相談"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 5v14" stroke-linecap="round" />
            <path d="M5 12h14" stroke-linecap="round" />
          </svg>
          <span class="sr-only">新しい相談</span>
        </button>
        <button
          type="button"
          class="history-btn"
          @click="goHistory"
          aria-label="履歴"
          title="履歴"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6">
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
        <div v-if="isEmptyConversation" class="intro-card" @click="introExpanded = !introExpanded">
          <div class="intro-header">
            <div class="intro-copy">
              <p class="intro-title">イベント作成アシスタント</p>
              <p class="intro-positioning">これは「イベント情報を整理して下書きを作るツール」です</p>
              <p class="intro-action">まずは、イベント内容を一文で入力してください</p>
              <p class="intro-action-sub">足りない情報は、あとでこちらから確認します</p>
              <button
                type="button"
                class="intro-main-example"
                @click.stop="handleChipSelect(introMainExample)"
                aria-label="例を入力する"
              >
                {{ introMainExample }}
              </button>
            </div>
          </div>
          <div class="intro-expander" @click.stop="introExpanded = !introExpanded" aria-hidden="true">
            <span class="intro-expander-line"></span>
            <span class="intro-expander-text">{{ introExpanded ? '閉じる' : 'もっと見る' }}</span>
            <svg
              class="intro-expander-icon"
              :class="{ 'is-open': introExpanded }"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </div>
          <transition name="fade">
            <div v-if="introExpanded" class="intro-expanded">
              <p class="intro-template">日時 ／ 場所 ／ 内容 ／ 参加費</p>
              <p class="intro-unknown">※ 未定の項目は「未定」と書いてOKです</p>
              <button
                type="button"
                class="intro-details-toggle"
                @click="introDetailsExpanded = !introDetailsExpanded"
              >
                できること・できないことを見る
              </button>
              <div v-if="introDetailsExpanded" class="intro-details">
                <p class="intro-section-title">できること</p>
                <ul class="intro-list">
                  <li>日時／場所／参加費などを整理して下書きを作成</li>
                  <li>足りない情報は質問して確認</li>
                  <li>日本語/英語/中文でもOK（入力は自由）</li>
                </ul>
                <p class="intro-section-title">できないこと</p>
                <ul class="intro-list intro-list--muted">
                  <li>この画面だけで公開・開催はできません</li>
                  <li>雑談や何でも相談のAIではありません</li>
                </ul>
              </div>
            </div>
          </transition>
        </div>
        <template v-for="msg in chatMessages" :key="msg.id">
          <template v-if="shouldRenderMessage(msg)">
            <div
              :id="`msg-${msg.id}`"
              :class="[
                'chat-bubble',
                msg.role === 'user' ? 'chat-bubble--user' : 'chat-bubble--assistant',
                msg.role === 'assistant' && msg.id === currentQuestionId ? 'is-current-question' : '',
                msg.role === 'assistant' && msg.id !== currentQuestionId ? 'is-previous' : '',
              ]"
            >
              <div v-if="msg.type === 'text'" class="chat-stack">
                <p class="chat-text">{{ getMessageDisplayText(msg) }}</p>
              <div v-if="getQuestionHelper(msg)" class="question-helper">
                <p class="question-helper-title">{{ getQuestionHelper(msg)?.title }}</p>
                <ul class="question-helper-list">
                  <li v-for="(line, idx) in getQuestionHelper(msg)?.lines" :key="`helper-${msg.id}-${idx}`">
                    {{ line }}
                  </li>
                </ul>
                <p v-if="getQuestionHelper(msg)?.foot" class="question-helper-foot">
                  {{ getQuestionHelper(msg)?.foot }}
                </p>
                <button
                  v-if="currentSlotKey === 'title'"
                  type="button"
                  class="question-helper-action"
                  @click="handleChipSelect('未定')"
                >
                  未定にする
                </button>
              </div>
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
                      @click="handleOptionSelect(option, msg.action)"
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
              </div>
              <div
                v-else-if="msg.type === 'proposal' && (canShowProposalUi || msg.action === 'draft-anchor')"
                class="proposal-bubble"
              >
                <div class="proposal-head">
                  <p class="proposal-title">{{ msg.payload?.title }}</p>
                  <p class="proposal-desc">AI がまとめた下書きです。プレビューで全体を確認できます。</p>
                </div>
                <div class="proposal-actions" v-if="msg.payload?.raw">
                  <button type="button" class="ghost-link" @click.stop="openPlanPreview(msg.payload?.raw)">
                    下書きプレビュー
                  </button>
                  <button type="button" class="ghost-link" @click.stop="applyProposalToForm(msg.payload?.raw)">
                    フォームで編集
                  </button>
                </div>
              </div>
              <span class="chat-meta">{{ msg.createdAt }}</span>
            </div>
          </template>
        </template>

        <div
          v-if="mode === 'chat' && !explainMode && (choiceQuestionState || readyMenuFallback)"
          class="decision-block"
        >
          <p v-if="(choiceQuestionState || readyMenuFallback)?.prompt" class="decision-title">
            {{ (choiceQuestionState || readyMenuFallback)?.prompt }}
          </p>
          <p v-if="coachPromptState" class="coach-prompt">{{ coachPromptState }}</p>
          <div class="decision-chips">
            <button
              v-for="(opt, idx) in (choiceQuestionState || readyMenuFallback)?.options || []"
              :key="`choice-${idx}`"
              type="button"
              class="chip"
              :class="{ 'chip--recommended': opt.recommended }"
              @click="handleChoiceSelect((choiceQuestionState || readyMenuFallback)!.key, opt.value)"
            >
              {{ getCandidateChipLabel(opt) }}
            </button>
          </div>
          <template v-if="isCompareModeUi">
            <button type="button" class="decision-toggle" @click="showCandidateDetails = !showCandidateDetails">
              {{ showCandidateDetails ? '候補の詳細を閉じる' : '候補の詳細を見る' }}
            </button>
            <div v-if="showCandidateDetails" class="candidate-details">
              <div
                v-for="(opt, idx) in choiceQuestionState.options"
                :key="`detail-${idx}`"
                class="candidate-detail-card"
              >
                <div class="candidate-head">
                  <span class="candidate-tag">{{ getCandidateTag(opt) }}</span>
                  <span class="candidate-title">{{ getCandidateTitle(opt) }}</span>
                  <span v-if="opt.recommended" class="candidate-badge">近いかも</span>
                </div>
                <ul v-if="getCandidateMeta(opt).length" class="candidate-meta">
                  <li v-for="(line, mIdx) in getCandidateMeta(opt)" :key="`meta-${idx}-${mIdx}`">
                    {{ line }}
                  </li>
                </ul>
                <p v-else class="candidate-summary">{{ getCandidateTitle(opt) }}</p>
              </div>
            </div>
            <div class="decision-actions">
              <button type="button" class="decision-secondary" @click="handleSkipCompare">
                どちらでもないので続ける
              </button>
            </div>
          </template>
        </div>
        <div
          v-if="mode === 'chat' && !canShowProposalUi && !explainMode && !isCompareModeUi && shouldShowChoiceBlock"
          class="choice-block"
        >
          <p v-if="coachPromptState" class="coach-prompt">{{ coachPromptState }}</p>
          <p class="choice-helper">{{ choiceHelperText }}</p>
          <div class="choice-options">
            <button
              v-for="(opt, idx) in choiceQuestionState.options"
              :key="`choice-${idx}`"
              type="button"
              class="chip"
              :class="{ 'chip--recommended': opt.recommended }"
              @click="handleChoiceSelect(choiceQuestionState.key, opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div v-if="mode === 'chat' && explainMode" class="explain-actions">
          <button type="button" class="explain-button primary" @click="handleExplainContinue">
            {{ explainLabels.continue }}
          </button>
          <button type="button" class="explain-button" @click="handleExplainBack">
            {{ explainLabels.back }}
          </button>
        </div>
        <div v-if="mode === 'chat' && shouldShowCommitCheckpoint" class="commit-block">
          <div v-if="readyDraftSummary.length" class="draft-summary">
            <p class="draft-summary-title">下書き（草案）</p>
            <ul class="draft-summary-list">
              <li v-for="item in readyDraftSummary" :key="item.label">
                <strong>{{ item.label }}</strong>
                <span>{{ item.value }}</span>
              </li>
            </ul>
            <details v-if="readyDraftExpertComment" class="draft-expert">
              <summary>🤖 AIからのコメント（参考・公開されません）</summary>
              <p>{{ readyDraftExpertComment }}</p>
            </details>
          </div>
          <p class="commit-helper">内容を確認したら、公開前の確認に進めます。</p>
          <p class="commit-title">この内容で進めるか、もう少し調整するかを選んでください。</p>
          <button type="button" class="commit-preview" @click="openMilestonePreview">
            下書きをプレビュー
          </button>
          <p class="commit-note">
            ※ 次の画面でカバー画像の設定と公開内容の最終確認を行います。公開はまだ行われません。
          </p>
          <div class="commit-actions">
            <button type="button" class="commit-primary" @click="handleCommitDraft">
              公開前の最終確認へ進む
            </button>
            <button type="button" class="commit-secondary" @click="handleCommitEdit">
              もう少し直す
            </button>
          </div>
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

    <footer class="input-bar" v-if="!planPreview">
      <div v-if="showEntryBar" class="entry-bar">
        <button type="button" class="entry-button" @click="openMilestonePreview">
          イベント案を開く
        </button>
      </div>
      <div class="input-shell">
        <textarea
          ref="chatInputRef"
          v-model="chatDraft"
          class="chat-input"
          :placeholder="currentPrompt"
          rows="1"
          @input="resizeChatInput"
          @keydown.enter.exact.prevent="insertLineBreak"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
        ></textarea>
        <button class="chat-send" type="button" @click="handleSend('button')" :disabled="!chatDraft.trim()">
          <svg class="chat-send-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M4 12l16-8-4.8 16-4.2-6.1L4 12z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linejoin="round"
            />
            <path d="M10.9 13.9L20 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </footer>
  </div>
  <teleport to="body">
    <transition name="fade">
      <div v-if="planPreview" class="plan-preview-overlay" @click.self="closePlanPreview">
        <section class="plan-preview-panel" role="dialog" aria-modal="true" aria-label="下書きプレビュー">
          <header class="plan-preview-head">
            <div>
              <p class="plan-preview-label">プレビュー（下書き・未公開）</p>
              <p class="plan-preview-title">{{ previewPlanTitle }}</p>
            </div>
            <button type="button" class="plan-preview-close" aria-label="閉じる" @click="closePlanPreview">
              <span class="plan-preview-close-icon" aria-hidden="true">×</span>
            </button>
          </header>
          <div class="plan-preview-scroll">
            <article v-if="previewExpertComment" class="plan-preview-section">
              <p class="plan-preview-subtitle">AIコメント（参考・フォームには反映されません）</p>
              <p class="plan-preview-text">{{ previewExpertComment }}</p>
            </article>
            <article class="plan-preview-section">
              <p class="plan-preview-subtitle">詳細</p>
              <p class="plan-preview-text">{{ previewPlanDescription }}</p>
            </article>
            <article class="plan-preview-section">
              <p class="plan-preview-subtitle">時間・場所</p>
              <ul class="plan-preview-list">
                <li v-for="item in previewPlanLogisticsDisplay" :key="`preview-logistics-${item.label}`">
                  <strong>{{ item.label }}：</strong>{{ item.value }}
                </li>
              </ul>
            </article>
            <article class="plan-preview-section">
              <p class="plan-preview-subtitle">参加費 / チケット</p>
              <ul class="plan-preview-ticket-list">
                <li v-if="!previewPlanTickets.length">参加費: {{ previewPriceText }}</li>
                <li v-for="(ticket, idx) in previewPlanTickets" :key="`preview-ticket-${idx}`">
                  <span>{{ ticket.name }}</span>
                  <span>{{ formatTicketPrice(ticket.price) }}</span>
                </li>
              </ul>
            </article>
            <div class="plan-preview-grid">
              <article>
                <p class="plan-preview-subtitle">定員</p>
                <p class="plan-preview-text">{{ previewCapacity }}</p>
              </article>
              <article>
                <p class="plan-preview-subtitle">備考 / 準備</p>
                <p class="plan-preview-text">{{ previewPlanNotesText }}</p>
              </article>
              <article>
                <p class="plan-preview-subtitle">リスク</p>
                <p class="plan-preview-text">{{ previewPlanRiskText }}</p>
              </article>
              <article>
                <p class="plan-preview-subtitle">申込方法</p>
                <p class="plan-preview-text">{{ previewRegistrationMethod }}</p>
              </article>
              <article>
                <p class="plan-preview-subtitle">キャンセル/返金</p>
                <p class="plan-preview-text">{{ previewCancellationPolicy }}</p>
              </article>
            </div>
            <article class="plan-preview-section">
              <p class="plan-preview-subtitle">参加要件</p>
              <ul class="plan-preview-list">
                <li v-if="!previewPlanRequirements.length">未設定</li>
                <li v-for="(req, idx) in previewPlanRequirements" :key="`preview-req-${idx}`">
                  {{ req.label }}{{ req.type === 'must' ? '（必須）' : '' }}
                </li>
              </ul>
            </article>
            <article class="plan-preview-section">
              <p class="plan-preview-subtitle">申込フォーム項目</p>
              <ul class="plan-preview-list">
                <li v-if="!previewPlanFormFields.length">未設定</li>
                <li v-for="(field, idx) in previewPlanFormFields" :key="`preview-form-${idx}`">
                  {{ field.label }} · {{ field.type }}{{ field.required ? '（必須）' : '' }}
                </li>
              </ul>
            </article>
          </div>
          <div class="plan-preview-actions">
            <button
              v-if="isCommitted"
              type="button"
              class="preview-primary"
              :disabled="!planPreview"
              @click="applyProposalToForm(planPreview)"
            >
              フォームへ進む
            </button>
            <button type="button" class="preview-ghost" @click="returnToChat">修正に戻る</button>
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
  requestEventAssistantReply,
  fetchEventAssistantLogs,
  fetchEventAssistantLog,
  saveEventAssistantLog,
  fetchConsoleCommunity,
} from '../../../api/client';
import type {
  EventAssistantProfileDefaults,
  EventAssistantRequest,
  EventAssistantReply,
  EventAssistantState,
  EventDraft,
  GeneratedEventContent,
  EventVisibility,
  ConsoleCommunityDetail,
  ConsoleEventAssistantLog,
} from '../../../types/api';
import { CONSOLE_AI_EVENT_DRAFT_KEY } from '../../../constants/console';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import { useToast } from '../../../composables/useToast';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';
import { isLiffClient } from '../../../utils/device';
import { isLineInAppBrowser } from '../../../utils/liff';
import { APP_TARGET } from '../../../config';
import { getAssistantDisplay } from '../../../utils/assistantDisplay';
import { evaluateDraftVisibility } from '../../../utils/draftAnchor';
import {
  buildAckText,
  computeShouldShowCommitCheckpoint,
  isCompareMode as computeIsCompareMode,
  resolveChoiceQuestionState,
  shouldAppendQuestionBubble,
} from '../../../utils/eventAssistantUiState';

type ChatRole = 'user' | 'assistant';
type ChatMessageType = 'text' | 'proposal';
interface ChatMessage {
  id: string;
  clientMessageId?: string;
  role: ChatRole;
  type: ChatMessageType;
  content: string;
  contentText?: string;
  contentJson?: Record<string, unknown> | null;
  createdAt: string;
  serverCreatedAt?: string;
  includeInContext?: boolean;
  action?: 'direct-form' | 'title-suggestion' | 'system-safe' | 'welcome' | 'draft-anchor';
  messageSource?: 'backend.ui' | 'backend.normalizer' | 'backend.interrupt' | 'frontend.machine' | 'frontend.explain';
  status?: 'pending' | 'sent' | 'failed';
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
    applyEnabled?: boolean;
    assistantReply?: Record<string, unknown> | null;
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
const DRAFT_CACHE_PREFIX = `${CONSOLE_AI_EVENT_DRAFT_KEY}:log:`;
const RESUME_WINDOW_HOURS = 24;

const route = useRoute();
const router = useRouter();
const communityStore = useConsoleCommunityStore();
const toast = useToast();
const isLiffClientMode = computed(() => APP_TARGET === 'liff' || isLineInAppBrowser() || isLiffClient());
const isDebugEnabled = computed(() => import.meta.env.DEV);
const isEventAssistantDebug = computed(() => {
  const flag = import.meta.env.VITE_EVENT_ASSISTANT_DEBUG;
  const windowFlag = (window as any)?.EVENT_ASSISTANT_DEBUG;
  return flag === '1' || windowFlag === '1';
});
const communityId = computed(() => route.params.communityId as string | undefined);
const forceNewSession = computed(() => route.query.newSession === '1');
const requestedLogId = computed(() => (route.query.logId as string | undefined) || null);
const activeCommunityDetail = ref<ConsoleCommunityDetail | null>(null);
const debugMessageCounts = ref<{
  total: number;
  user: number;
  assistant: number;
  source: 'server' | 'cache';
  bytes?: number;
} | null>(null);
const createSessionId = () => `ea-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const assistantSessionId = ref<string>(createSessionId());
const lastRequestId = ref<string | null>(null);

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
    prompt: 'どんなイベントを企画していますか？（例：映画鑑賞会、交流会など）',
  },
  {
    key: 'details',
    prompt: '場所・所要時間・持ち物など、補足したいことを自由にどうぞ。',
  },
];

const LEGACY_INTRO_MESSAGES = new Set([
  'おかえりなさい。どんなイベントを作りたいか教えてください。',
  'まず、どんなイベントを考えていますか？',
  'どんなイベントを考えていますか？',
  '日時はいつにしますか？',
]);

const buildSelectionAck = (
  nextKey: EventAssistantReply['nextQuestionKey'],
  hasChoice: boolean,
  isCompare: boolean,
) => {
  if (isCompare) return '受け取りました。次に進みますね。';
  if (hasChoice) return '受け取りました。次に進みますね。';
  if (nextKey) return '受け取りました。次に進みますね。';
  return '受け取りました。続けて入力してください。';
};

const chatMessages = ref<ChatMessage[]>([]);
const chatLogRef = ref<HTMLElement | null>(null);
const keyboardOffset = ref(0);
const autoScrollEnabled = ref(true);
const currentQuestionId = ref<string | null>(null);
const lastQuestionKey = ref<string | null>(null);
const lastQuestionKeyPending = ref(false);
const backTarget = ref<{ name: string; params?: Record<string, any> } | null>(null);
const lastShownDraftId = ref<string | null>(null);
const seenDraftIds = ref<string[]>([]);
const introExpanded = ref(false);
const isLoadingLog = ref(false);
const lastMilestoneMessageId = ref<string | null>(null);
const lastMilestoneDraftId = ref<string | null>(null);
const lastDraftReady = ref(false);
const lastDraftId = ref<string | null>(null);
const lastReadyDraft = ref<EventAssistantReply['publicActivityDraft'] | null>(null);
const lastNextQuestionKey = ref<string | null>(null);
const lastInputMode = ref<EventAssistantReply['inputMode'] | null>(null);
const mode = ref<'chat' | 'operate'>('chat');
const explainMode = ref(false);
const explainLanguage = ref<'ja' | 'zh' | 'en'>('ja');
const titleSeed = ref<string | null>(null);
const isCommitted = ref(false);
const introMainExample =
  '来週金曜の夕方にBBQをします。時間は15:00〜17:00、場所は三鷹、参加費は一人2000円です。';
const introTemplateLine = '日時 ／ 場所 ／ 内容 ／ 参加費';
const introDetailsExpanded = ref(false);
const isReadyState = computed(() => lastAssistantStatus.value === 'ready');
const isCompletedState = computed(() => lastAssistantStatus.value === 'completed');
const phaseTemplates: Record<'collecting' | 'decision' | 'compare' | 'ready' | 'operate', string[]> = {
  collecting: [
    '受け取りました。',
    '了解しました。',
    'ありがとうございます。',
  ],
  decision: [
    '了解しました。',
    '受け取りました。',
    'ありがとうございます。',
  ],
  compare: [
    'いったん整理します。',
    '近いものを選んでください。',
    '参考になる候補です。',
  ],
  ready: [
    'ここまでの内容を一度まとめました。まだ確定ではありません。',
    '内容を整理しました。進めるかどうかはこれから決められます。',
    'いったん形にしました。確定はまだです。',
  ],
  operate: ['作成しました。次の操作に進めます。', '反映しました。次に進めます。', '実行しました。次の手順へ進めます。'],
};
const canShowProposalUi = computed(
  () =>
    (isReadyState.value || isCompletedState.value) &&
    lastDraftReady.value &&
    (Boolean(aiResult.value) || Boolean(lastReadyDraft.value)),
);
const shouldShowCommitCheckpoint = computed(
  () =>
    !explainMode.value &&
    isReadyState.value &&
    computeShouldShowCommitCheckpoint({
      mode: mode.value,
      draftReady: lastDraftReady.value,
      nextQuestionKey: lastNextQuestionKey.value,
      isCommitted: isCommitted.value,
      hasChoiceQuestion: Boolean(choiceQuestionState.value),
      isCompareMode: isCompareModeUi.value,
    }),
);
const hasProposalMessage = computed(() => chatMessages.value.some((msg) => msg.type === 'proposal'));
const showEntryBar = computed(() => canShowProposalUi.value && !hasProposalMessage.value);
const isCompareModeUi = computed(() => computeIsCompareMode(lastInputMode.value, compareCandidatesState.value));
const selectionLabelMap: Record<string, string> = {
  details: '雰囲気/ルール',
  time: '日時',
  location: '場所',
  price: '料金',
  title: 'タイトル',
  capacity: '定員',
  visibility: '公開範囲',
  registrationForm: '申込フォーム',
  requireApproval: '参加承認',
  enableWaitlist: 'キャンセル待ち',
  requireCheckin: 'チェックイン',
  refundPolicy: '返金ポリシー',
  riskNotice: '注意事項',
  interrupt: '次の操作',
};
const confirmedAnswers = reactive<Record<string, string>>({});
const currentSlotKey = ref<string | null>(null);
const formatSelectionDisplay = (raw: string) => {
  const match = raw.match(/【選択】\s*([a-zA-Z_]+)\s*[:：]\s*(.+)/);
  if (!match) return '';
  const key = match[1];
  const value = match[2];
  if (key.startsWith('confirm_') && (value === 'yes' || value === 'no')) {
    return value === 'yes' ? '確認しました' : '修正します';
  }
  const normalizedKey = key.startsWith('confirm_') ? key.replace(/^confirm_/, '') : key;
  const candidateDisplay = getCandidateDisplayValue(value);
  if (candidateDisplay) return `「${candidateDisplay}」が近いと選びました`;
  if (/(?:候補|解釈)[A-Z]/i.test(value)) return '近い内容を選びました';
  const label = selectionLabelMap[normalizedKey] ?? '選択内容';
  return `${label}を「${value}」にしました`;
};

const normalizeSelectionTokenForAssistant = (text: string) => {
  if (!text || !text.includes('【選択】')) return text;
  const tokenRegex = /【選択】\s*([a-zA-Z_]+)\s*[:：]\s*([^\s]+)/g;
  const trimmed = text.trim();
  const replaced = text.replace(tokenRegex, (match, key, value) => {
    if (trimmed === match.trim()) return formatSelectionDisplay(match);
    if (key.startsWith('confirm_') && (value === 'yes' || value === 'no')) {
      return value === 'yes' ? '確認しました' : '修正します';
    }
    const candidateDisplay = getCandidateDisplayValue(value);
    const displayValue = candidateDisplay || value;
    return `「${displayValue}」`;
  });
  return replaced;
};
const buildChoiceDisplayText = (key: string, value: string, label?: string) => {
  if (key.startsWith('confirm_')) {
    return value === 'yes' ? '確認しました' : '修正します';
  }
  const candidateDisplay = getCandidateDisplayValue(value);
  if (candidateDisplay) return `「${candidateDisplay}」が近いと選びました`;
  if (/(?:候補|解釈)[A-Z]/i.test(value)) return '近い内容を選びました';
  const name = selectionLabelMap[key] ?? '選択内容';
  const displayValue = label?.replace(/^(候補|解釈)[A-Z]:?\s*/i, '') || value;
  return `${name}を「${displayValue}」にしました`;
};

const resolveChoiceValueFromInput = (
  choice: NonNullable<EventAssistantReply['choiceQuestion']>,
  input: string,
) => {
  const normalized = input.trim();
  if (!normalized) return null;
  if (choice.key.startsWith('confirm_')) {
    const normalizedLower = normalized.toLowerCase();
    if (normalized === 'はい' || normalized === '了解' || normalizedLower === 'yes') return 'yes';
    if (normalized === 'いいえ' || normalized === '修正' || normalizedLower === 'no') return 'no';
  }
  const options = choice.options ?? [];
  const directMatch = options.find((opt) => opt.value === normalized || opt.label === normalized);
  if (directMatch) return directMatch.value;
  const normalizedLower = normalized.toLowerCase();
  const fuzzyMatch = options.find(
    (opt) => opt.label?.toLowerCase() === normalizedLower || opt.value?.toLowerCase() === normalizedLower,
  );
  return fuzzyMatch ? fuzzyMatch.value : null;
};

const storeConfirmedAnswer = (key: string, value: string) => {
  const normalizedKey = key?.trim();
  const normalizedValue = value?.trim();
  if (!normalizedKey || !normalizedValue) return;
  if (normalizedKey.startsWith('confirm_')) return;
  confirmedAnswers[normalizedKey] = normalizedValue;
};

const buildSafeWriterSummary = () => {
  const summary: {
    headline?: string;
    logistics?: string;
    riskNotes?: string;
    nextSteps?: string;
  } = {};
  const draft = lastReadyDraft.value;
  const titleValue = draft?.title?.trim() || '';
  if (titleValue) summary.headline = titleValue;
  const logisticsParts = [draft?.schedule?.date, draft?.schedule?.location].filter(Boolean);
  if (logisticsParts.length) summary.logistics = logisticsParts.join(' / ');
  return summary;
};

const buildFallbackOverview = (answers: Record<string, string> | null) => {
  const parts: string[] = [];
  const titleValue = (answers?.title || qaState.topic || '').trim();
  const timeValue = (answers?.time || '').trim();
  const locationValue = (answers?.location || '').trim();
  if (titleValue) parts.push(`イベント: ${titleValue}`);
  if (timeValue) parts.push(`日時: ${timeValue}`);
  if (locationValue) parts.push(`場所: ${locationValue}`);
  return parts.join(' / ');
};

const pickPhaseMessage = (phase: 'collecting' | 'decision' | 'compare' | 'ready' | 'operate', seed?: number) => {
  const pool = phaseTemplates[phase];
  if (!pool.length) return '';
  const index = Math.abs((seed ?? 0) % pool.length);
  return pool[index];
};

const cacheDraftForLog = (logId: string | null | undefined, draft: GeneratedEventContent & { summary?: string }) => {
  if (!logId || !draft) return;
  try {
    localStorage.setItem(`${DRAFT_CACHE_PREFIX}${logId}`, JSON.stringify(draft));
  } catch {
    // ignore storage failure
  }
};

const getCachedDraftForLog = (logId: string | null | undefined) => {
  if (!logId) return null;
  try {
    const raw = localStorage.getItem(`${DRAFT_CACHE_PREFIX}${logId}`);
    if (!raw) return null;
    return JSON.parse(raw) as GeneratedEventContent & { summary?: string };
  } catch {
    return null;
  }
};

const upsertDraftAnchor = (draft: GeneratedEventContent & { summary?: string }, logId?: string | null) => {
  if (!draft) return;
  const existing = chatMessages.value.find(
    (msg) => msg.type === 'proposal' && msg.action === 'draft-anchor',
  );
  const title = extractText(draft.title);
  const desc = extractText(draft.description);
  const payload: ChatMessage['payload'] = {
    title,
    description: desc,
    raw: draft,
    applyEnabled: true,
  };
  if (existing) {
    existing.payload = payload;
    return;
  }
  pushMessage(
    'assistant',
    'proposal',
    '',
    payload,
    'draft-anchor',
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { includeInContext: false, contentJson: { publicActivityDraft: draft } },
  );
  cacheDraftForLog(logId ?? activeLogId.value, draft);
};

const QUESTION_HELPERS: Record<
  string,
  {
    title: string;
    lines: string[];
    foot?: string;
  }
> = {
  title: {
    title: '例',
    lines: ['来週金曜のBBQ', '三鷹での交流会'],
    foot: '未定でもOKです。あとで変更できます。',
  },
  time: {
    title: '例',
    lines: ['9/20(金) 19:00-21:00', '平日夜 2時間 くらい'],
    foot: '未定でもOK。ざっくりで大丈夫です。',
  },
  location: {
    title: '例',
    lines: ['渋谷駅周辺 / 近くの公園', 'オンラインでもOK'],
    foot: '未定でもOK。ざっくりで大丈夫です。',
  },
  price: {
    title: '例',
    lines: ['無料 / 1000円', '材料費のみでもOK'],
    foot: '未定でもOK。ざっくりで大丈夫です。',
  },
  capacity: {
    title: '例',
    lines: ['10人くらい', '少人数でもOK'],
    foot: '未定でもOK。ざっくりで大丈夫です。',
  },
  details: {
    title: 'ヒント',
    lines: ['持ち物 / 服装 / 集合場所', '注意事項やルール'],
    foot: '未定でもOK。ざっくりで大丈夫です。',
  },
  visibility: {
    title: '例',
    lines: ['公開 / 招待制', 'コミュニティ内限定'],
    foot: '後から変更できます。',
  },
  registrationForm: {
    title: '例',
    lines: ['氏名 / 電話 / メール', '希望チケットプラン'],
    foot: '必要な項目だけでOKです。',
  },
  requireApproval: {
    title: '例',
    lines: ['承認あり / なし', '手動承認にする'],
    foot: '後から変更できます。',
  },
  enableWaitlist: {
    title: '例',
    lines: ['有効 / 無効', '満員時のみ有効'],
    foot: '後から変更できます。',
  },
  requireCheckin: {
    title: '例',
    lines: ['有効 / 無効', '当日受付でQR確認'],
    foot: '後から変更できます。',
  },
  refundPolicy: {
    title: '例',
    lines: ['3日前まで全額返金', '当日キャンセルは返金不可'],
    foot: '後から変更できます。',
  },
  riskNotice: {
    title: '例',
    lines: ['持ち物：身分証', '注意事項：遅刻連絡必須'],
    foot: '後から変更できます。',
  },
};

const getQuestionHelper = (msg: ChatMessage) => {
  if (msg.role !== 'assistant') return null;
  if (msg.id !== currentQuestionId.value) return null;
  const contentJson = (msg.contentJson ?? msg.payload?.assistantReply ?? null) as EventAssistantReply | null;
  const meta = contentJson?.questionMeta;
  if (meta?.key && meta.exampleLines?.length) {
    return { title: '例', lines: meta.exampleLines, foot: '未定でもOK。ざっくりで大丈夫です。' };
  }
  const key = contentJson?.ui?.question?.key;
  if (!key) return null;
  return QUESTION_HELPERS[key] ?? null;
};
const SAFE_ASSISTANT_ACTIONS = new Set(['direct-form', 'title-suggestion', 'system-safe']);
const isSafeAssistantMessage = (msg: ChatMessage) => {
  if (msg.role !== 'assistant') return true;
  if (msg.type === 'proposal') return true;
  return Boolean(msg.action && SAFE_ASSISTANT_ACTIONS.has(msg.action));
};
const shouldRenderMessage = (msg: ChatMessage) => {
  if (msg.role === 'assistant' && msg.type === 'text' && !isSafeAssistantMessage(msg)) {
    if (import.meta.env.DEV) {
      console.assert(false, 'Unsafe assistant message blocked from render', msg);
    }
    return false;
  }
  return true;
};
const isEmptyConversation = computed(
  () => !isLoadingLog.value && chatMessages.value.length === 0 && !activeLogId.value,
);
const miniPreviewState = ref<EventAssistantReply['miniPreview'] | null>(null);
const choiceQuestionState = ref<EventAssistantReply['choiceQuestion'] | null>(null);
const readyMenuFallback = computed((): EventAssistantReply['choiceQuestion'] | null => {
  if (
    !explainMode.value &&
    !isCompareModeUi.value &&
    mode.value === 'chat' &&
    lastReadyDraft.value &&
    lastDraftReady.value
  ) {
    return {
      key: 'ready_next_action',
      prompt: '下書きが準備できました。どうしますか？',
      options: [
        { label: '下書きを見る', value: 'preview', recommended: true },
        { label: '手動で編集', value: 'manual' },
      ],
    };
  }
  return null;
});
const compareCandidatesState = ref<EventAssistantReply['compareCandidates'] | null>(null);
const showCandidateDetails = ref(false);
const isInterruptChoice = computed(() => choiceQuestionState.value?.key === 'interrupt');
const isConfirmChoice = computed(() => String(choiceQuestionState.value?.key ?? '').startsWith('confirm_'));
const hasActiveQuestion = computed(() => Boolean(currentSlotKey.value));
const shouldShowChoiceBlock = computed(() => {
  if (!choiceQuestionState.value?.options?.length) return false;
  if (hasActiveQuestion.value) return false;
  return isConfirmChoice.value;
});
const choiceHelperText = computed(() => {
  if (isConfirmChoice.value) return '内容が合っているか選んでください。';
  return '近いものがあれば選んでください。なければ、そのまま入力してOKです。';
});
const getCandidateId = (opt: { label: string; value: string }) => {
  const labelMatch = opt.label.match(/(?:候補|解釈)([A-Z])/i);
  if (labelMatch?.[1]) return labelMatch[1].toUpperCase();
  const valueMatch = opt.value.match(/(?:候補|解釈)([A-Z])/i);
  if (valueMatch?.[1]) return valueMatch[1].toUpperCase();
  return opt.value.slice(0, 1).toUpperCase();
};
const findCandidate = (opt: { label: string; value: string }) => {
  const id = getCandidateId(opt);
  return compareCandidatesState.value?.find((candidate) => candidate.id === id) ?? null;
};
const getCandidateTag = (opt: { label: string; value: string }) => {
  const id = getCandidateId(opt);
  return `解釈${id}`;
};
const getCandidateDisplayValue = (value: string) => {
  const match = value.match(/(?:候補|解釈)([A-Z])/i);
  if (!match) return null;
  const id = match[1].toUpperCase();
  const candidate = compareCandidatesState.value?.find((item) => item.id === id);
  return candidate?.summary || null;
};
const getCandidateTitle = (opt: { label: string; value: string }) => {
  const candidate = findCandidate(opt);
  if (candidate?.summary) return candidate.summary;
  return opt.label.replace(/^(候補|解釈)[A-Z]:?\s*/i, '');
};
const getCandidateMeta = (opt: { label: string; value: string }) => {
  const candidate = findCandidate(opt);
  if (!candidate) return [];
  const meta: string[] = [];
  if (candidate.time) meta.push(`日時: ${candidate.time}`);
  if (candidate.price) meta.push(`料金: ${candidate.price}`);
  if (candidate.notes) meta.push(`メモ: ${candidate.notes}`);
  return meta;
};
const getCandidateChipLabel = (opt: { label: string; value: string }) => {
  const title = getCandidateTitle(opt);
  const candidate = findCandidate(opt);
  const parts: string[] = [];
  if (candidate?.time) parts.push(candidate.time);
  if (candidate?.price) parts.push(candidate.price);
  const suffix = parts.length ? `（${parts.join(' / ')}）` : '';
  return `${title}${suffix}`;
};
const coachPromptState = ref<string | null>(null);
const previewExpanded = ref(false);
const screenStyle = computed(() => ({
  '--keyboard-offset': `${keyboardOffset.value}px`,
}));
const chatDraft = ref('');
const chatInputRef = ref<HTMLTextAreaElement | null>(null);
const aiLoading = ref(false);
const aiError = ref<string | null>(null);
const aiResult = ref<(GeneratedEventContent & { summary: string }) | null>(null);
const planPreview = ref<(GeneratedEventContent & { summary?: string }) | null>(null);
const currentQuestionIndex = ref(0);
const savingLog = ref(false);
const historyEntries = ref<AssistantHistoryEntry[]>([]);
const expandedThinkingId = ref<string | null>(null);
const lastAssistantStatus = ref<EventAssistantState>('collecting');
const lastPromptVersion = ref('coach-v3-lite');
const currentStage = ref<EventAssistantStage>('coach');
const pendingQuestion = ref<string | null>(null);
const lastExpertComment = ref<string | null>(null);
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
  baseLanguage: 'ja',
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
const previewPlanDescription = computed(() => {
  const text = extractText(planPreview.value?.description);
  if (text) return text;
  return extractText(planPreview.value?.notes) || '未設定';
});
const previewExpertComment = computed(() => extractText(planPreview.value?.expertComment) || '');
const readyDraftExpertComment = computed(() => lastExpertComment.value || '');
const previewCapacity = computed(() => {
  const raw = planPreview.value?.capacity;
  if (raw === undefined || raw === null || raw === '') return '未設定';
  return typeof raw === 'number' ? `${raw}人` : String(raw);
});
const previewRegistrationMethod = computed(() => '未設定');
const previewCancellationPolicy = computed(() => '未設定');
const previewPlanLogisticsDisplay = computed(() => {
  const items = previewPlanLogistics.value;
  if (items.length) return items;
  return [{ label: '日時', value: '未設定' }, { label: '場所', value: '未設定' }];
});
const previewPlanNotesText = computed(() => extractText(planPreview.value?.notes) || '未設定');
const previewPlanRiskText = computed(() => extractText(planPreview.value?.riskNotice) || '未設定');
const previewPlanLogistics = computed(() => buildPlanLogistics(planPreview.value));
const previewPlanTickets = computed(() => getPlanTickets(planPreview.value));
const previewPlanRequirements = computed(() => getPlanRequirements(planPreview.value));
const previewPlanFormFields = computed(() => getPlanFormFields(planPreview.value));
const previewPriceText = computed(() => {
  const raw = planPreview.value?.price;
  if (raw === undefined || raw === null || raw === '') return '未設定';
  return typeof raw === 'number' ? `¥${raw.toLocaleString('ja-JP')}` : String(raw);
});
const readyDraftSummary = computed(() => {
  const draft = lastReadyDraft.value;
  const titleValue = draft?.title?.trim() || '未設定';
  const scheduleDate = draft?.schedule?.date?.trim() || '';
  const scheduleDuration = draft?.schedule?.duration?.trim() || '';
  const scheduleStart = draft?.schedule?.startTime;
  const scheduleEnd = draft?.schedule?.endTime;
  const scheduleParts = [scheduleDate, scheduleDuration].filter(Boolean);
  const structuredTime =
    scheduleStart && scheduleEnd
      ? `${formatDateTime(scheduleStart)} 〜 ${formatDateTime(scheduleEnd)}`
      : scheduleStart
      ? formatDateTime(scheduleStart)
      : '';
  const timeValue = structuredTime || scheduleParts.join(' / ') || '未設定';
  const locationValue = draft?.schedule?.location?.trim() || '未設定';
  const rawPrice = draft?.price ?? null;
  const priceValue =
    typeof rawPrice === 'number'
      ? `¥${rawPrice.toLocaleString('ja-JP')}`
      : rawPrice
      ? String(rawPrice)
      : '未設定';
  const rawCapacity = draft?.capacity ?? null;
  const capacityValue =
    typeof rawCapacity === 'number' ? `${rawCapacity}人` : rawCapacity ? String(rawCapacity) : '未設定';
  return [
    { label: 'タイトル', value: titleValue },
    { label: '日時', value: timeValue },
    { label: '場所', value: locationValue },
    { label: '料金', value: priceValue },
    { label: '定員', value: capacityValue },
  ];
});
const formatTicketPrice = (price?: number) => {
  if (price == null) return '無料';
  return `¥${price.toLocaleString('ja-JP')}`;
};
const parsePriceToNumber = (value?: string | number | null) => {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const digits = String(value).replace(/[^\d]/g, '');
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
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
  locationText: qaState.details,
  ticketTypes: [],
  registrationFormSchema: [],
}));
const currentPrompt = computed(() => {
  if (isEmptyConversation.value) {
    return '例：来週金曜BBQ、15:00-17:00、2000円/人（ざっくりでOK・一言でもOK）';
  }
  if (mode.value === 'operate') {
    return '補足や修正メモがあれば入力してね（編集はフォームから）';
  }
  if (latestCoachPrompts.value.length) {
    return latestCoachPrompts.value[0];
  }
  return '追加で伝えたいことがあれば入力してね';
});
watch(
  () => communityId.value,
  async () => {
    isLoadingLog.value = true;
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
    isLoadingLog.value = false;
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

watch(
  () => isCompareModeUi.value,
  (val) => {
    if (!val) showCandidateDetails.value = false;
  },
);

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
  extras?: { includeInContext?: boolean; contentJson?: Record<string, unknown> | null; contentText?: string },
  messageSource?: ChatMessage['messageSource'],
) => {
  const sanitizeAssistantContent = (text: string) => {
    const banned = ['AI 憲章', 'AI憲章', 'AI Constitution', 'SOCIALMORE AI'];
    const containsBanned = banned.some((kw) => text.includes(kw));
    if (containsBanned) {
      return '続きましょう。イベント内容を簡単に教えてください。';
    }
    // avoid dumping very long system prompts
    if (text.length > 500 && text.includes('Rules')) {
      return '続けよう。1〜2行で教えてね。';
    }
    return text;
  };
  if (role === 'assistant' && type === 'text') {
    content = sanitizeAssistantContent(content);
  }
  const clientMessageId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const id = clientMessageId;
  chatMessages.value.push({
    id,
    clientMessageId,
    role,
    type,
    content,
    contentText: extras?.contentText ?? content,
    contentJson: extras?.contentJson ?? null,
    createdAt: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    payload,
    action,
    messageSource,
    options,
    thinkingSteps: steps && steps.length ? steps : undefined,
    coachPrompts,
    editorChecklist,
    writerSummary,
    confirmQuestions,
    includeInContext: extras?.includeInContext ?? true,
    status: role === 'user' ? 'sent' : undefined,
  });
  if (chatMessages.value.length > 200) {
    chatMessages.value.shift();
  }
  scrollChatToBottom();
  return id;
};

const pushAssistantMessageOnce = (
  text: string,
  action: ChatMessage['action'],
  messageSource: ChatMessage['messageSource'],
  optionsPayload?: string[],
  extras?: { includeInContext?: boolean; contentJson?: Record<string, unknown> | null },
  stepsPayload?: string[],
  coachPromptsPayload?: string[],
  editorChecklistPayload?: string[],
  writerSummaryPayload?: EventAssistantReply['writerSummary'],
  confirmQuestionsPayload?: string[],
  turnKeys?: Set<string>,
) => {
  const key = `${action ?? 'assistant'}:${text}`;
  if (turnKeys?.has(key)) return null;
  const last = chatMessages.value[chatMessages.value.length - 1];
  if (last?.role === 'assistant' && last.content === text && last.action === action) {
    return null;
  }
  if (isEventAssistantDebug.value && !messageSource) {
    console.warn('[EventAssistant][warn]', {
      requestId: lastRequestId.value,
      conversationId: assistantSessionId.value ?? null,
      message: 'missing_message_source',
      action,
      text,
    });
  }
  turnKeys?.add(key);
  return pushMessage(
    'assistant',
    'text',
    text,
    undefined,
    action,
    optionsPayload,
    stepsPayload,
    coachPromptsPayload,
    editorChecklistPayload,
    writerSummaryPayload,
    confirmQuestionsPayload,
    extras,
    messageSource,
  );
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

const isComposing = ref(false);
const MAX_CHAT_LINES = 3;
const resizeChatInput = () => {
  const el = chatInputRef.value;
  if (!el) return;
  el.style.height = 'auto';
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '20');
  const maxHeight = lineHeight * MAX_CHAT_LINES + 10;
  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
};

const resetChatInputHeight = () => {
  const el = chatInputRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.overflowY = 'hidden';
};

const insertLineBreak = () => {
  if (isComposing.value) return;
  chatDraft.value += '\n';
  nextTick(resizeChatInput);
};

const handleSend = async (source: 'button' | 'enter' = 'button') => {
  if (isComposing.value) return;
  if (!chatDraft.value.trim() || aiLoading.value) return;
  autoScrollEnabled.value = true;
  const content = chatDraft.value.trim();
  const commitIntent =
    !explainMode.value &&
    lastDraftReady.value &&
    !isCommitted.value &&
    /(就用这个吧?|可以开始了|按这个来|就这样|この内容で|この案で|これでいこう|これで進めて|これでOK|この内容で作って|この内容で作成|この案で作成)/i.test(
      content,
    );
  let submitText = content;
  if (choiceQuestionState.value?.key) {
    const matchedValue = resolveChoiceValueFromInput(choiceQuestionState.value, content);
    if (matchedValue) {
      submitText = `【選択】${choiceQuestionState.value.key}:${matchedValue}`;
    } else {
      choiceQuestionState.value = null;
    }
  }
  chatDraft.value = '';
  currentQuestionId.value = null;
  nextTick(resetChatInputHeight);
  if (source === 'button') {
    chatInputRef.value?.blur();
    keyboardOffset.value = 0;
  }
  if (choiceQuestionState.value?.key) {
    const key = choiceQuestionState.value.key;
    choiceQuestionState.value = null;
    lastQuestionKeyPending.value = false;
    pushMessage(
      'user',
      'text',
      submitText,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { contentText: content },
    );
  } else {
    pushMessage('user', 'text', content);
    lastQuestionKeyPending.value = false;
  }
  if (commitIntent) {
    isCommitted.value = true;
    await requestAssistantReply(content, { action: 'confirm_draft' });
    return;
  }
  if (mode.value === 'operate') {
    pushAssistantMessageOnce(
      '補足ありがとう。編集はフォームでできるよ。',
      'direct-form',
      'frontend.machine',
      undefined,
      { includeInContext: false },
    );
    await persistAssistantLog(currentStage.value, buildQaSummary(), {
      status: 'ready',
      promptVersion: lastPromptVersion.value,
      turnCount: lastTurnCount.value,
      language: lastLanguage.value,
      draftId: lastDraftId.value ?? null,
    });
    return;
  }
  await handleChatAnswer(content, submitText);
};

const detectLanguage = (text: string) => {
  if (/[ぁ-んァ-ン]/.test(text)) return 'ja';
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
  if (/[a-zA-Z]/.test(text)) return 'en';
  return 'ja';
};

const isLocalHelpIntent = (text: string) => {
  if (!text) return false;
  return (
    /これは何の機能|何をしているの|どう使うの|どう使えばいい|何をすればいい|なんで選ぶ|どういう意味|説明して/i.test(text) ||
    /这个功能是干嘛|你在做什么|怎么用的|怎么用|怎么用啊|现在要我做什么|我该做什么|为什么要我选|什么意思|解释一下/i.test(text)
  );
};

const applyLanguageFromInput = (text: string) => {
  const detected = detectLanguage(text);
  if (detected && qaState.baseLanguage !== detected) {
    qaState.baseLanguage = detected;
  }
};

const buildExplainMessage = (lang: 'ja' | 'zh' | 'en') => {
  if (lang === 'zh') {
    return '这是一个帮助你创建活动的助手。我会确认日期、地点、费用等关键信息，方便生成活动草稿。你可以继续回答当前问题，或者稍后手动编辑表单。';
  }
  if (lang === 'en') {
    return 'This assistant helps you create an event. I confirm key details like time, place, and fee to draft the event. You can continue answering or edit the form later.';
  }
  return 'これはイベント作成を手伝うアシスタントです。日時・場所・参加費など必要な情報を確認して草案を作ります。続ける場合は今の質問に答えてください。';
};

const ensureExplainBubble = (lang: 'ja' | 'zh' | 'en') => {
  const message = buildExplainMessage(lang);
  pushAssistantMessageOnce(
    message,
    'system-safe',
    'frontend.explain',
    undefined,
    { includeInContext: false },
  );
};

const handleChitchat = () => {
  pushAssistantMessageOnce(
    'この画面はイベント作成専用です。雑談はできませんが、イベント作成については続けられます。',
    'system-safe',
    'frontend.explain',
    undefined,
    { includeInContext: false },
  );
  pushAssistantMessageOnce(
    'まずは、イベント内容を一文で入力してください。',
    'system-safe',
    'frontend.explain',
    undefined,
    { includeInContext: false },
  );
  if (!chatDraft.value.trim()) {
    chatDraft.value = introMainExample;
    nextTick(resizeChatInput);
  }
  chatInputRef.value?.focus();
};

const handleChatAnswer = async (text: string, submitText?: string) => {
  applyLanguageFromInput(text);
  if (isLocalHelpIntent(text)) {
    introExpanded.value = true;
    introDetailsExpanded.value = true;
    pendingQuestion.value = null;
    if (!chatDraft.value.trim()) {
      chatDraft.value = introTemplateLine;
      nextTick(resizeChatInput);
    }
    chatInputRef.value?.focus();
    return;
  }
  const shouldStayExplain = explainMode.value;
  if (shouldStayExplain) {
    explainLanguage.value = detectLanguage(text) as 'ja' | 'zh' | 'en';
    pendingQuestion.value = null;
    await requestAssistantReply(submitText ?? text);
    return;
  }
  const question = questions[currentQuestionIndex.value];
  if (question) {
    (qaState as any)[question.key] = text;
  }
  if (currentSlotKey.value) {
    storeConfirmedAnswer(currentSlotKey.value, text);
    if (currentSlotKey.value === 'title') {
      titleSeed.value = text;
    }
    currentSlotKey.value = null;
  }
  if (currentQuestionIndex.value < questions.length - 1) {
    currentQuestionIndex.value += 1;
  }
  pendingQuestion.value = null;
  await requestAssistantReply(submitText ?? text);
};

const handleTitleSuggestionSelect = async (title: string) => {
  if (!title || aiLoading.value) return;
  autoScrollEnabled.value = true;
  currentQuestionId.value = null;
  const userText = `タイトルは「${title}」にします`;
  pushMessage('user', 'text', userText);
  await requestAssistantReply(userText);
};

const handleOptionSelect = async (option: string, action?: ChatMessage['action']) => {
  if (!option || aiLoading.value) return;
  autoScrollEnabled.value = true;
  currentQuestionId.value = null;
  if (action === 'title-suggestion') {
    await handleTitleSuggestionSelect(option);
    return;
  }
  pushMessage('user', 'text', option);
  await handleChatAnswer(option);
};

const toLocalizedContent = (text: string) => {
  const value = text ?? '';
  return {
    original: value,
    lang: 'ja',
    translations: { ja: value, zh: value, en: value },
  };
};

const isDraftMvp = (draft?: EventAssistantReply['publicActivityDraft'] | null) => {
  if (!draft) return false;
  const hasTitle = Boolean(draft.title && String(draft.title).trim());
  const hasDescription = Boolean(
    (draft.detailedDescription && String(draft.detailedDescription).trim()) ||
      (draft.shortDescription && String(draft.shortDescription).trim()),
  );
  const hasTime = Boolean(draft.schedule?.startTime || draft.schedule?.endTime || draft.schedule?.date);
  const hasLocation = Boolean(draft.schedule?.location && String(draft.schedule.location).trim());
  const hasPrice =
    draft.price !== undefined && draft.price !== null && String(draft.price).trim().length > 0;
  return hasTitle && hasDescription && hasTime && hasLocation && hasPrice;
};

const buildProposalFromDraft = (
  draft: EventAssistantReply['publicActivityDraft'] | undefined | null,
  summary: string,
): (GeneratedEventContent & { summary: string }) => {
  const scheduleNoteParts: string[] = [];
  if (draft?.schedule?.duration) scheduleNoteParts.push(`所要時間: ${draft.schedule.duration}`);
  const notesParts = [draft?.signupNotes, scheduleNoteParts.join(' / ')]
    .filter(Boolean)
    .map((item) => String(item));
  const notesText = notesParts.join('\n');
  const highlightsText = Array.isArray(draft?.highlights) ? draft?.highlights?.join(' / ') : '';
  const mergedDescription =
    draft?.detailedDescription ||
    draft?.shortDescription ||
    [highlightsText].filter(Boolean).join(' | ');
  const priceValue = draft?.price;
  const capacityValue = draft?.capacity;
  const infoNoteParts: string[] = [];
  if (priceValue !== undefined && priceValue !== null && priceValue !== '') {
    infoNoteParts.push(`料金: ${priceValue}`);
  }
  if (capacityValue !== undefined && capacityValue !== null && capacityValue !== '') {
    infoNoteParts.push(`定員: ${capacityValue}`);
  }
  const checklistNotes = [notesText, infoNoteParts.join(' / ')].filter(Boolean).join('\n');
  const safeSchedule = draft?.schedule
    ? {
        date: draft.schedule.date || undefined,
        duration: draft.schedule.duration || undefined,
        location: draft.schedule.location || undefined,
        startTime: draft.schedule.startTime || undefined,
        endTime: draft.schedule.endTime || undefined,
      }
    : undefined;
  return {
    title: toLocalizedContent(draft?.title || 'イベント案'),
    description: toLocalizedContent(mergedDescription),
    notes: toLocalizedContent(checklistNotes),
    riskNotice: toLocalizedContent(draft?.riskNotice || ''),
    expertComment: draft?.expertComment || '',
    snsCaptions: {
      line: { ja: '', zh: '', en: '' },
      instagram: { ja: '', zh: '', en: '' },
    },
    logistics: safeSchedule
      ? {
          startTime: safeSchedule.startTime || undefined,
          endTime: safeSchedule.endTime || undefined,
          locationText: safeSchedule.location || undefined,
          locationNote: safeSchedule.duration || undefined,
        }
      : undefined,
    ticketTypes:
      priceValue !== undefined && priceValue !== null && priceValue !== ''
        ? [
            {
              name: '参加チケット',
              price: parsePriceToNumber(priceValue) ?? 0,
              currency: 'JPY',
            },
          ]
        : [],
    requirements: draft?.requirements ?? [],
    registrationForm: draft?.registrationForm ?? [],
    visibility: (draft?.visibility as EventVisibility) || 'public',
    requireApproval: draft?.requireApproval ?? undefined,
    enableWaitlist: draft?.enableWaitlist ?? undefined,
    requireCheckin: draft?.requireCheckin ?? undefined,
    refundPolicy: draft?.refundPolicy ?? undefined,
    summary,
  };
};

const requestAssistantReply = async (
  userText: string,
  options?: {
    overrideSummary?: string;
    action?: EventAssistantRequest['action'];
    uiAction?: EventAssistantRequest['uiAction'];
  },
) => {
  aiError.value = null;
  const turnMessageKeys = new Set<string>();
  const isSelectionAction = /【選択】/.test(userText);
  const requestId = `ea-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const conversationId = assistantSessionId.value ?? null;
  const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  const clientLocale = navigator.language || qaState.baseLanguage || 'ja';
  lastRequestId.value = requestId;
  const qaSummary = options?.overrideSummary ?? buildQaSummary(userText);
  const { stage, prompt } = buildEventAssistantPrompt({
    draft: assistantDraftSnapshot.value,
    locale: (qaState.baseLanguage as 'ja' | 'zh' | 'en') || 'ja',
    lastUserUtterance: userText,
  });
  currentStage.value = stage;
  if (isEventAssistantDebug.value) {
    console.info('[EventAssistant][trace]', {
      requestId,
      conversationId,
      messageId,
      event: 'user_input',
      rawText: userText,
      locale: clientLocale,
      timezone: clientTimezone,
    });
  }
  const conversationContext = buildConversationContext();
  const promptDetails = `${qaSummary}\n\n--- Conversation ---\n${conversationContext}\n\n--- Assistant Prompt ---\n${prompt}`;
  const conversationMessages = buildConversationMessages();
  const payload: EventAssistantRequest = {
    baseLanguage: getProfileValue(qaState.baseLanguage, 'baseLanguage'),
    topic: getProfileValue(qaState.topic, 'topic'),
    audience: getProfileValue(qaState.audience, 'audience'),
    style: getProfileValue(qaState.style, 'style'),
    details: promptDetails,
    titleSeed: titleSeed.value ?? undefined,
    conversation: conversationMessages,
    action: options?.action,
    uiAction: options?.uiAction ?? options?.action ?? null,
    uiMode: explainMode.value ? 'explain' : 'collecting',
    requestId,
    conversationId: conversationId ?? undefined,
    messageId,
    clientLocale,
    clientTimezone,
  };
  aiLoading.value = true;
  try {
    const result = await requestEventAssistantReply(payload);
    const state = (result.state as EventAssistantState) || result.status || 'collecting';
    const stageTag: EventAssistantStage = state === 'ready' ? 'writer' : state === 'options' ? 'editor' : 'coach';
    currentStage.value = stageTag;
    const steps = Array.isArray(result.thinkingSteps) ? result.thinkingSteps : [];
    const isCompareMode = computeIsCompareMode(result.inputMode ?? null, result.compareCandidates ?? null);
    const nextQuestionKey = result.nextQuestionKey ?? null;
    const effectiveDraftReady = state === 'ready' && Boolean(result.draftReady);
    const willOperate =
      mode.value === 'operate' ||
      options?.action === 'confirm_draft' ||
      (effectiveDraftReady && result.modeHint === 'operate');
    const uiQuestionText =
      typeof result.ui?.question?.text === 'string' ? result.ui.question.text.trim() : '';
    const rawUiMessageText = typeof result.ui?.message === 'string' ? result.ui.message.trim() : '';
    let uiMessageText = rawUiMessageText;
    const backendMessageSource = result.messageSource;
    if (isEventAssistantDebug.value && !backendMessageSource) {
      console.warn('[EventAssistant][warn]', {
        requestId,
        conversationId,
        message: 'missing_message_source_backend',
        promptVersion: result.promptVersion,
      });
    }
    const uiMessageSource = backendMessageSource ?? 'backend.ui';
    const uiOptions = Array.isArray(result.ui?.options) ? result.ui.options : [];
    const isExplainMode = result.uiMode === 'explain' || result.ui?.mode === 'explain';
    explainMode.value = isExplainMode;
    if (isExplainMode) {
      explainLanguage.value = (result.language as 'ja' | 'zh' | 'en') || 'ja';
    }
    const stickyExplain = explainMode.value && options?.action !== 'resume_collecting';
    if (stickyExplain && !isExplainMode) {
      explainMode.value = true;
      explainLanguage.value = (result.language as 'ja' | 'zh' | 'en') || explainLanguage.value;
      ensureExplainBubble(explainLanguage.value);
      return;
    }
    if (isExplainMode) {
      ensureExplainBubble(explainLanguage.value);
    }
    if (result.autoTitle && result.autoTitle.trim()) {
      titleSeed.value = result.autoTitle.trim();
    }
    let choiceQuestion = isExplainMode
      ? null
      : resolveChoiceQuestionState({
          inputMode: result.inputMode ?? null,
          compareCandidates: result.compareCandidates ?? null,
          machineChoiceQuestion: result.choiceQuestion ?? null,
          uiMessage: rawUiMessageText,
          uiOptions,
        });
    // ready_next_action 仅作为菜单展示，实际动作在 handleChoiceSelect 中处理
    if (choiceQuestion?.key === 'ready_next_action') {
      choiceQuestion.prompt = choiceQuestion.prompt || '下書きが準備できました。どうしますか？';
    }
    if (choiceQuestion?.key === 'interrupt') {
      choiceQuestion = null;
    }
    const hasChoiceQuestion = Boolean(choiceQuestion?.options?.length);
    coachPromptState.value =
      !isExplainMode && !willOperate && hasChoiceQuestion && !isCompareMode ? result.coachPrompt ?? null : null;
    lastAssistantStatus.value = state;
    lastPromptVersion.value = result.promptVersion;
    lastTurnCount.value = result.turnCount;
    lastLanguage.value = result.language;
    latestChecklist.value = result.editorChecklist ?? [];
    latestConfirmQuestions.value = result.confirmQuestions ?? [];
    let messageId: string | null = null;
    const canRenderBubble = !willOperate && !isExplainMode;
    const hasMvpDraft = isDraftMvp(result.publicActivityDraft ?? null);
    const draftReadyForUi = effectiveDraftReady && hasMvpDraft;
    const shouldHoldCommit = draftReadyForUi && !isCommitted.value && !willOperate;
    const isDuplicateQuestionKey =
      Boolean(nextQuestionKey && lastQuestionKey.value === nextQuestionKey && lastQuestionKeyPending.value);
    if (uiQuestionText && !nextQuestionKey) {
      console.warn('[EventAssistant] ui.question ignored because nextQuestionKey is null', { uiQuestionText });
    }
    if (uiQuestionText && isDuplicateQuestionKey) {
      console.warn('[EventAssistant] duplicate question key ignored', { nextQuestionKey });
    }
    const hasNextQuestion = Boolean(nextQuestionKey);
    const hasQuestionText = Boolean(uiQuestionText);
    const shouldRenderQuestionBubble =
      canRenderBubble &&
      !isCompareMode &&
      hasNextQuestion &&
      hasQuestionText &&
      !shouldHoldCommit &&
      !isDuplicateQuestionKey;
    const shouldRenderCompareBubble = canRenderBubble && isCompareMode && uiMessageText;
    const shouldRenderMessageBubble =
      canRenderBubble && !isCompareMode && !nextQuestionKey && uiMessageText && !shouldHoldCommit;
    const lastMessage = chatMessages.value[chatMessages.value.length - 1] ?? null;
    const canAppendQuestionBubble = shouldAppendQuestionBubble({
      lastMessage,
      questionText: uiQuestionText,
      shouldRender: shouldRenderQuestionBubble,
    });
    if (shouldRenderQuestionBubble) {
      currentSlotKey.value = nextQuestionKey;
    } else {
      currentSlotKey.value = null;
    }
    const phase: 'collecting' | 'decision' | 'compare' | 'ready' | 'operate' = willOperate
      ? 'operate'
      : isCompareMode
      ? 'compare'
      : hasChoiceQuestion
      ? 'decision'
      : draftReadyForUi
      ? 'ready'
      : 'collecting';
    const phaseMessage = pickPhaseMessage(phase, result.turnCount);
    const shouldAckPrevious =
      canRenderBubble &&
      !isCompareMode &&
      lastQuestionKey.value &&
      lastQuestionKey.value !== nextQuestionKey &&
      !hasChoiceQuestion &&
      !shouldHoldCommit &&
      !uiMessageText;
    if (shouldAckPrevious) {
      pushAssistantMessageOnce(
        buildAckText(lastQuestionKey.value, userText),
        'system-safe',
        'frontend.machine',
        undefined,
        { includeInContext: false },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        turnMessageKeys,
      );
    }
    if (canAppendQuestionBubble) {
      lastQuestionKey.value = nextQuestionKey ?? null;
      lastQuestionKeyPending.value = true;
      messageId = pushAssistantMessageOnce(
        uiQuestionText,
        'system-safe',
        uiMessageSource,
        undefined,
        { contentJson: result as unknown as Record<string, unknown> },
        steps,
        result.coachPrompts,
        result.editorChecklist,
        stageTag === 'writer' ? buildSafeWriterSummary() : undefined,
        result.confirmQuestions,
        turnMessageKeys,
      );
    } else if (shouldRenderCompareBubble || shouldRenderMessageBubble) {
      uiMessageText = uiMessageText || phaseMessage;
      messageId = pushAssistantMessageOnce(
        uiMessageText,
        'system-safe',
        uiMessageSource,
        undefined,
        { contentJson: result as unknown as Record<string, unknown> },
        steps,
        result.coachPrompts,
        result.editorChecklist,
        stageTag === 'writer' ? buildSafeWriterSummary() : undefined,
        result.confirmQuestions,
        turnMessageKeys,
      );
    }
    if (isSelectionAction && !messageId && !willOperate && canRenderBubble) {
      const ackText = phaseMessage || buildSelectionAck(nextQuestionKey, hasChoiceQuestion, isCompareMode);
      messageId = pushAssistantMessageOnce(
        ackText,
        'system-safe',
        'frontend.machine',
        undefined,
        { contentJson: result as unknown as Record<string, unknown> },
        steps,
        result.coachPrompts,
        result.editorChecklist,
        stageTag === 'writer' ? buildSafeWriterSummary() : undefined,
        result.confirmQuestions,
        turnMessageKeys,
      );
    }
    pendingQuestion.value = canAppendQuestionBubble ? uiQuestionText : null;
    // keep options bubble highlighted to drive user click
    currentQuestionId.value =
      messageId && (shouldRenderQuestionBubble || shouldRenderCompareBubble) ? messageId : null;
    const titleSuggestions =
      Array.isArray(result.titleSuggestions) && result.titleSuggestions.length > 0
        ? result.titleSuggestions.filter((s) => !!s)
        : [];
    if (titleSuggestions.length && !willOperate) {
      pushAssistantMessageOnce(
        'タイトル候補だよ。どれがいい？',
        'title-suggestion',
        'frontend.machine',
        titleSuggestions as string[],
        { includeInContext: false },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        turnMessageKeys,
      );
    }
    if (willOperate) {
      mode.value = 'operate';
      isCommitted.value = true;
      miniPreviewState.value = null;
      previewExpanded.value = false;
      choiceQuestionState.value = null;
      compareCandidatesState.value = null;
      showCandidateDetails.value = false;
      pendingQuestion.value = null;
      currentQuestionId.value = null;
    } else {
      miniPreviewState.value = result.miniPreview ?? null;
      choiceQuestionState.value = choiceQuestion?.options?.length ? choiceQuestion : null;
      compareCandidatesState.value = result.compareCandidates ?? null;
      showCandidateDetails.value = false;
      previewExpanded.value = Boolean(
        result.miniPreview?.bullets?.length &&
          !choiceQuestion &&
          result.inputMode !== 'compare' &&
          !result.nextQuestionKey,
      );
    }
    lastInputMode.value = result.inputMode ?? null;
    lastNextQuestionKey.value = nextQuestionKey ?? null;
    lastDraftReady.value = draftReadyForUi;
    lastDraftId.value = draftReadyForUi ? result.draftId ?? null : null;
    lastReadyDraft.value = draftReadyForUi ? result.publicActivityDraft ?? null : null;
    const shouldPushProposal =
      draftReadyForUi &&
      Boolean(result.draftId) &&
      isCommitted.value &&
      !seenDraftIds.value.includes(result.draftId as string);
    let preparedProposal: (GeneratedEventContent & { summary: string }) | null = null;
    if (result.publicActivityDraft) {
      const draftAnchor = buildProposalFromDraft(result.publicActivityDraft, qaSummary);
      upsertDraftAnchor(draftAnchor, activeLogId.value ?? result.draftId ?? null);
    }
    const expertComment = result.publicActivityDraft?.expertComment?.trim() || '';
    if (draftReadyForUi && expertComment && expertComment !== lastExpertComment.value) {
      lastExpertComment.value = expertComment;
    }
    if (shouldPushProposal) {
      preparedProposal = buildProposalFromDraft(result.publicActivityDraft ?? null, qaSummary);
      aiResult.value = preparedProposal;
      if (preparedProposal) {
        upsertDraftAnchor(preparedProposal, activeLogId.value ?? result.draftId ?? null);
        if (result.draftId) {
          seenDraftIds.value.push(result.draftId);
          lastShownDraftId.value = result.draftId;
          lastMilestoneDraftId.value = result.draftId;
          lastMilestoneMessageId.value = chatMessages.value.find((msg) => msg.action === 'draft-anchor')?.id ?? null;
        }
      }
    } else if (state !== 'collecting') {
      pendingQuestion.value = null;
    }
    const aiResultForLog =
      !aiResult.value && result.publicActivityDraft
        ? buildProposalFromDraft(result.publicActivityDraft, qaSummary)
        : null;
    await persistAssistantLog(
      stageTag,
      qaSummary,
      {
      status: state,
      promptVersion: result.promptVersion,
      turnCount: result.turnCount,
      language: result.language,
      options: uiOptions.map((opt) => opt.label).filter(Boolean),
      coachPrompts: result.coachPrompts ?? [],
      editorChecklist: result.editorChecklist ?? [],
      writerSummary: stageTag === 'writer' ? buildSafeWriterSummary() : null,
      ui: result.ui ?? null,
      draftId: result.draftId,
      },
      aiResultForLog,
    );
    if (preparedProposal) {
      addHistoryEntry(preparedProposal);
    }
  } catch (err) {
    aiError.value = err instanceof Error ? err.message : 'AI生成に失敗しました。少し時間を置いて再度お試しください。';
    pushAssistantMessageOnce(
      aiError.value ?? 'AI生成に失敗しました。',
      'system-safe',
      'frontend.machine',
    );
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
    ui?: EventAssistantReply['ui'] | null;
    draftId?: string | null;
  },
  aiResultOverride?: GeneratedEventContent | null,
) => {
  if (!communityId.value) return;
  try {
    savingLog.value = true;
    const plainMessages = chatMessages.value.map((msg) => ({
      id: msg.id,
      clientMessageId: msg.clientMessageId ?? msg.id,
      role: msg.role,
      type: msg.type,
      content: msg.content,
      contentText: msg.contentText ?? msg.content,
      contentJson: msg.contentJson ?? null,
      messageSource: msg.messageSource ?? null,
      createdAt: msg.createdAt,
      serverCreatedAt: msg.serverCreatedAt ?? null,
      action: msg.action ?? null,
      status: msg.status ?? 'sent',
      thinkingSteps: msg.thinkingSteps ?? null,
      coachPrompts: msg.coachPrompts ?? null,
      editorChecklist: msg.editorChecklist ?? null,
      writerSummary: msg.writerSummary ?? null,
      confirmQuestions: msg.confirmQuestions ?? null,
      payload: msg.payload
        ? {
            title: msg.payload.title ?? null,
            description: msg.payload.description ?? null,
            raw: msg.payload.raw ?? null,
            applyEnabled: msg.payload.applyEnabled ?? undefined,
            assistantReply: msg.payload.assistantReply ?? null,
          }
        : null,
    }));
    const aiResultPayload = aiResultOverride ?? aiResult.value;
    const saved = await saveEventAssistantLog(communityId.value, {
      stage,
      summary,
      qaState: JSON.parse(JSON.stringify(qaState)),
      messages: plainMessages,
      aiResult: aiResultPayload
        ? {
            title: aiResultPayload.title,
            description: aiResultPayload.description,
            notes: aiResultPayload.notes,
            riskNotice: aiResultPayload.riskNotice,
            expertComment: (aiResultPayload as any).expertComment ?? null,
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
        draftId: meta?.draftId ?? null,
        mode: mode.value,
        isCommitted: isCommitted.value,
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
  // Normalize key fields for comparison
  const title = extractText(result.title);
  const description = extractText(result.description);
  const summary = result.summary;

  // Deduplicate against existing history (same title + description + summary)
  historyEntries.value = historyEntries.value.filter(
    (item) => item.title !== title || item.description !== description || item.summary !== summary,
  );

  const entry: AssistantHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
    summary,
    title,
    description,
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
  pushMessage(
    'assistant',
    'text',
    'この案を下書きとして保存しました。履歴からいつでも復元できます。',
    undefined,
    'system-safe',
  );
};

const applyProposalToForm = (raw?: (GeneratedEventContent & { summary?: string }) | string) => {
  if (!raw) return;
  let normalized: (GeneratedEventContent & { summary?: string }) | null = null;
  if (typeof raw === 'string') {
    try {
      normalized = JSON.parse(raw) as GeneratedEventContent & { summary?: string };
    } catch (err) {
      toast.show('下書きの解析に失敗しました。もう一度お試しください。', 'error');
      return;
    }
  } else {
    normalized = raw;
  }
  aiResult.value = { ...normalized, summary: normalized.summary || buildQaSummary() };
  goToForm(true);
};

const toggleThinking = (messageId: string) => {
  expandedThinkingId.value = expandedThinkingId.value === messageId ? null : messageId;
};

const openPlanPreview = (plan?: (GeneratedEventContent & { summary?: string }) | null) => {
  const targetPlan =
    plan ??
    (lastReadyDraft.value as (GeneratedEventContent & { summary?: string }) | null) ??
    (aiResult.value as (GeneratedEventContent & { summary?: string }) | null);
  if (!targetPlan) return;
  planPreview.value = targetPlan;
};

const closePlanPreview = () => {
  planPreview.value = null;
};

const returnToChat = () => {
  closePlanPreview();
  nextTick(() => {
    chatInputRef.value?.focus();
  });
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
};

const buildQaSummary = (latestInput?: string) => {
  const toStr = (v: unknown) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.trim();
    return String(v).trim();
  };
  const parts: string[] = [];
  const draft = lastReadyDraft.value;
  const title = toStr(draft?.title) || confirmedAnswers.title || getProfileValue(qaState.topic, 'topic');
  if (title) parts.push(`タイトル: ${title}`);
  const timeValue =
    toStr((draft as any)?.schedule?.date) ||
    toStr((draft as any)?.schedule?.startTime) ||
    toStr(confirmedAnswers.time);
  const locationValue = toStr((draft as any)?.schedule?.location) || toStr(confirmedAnswers.location);
  const priceValue = toStr((draft as any)?.price) || toStr(confirmedAnswers.price);
  if (timeValue) parts.push(`日時: ${timeValue}`);
  if (locationValue) parts.push(`場所: ${locationValue}`);
  if (priceValue) parts.push(`参加費: ${priceValue}`);
  const extra = toStr(latestInput || qaState.details || '特記事項なし');
  return `AIの理解：${parts.join(' / ') || '概要未設定'}。補足情報: ${extra}`;
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
      content: (() => {
        if (msg.type !== 'text') {
          return `提案: ${msg.payload?.title ?? ''} ${msg.payload?.description ?? ''}`;
        }
        const baseContent = msg.content;
        if (msg.role !== 'assistant') return baseContent;
        const reply = (msg.contentJson ?? msg.payload?.assistantReply ?? null) as EventAssistantReply | null;
        const askKey = reply?.ui?.question?.key ?? null;
        const choicePrompt = reply?.choiceQuestion?.prompt ?? '';
        const contentWithChoice = choicePrompt ? `${baseContent}\n${choicePrompt}`.trim() : baseContent;
        return askKey ? `${contentWithChoice} [ask:${askKey}]` : contentWithChoice;
      })(),
    }));
};

const resolvePhaseForMessage = (msg: ChatMessage): 'collecting' | 'decision' | 'compare' | 'ready' | 'operate' => {
  const contentJson = (msg.contentJson ?? msg.payload?.assistantReply ?? null) as EventAssistantReply | null;
  if (!contentJson) return 'collecting';
  const state = (contentJson.state as EventAssistantState) || (contentJson.status as EventAssistantState) || 'collecting';
  if (state === 'completed') return 'operate';
  if (state === 'ready') return 'ready';
  const isCompare = contentJson.inputMode === 'compare' || Boolean(contentJson.compareCandidates?.length);
  if (isCompare) return 'compare';
  const hasChoice =
    Boolean(contentJson.choiceQuestion?.options?.length) || Boolean(contentJson.ui?.options?.length);
  if (hasChoice) return 'decision';
  return 'collecting';
};

const getMessageDisplayText = (msg: ChatMessage) => {
  if (msg.role === 'user') {
    if (msg.contentText) return msg.contentText;
    const selectionDisplay = formatSelectionDisplay(msg.content || '');
    return selectionDisplay || msg.content || '';
  }
  const contentJson = (msg.contentJson ?? msg.payload?.assistantReply ?? null) as EventAssistantReply | null;
  const normalizedContent = normalizeSelectionTokenForAssistant(msg.content || '');
  const questionText = contentJson?.ui?.question?.text;
  if (questionText && msg.content === questionText) {
    const key = contentJson?.ui?.question?.key;
    if (key === 'title') return 'イベントのタイトルを教えてください';
    return msg.content;
  }
  if (contentJson && msg.type === 'text') {
    const uiMessage = contentJson.ui?.message;
    if (uiMessage && msg.content === uiMessage) {
      return normalizeSelectionTokenForAssistant(msg.content || '');
    }
    const phase = resolvePhaseForMessage(msg);
    return pickPhaseMessage(phase, contentJson.turnCount);
  }
  const fallback =
    getAssistantDisplay({
      content: normalizedContent,
      contentText: msg.contentText,
      contentJson: msg.contentJson ?? msg.payload?.assistantReply ?? null,
      payload: msg.payload?.assistantReply ? { assistantReply: msg.payload.assistantReply } : undefined,
    }).text || msg.contentText || '';
  if (!isCommitted.value && /(決まりました|確定しました|以下の内容で進めます|完成しました|準備が整いました)/.test(fallback)) {
    return pickPhaseMessage('collecting', 0);
  }
  return fallback;
};

const isInProgressStatus = (status?: string | null) => {
  if (!status) return true;
  return status !== 'completed' && status !== 'ready';
};

const explainLabels = computed(() => {
  switch (explainLanguage.value) {
    case 'zh':
      return { continue: '继续创建活动', back: '返回' };
    case 'en':
      return { continue: 'Continue creating', back: 'Back' };
    default:
      return { continue: 'イベント作成を続ける', back: 'やめる / 戻る' };
  }
});

const handleChipSelect = (template: string) => {
  if (!template) return;
  if (!chatDraft.value.trim()) {
    chatDraft.value = template;
  } else {
    chatDraft.value = `${chatDraft.value.trim()} ${template}`;
  }
  nextTick(resizeChatInput);
};

const handleExplainContinue = async () => {
  if (aiLoading.value) return;
  explainMode.value = false;
  const payload = '【選択】interrupt:continue';
  pushMessage(
    'user',
    'text',
    payload,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { contentText: explainLabels.value.continue },
  );
  await requestAssistantReply(payload, { action: 'resume_collecting' });
};

const handleExplainBack = () => {
  explainMode.value = false;
  goBack();
};

const handleChoiceSelect = async (key: string, value: string) => {
  if (!key || !value || aiLoading.value) return;
  // consume ready_next_action on client without发消息
  if (key === 'ready_next_action') {
    lastQuestionKeyPending.value = false;
    if (value === 'preview') {
      if (lastReadyDraft.value) {
        openPlanPreview(lastReadyDraft.value as GeneratedEventContent);
      }
      return;
    }
    if (value === 'manual') {
      goToForm(false);
      return;
    }
  }
  autoScrollEnabled.value = true;
  const label = choiceQuestionState.value?.options.find((opt) => opt.value === value)?.label;
  storeConfirmedAnswer(key, label ?? value);
  const payload = `【選択】${key}:${value}`;
  const displayText =
    key === 'interrupt'
      ? `次の操作を「${label ?? value}」にしました`
      : buildChoiceDisplayText(key, value, label);
  pushMessage(
    'user',
    'text',
    payload,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { contentText: displayText },
  );
  lastQuestionKeyPending.value = false;
  if (key === 'interrupt' && value === 'preview') {
    openMilestonePreview();
  }
  if (key === 'interrupt' && value === 'manual') {
    goToForm(false);
  }
  choiceQuestionState.value = null;
  showCandidateDetails.value = false;
  await requestAssistantReply(payload);
};

const handleSkipCompare = async () => {
  if (aiLoading.value) return;
  const payload = 'どれでもないので続けます';
  pushMessage('user', 'text', payload, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
    contentText: payload,
  });
  compareCandidatesState.value = null;
  showCandidateDetails.value = false;
  choiceQuestionState.value = null;
  showCandidateDetails.value = false;
  await requestAssistantReply(payload);
};

const handleCommitDraft = async () => {
  if (aiLoading.value || !lastDraftReady.value) return;
  const content = 'この内容で作成する';
  if (!lastDraftId.value) {
    toast.show('下書きを確認しています。少し待ってもう一度お試しください。', 'info');
  }
  isCommitted.value = true;
  pushMessage('user', 'text', content);
  openMilestonePreview();
  await requestAssistantReply(content, { action: 'confirm_draft' });
};

const handleCommitEdit = async () => {
  if (aiLoading.value) return;
  isCommitted.value = false;
  const content = 'もう少し直す';
  pushMessage('user', 'text', content);
  await requestAssistantReply(content, { action: 'continue_edit' });
  nextTick(() => {
    chatInputRef.value?.focus();
  });
};

const openMilestonePreview = () => {
  const proposal = [...chatMessages.value].reverse().find((msg) => msg.type === 'proposal' && msg.payload?.raw);
  if (proposal?.payload?.raw) {
    openPlanPreview(proposal.payload.raw);
    return;
  }
  if (aiResult.value) {
    openPlanPreview(aiResult.value);
    return;
  }
  if (lastReadyDraft.value) {
    openPlanPreview(
      buildProposalFromDraft(lastReadyDraft.value, buildQaSummary('')),
    );
    return;
  }
  toast.show('下書きがまだありません。', 'info');
};

const computeQuestionIndexFromQaState = () => {
  let filled = 0;
  if (qaState.topic) filled += 1;
  if (qaState.details) filled += 1;
  return Math.min(filled, questions.length);
};

const resetQaState = () => {
  qaState.baseLanguage = profileDefaults.value.baseLanguage;
  qaState.topic = '';
  qaState.audience = '';
  qaState.style = '';
  qaState.details = '';
  lastExpertComment.value = null;
  explainMode.value = false;
  explainLanguage.value = 'ja';
  Object.keys(confirmedAnswers).forEach((key) => {
    delete confirmedAnswers[key];
  });
  currentSlotKey.value = null;
};

const closeActiveSession = async () => {
  if (!communityId.value || !activeLogId.value) return;
  try {
    await saveEventAssistantLog(communityId.value, {
      stage: currentStage.value,
      summary: buildQaSummary(),
      qaState: JSON.parse(JSON.stringify(qaState)),
      messages: [],
      aiResult: null,
      status: 'completed',
      promptVersion: lastPromptVersion.value,
      turnCount: lastTurnCount.value,
      language: lastLanguage.value,
      logId: activeLogId.value,
    });
  } catch (err) {
    console.warn('Failed to close active assistant session', err);
  }
};

const restoreFromLog = (log: ConsoleEventAssistantLog, source: 'server' | 'cache' = 'server') => {
  const mappedMessages: ChatMessage[] = (log.messages || [])
    .filter((msg) => {
      const role = (msg as any).role;
      const content = (msg as any).content || '';
      if (role === 'assistant' && LEGACY_INTRO_MESSAGES.has(content)) return false;
      return true;
    })
    .map((msg) => ({
      id: (msg as any).id || (msg as any).clientMessageId || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      clientMessageId: (msg as any).clientMessageId || (msg as any).id,
      role: (msg as any).role === 'assistant' ? 'assistant' : 'user',
      type: (msg as any).type === 'proposal' ? 'proposal' : 'text',
      action: (msg as any).action ?? undefined,
      messageSource: (msg as any).messageSource ?? undefined,
      contentText: (msg as any).contentText ?? (msg as any).content ?? '',
      contentJson: (msg as any).contentJson ?? (msg as any).payload?.assistantReply ?? null,
      content: (msg as any).content ?? '',
      createdAt:
        (msg as any).createdAt ||
        new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      serverCreatedAt: (msg as any).serverCreatedAt || null,
      thinkingSteps: (msg as any).thinkingSteps ?? undefined,
      coachPrompts: (msg as any).coachPrompts ?? undefined,
      editorChecklist: (msg as any).editorChecklist ?? undefined,
      writerSummary: (msg as any).writerSummary ?? undefined,
      confirmQuestions: (msg as any).confirmQuestions ?? undefined,
      payload:
        (msg as any).type === 'proposal' && (msg as any).payload
          ? {
              title: (msg as any).payload?.title ?? '',
              description: (msg as any).payload?.description ?? '',
              raw: (msg as any).payload?.raw ?? null,
              applyEnabled: (msg as any).payload?.applyEnabled ?? undefined,
              assistantReply: (msg as any).payload?.assistantReply ?? null,
            }
          : undefined,
      status: (msg as any).status ?? 'sent',
      includeInContext: (msg as any).includeInContext !== false,
    }));
  const hydratedMessages = mappedMessages.map((msg) => {
    if (msg.role !== 'user') return msg;
    if (msg.contentText && msg.contentText !== msg.content) return msg;
    const selectionDisplay = formatSelectionDisplay(msg.content || '');
    if (!selectionDisplay) return msg;
    return {
      ...msg,
      contentText: selectionDisplay,
    };
  });
  const sanitizedMessages: ChatMessage[] = hydratedMessages.map((msg) => {
    if (msg.role !== 'assistant' || msg.type !== 'text') return msg;
    if (msg.action && SAFE_ASSISTANT_ACTIONS.has(msg.action)) return msg;
    const derived = getAssistantDisplay({
      contentJson: msg.contentJson ?? msg.payload?.assistantReply ?? null,
    }).text;
    if (!derived) return msg;
    return {
      ...msg,
      content: derived,
      contentText: derived,
      action: 'system-safe',
      includeInContext: false,
    } as ChatMessage;
  });
  const hasRenderableAssistantMessage = sanitizedMessages.some(
    (msg) => msg.role === 'assistant' && (msg.type === 'proposal' || isSafeAssistantMessage(msg)),
  );
  const hasProposalMessage = sanitizedMessages.some((msg) => msg.type === 'proposal');
  if (!hasRenderableAssistantMessage) {
    const fallbackMeta = (log as any).meta ?? {};
    const fallbackText = getAssistantDisplay({
      contentJson: fallbackMeta.ui ? { ui: fallbackMeta.ui } : null,
    }).text;
    if (fallbackText && fallbackText.trim()) {
      sanitizedMessages.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: 'assistant',
        type: 'text',
        content: fallbackText,
        contentText: fallbackText,
        contentJson: fallbackMeta ?? null,
        action: 'system-safe',
        createdAt:
          (log as any).createdAt ||
          new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
        includeInContext: false,
        status: 'sent',
      });
    } else {
      sanitizedMessages.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: 'assistant',
        type: 'text',
        content: '以前のAI返信が保存されていなかったため、ここから再開します。',
        action: 'system-safe',
        createdAt:
          (log as any).createdAt ||
          new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
        includeInContext: false,
        status: 'sent',
      });
    }
  }
  // merge with existing (if any) by messageId/clientId, prefer restored data
  const mergedMap = new Map<string, ChatMessage>();
  const put = (m: ChatMessage) => {
    const key = m.id || m.clientMessageId || `${m.createdAt}-${m.content}`;
    mergedMap.set(key, m);
  };
  chatMessages.value.forEach((m) => put(m));
  sanitizedMessages.slice(-200).forEach((m) => put(m));
  chatMessages.value = Array.from(mergedMap.values())
    .sort((a, b) => {
      const ta = Date.parse(a.serverCreatedAt ?? a.createdAt ?? '');
      const tb = Date.parse(b.serverCreatedAt ?? b.createdAt ?? '');
      if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb;
      return (a.clientMessageId || a.id).localeCompare(b.clientMessageId || b.id);
    })
    .slice(-200);
  updateDebugCounts(source, chatMessages.value, log.messages);
  if (log.qaState) {
    qaState.baseLanguage = (log.qaState as any).baseLanguage || qaState.baseLanguage;
    qaState.topic = (log.qaState as any).topic || '';
    qaState.audience = (log.qaState as any).audience || '';
    qaState.style = (log.qaState as any).style || '';
    qaState.details = (log.qaState as any).details || '';
  }
  currentQuestionIndex.value = computeQuestionIndexFromQaState();
  lastAssistantStatus.value = (log.status as EventAssistantState) || 'collecting';
  lastPromptVersion.value = log.promptVersion || lastPromptVersion.value;
  lastTurnCount.value = log.turnCount || 0;
  lastLanguage.value = (log.language as string) || lastLanguage.value;
  activeLogId.value = log.id;
  if (!assistantSessionId.value) {
    assistantSessionId.value = log.id || createSessionId();
  }
  const restoredDraft = [...chatMessages.value]
    .reverse()
    .map((msg) => (msg.contentJson ?? (msg.payload as any)?.assistantReply ?? null) as Record<string, any> | null)
    .find((reply) => reply?.publicActivityDraft)?.publicActivityDraft;
  lastReadyDraft.value = restoredDraft ?? null;
  lastDraftReady.value = Boolean(restoredDraft);
  lastDraftId.value = restoredDraft ? (log.meta as any)?.draftId ?? null : null;
  lastInputMode.value = null;
  mode.value = (log.meta as any)?.mode === 'operate' ? 'operate' : 'chat';
  isCommitted.value = Boolean((log.meta as any)?.isCommitted) || hasProposalMessage;
  pendingQuestion.value = null;
  currentQuestionId.value = null;
  miniPreviewState.value = null;
  previewExpanded.value = false;
  choiceQuestionState.value = null;
  compareCandidatesState.value = null;
  showCandidateDetails.value = false;
  coachPromptState.value = null;
  const fromLog = (log.aiResult as any) ?? null;
  const cached = getCachedDraftForLog(log.id);
  const fallbackDraft =
    fromLog && typeof fromLog === 'object'
      ? (fromLog as GeneratedEventContent & { summary?: string })
      : cached;
  const hasDraftAnchorMessage = chatMessages.value.some(
    (msg) => msg.type === 'proposal' && msg.action === 'draft-anchor',
  );
  const visibility = evaluateDraftVisibility({
    hasDraftInMessages: Boolean(restoredDraft),
    hasLastReadyDraft: Boolean(lastReadyDraft.value),
    hasMvpDraft: isDraftMvp(lastReadyDraft.value ?? null),
    draftReadyForUi: Boolean(lastDraftReady.value && isDraftMvp(lastReadyDraft.value ?? null)),
  });
  if (visibility.shouldShowDraftAnchor && !hasDraftAnchorMessage) {
    if (fallbackDraft) {
      upsertDraftAnchor(fallbackDraft, log.id);
    } else if (lastReadyDraft.value) {
      upsertDraftAnchor(
        buildProposalFromDraft(lastReadyDraft.value, buildQaSummary('')),
        log.id,
      );
    }
  }
  logDraftVisibilityTrace('restore');
  scrollChatToBottom(true);
};

const updateDebugCounts = (
  source: 'server' | 'cache',
  messages: ChatMessage[],
  rawPayload?: unknown,
) => {
  if (!isDebugEnabled.value) return;
  const userCount = messages.filter((m) => m.role === 'user').length;
  const assistantCount = messages.filter((m) => m.role === 'assistant').length;
  let bytes: number | undefined;
  if (rawPayload !== undefined) {
    try {
      bytes = JSON.stringify(rawPayload).length;
    } catch {
      bytes = undefined;
    }
  }
  debugMessageCounts.value = {
    total: messages.length,
    user: userCount,
    assistant: assistantCount,
    source,
    bytes,
  };
  console.debug('[assistant] loaded messages', debugMessageCounts.value);
};

const logDraftVisibilityTrace = (label: string) => {
  if (!isEventAssistantDebug.value) return;
  const hasDraftInMessages = chatMessages.value.some((msg) => {
    const reply = msg.contentJson as { publicActivityDraft?: unknown } | null;
    return Boolean(reply?.publicActivityDraft);
  });
  const hasLastReadyDraft = Boolean(lastReadyDraft.value);
  const hasMvpDraft = isDraftMvp(lastReadyDraft.value ?? null);
  const draftReadyForUi = Boolean(lastDraftReady.value && hasMvpDraft);
  const visibility = evaluateDraftVisibility({
    hasDraftInMessages,
    hasLastReadyDraft,
    hasMvpDraft,
    draftReadyForUi,
  });
  const conversationId = assistantSessionId.value ?? null;
  console.info('[EventAssistant][debug]', {
    requestId: lastRequestId.value,
    conversationId,
    message: 'draft_visibility_trace',
    label,
    hasDraftInMessages,
    hasLastReadyDraft,
    hasMvpDraft,
    draftReadyForUi,
  });
  if (visibility.hasMismatch) {
    console.warn('[EventAssistant][warn]', {
      requestId: lastRequestId.value,
      conversationId,
      message: 'draft_visibility_mismatch',
      label,
      hasDraftInMessages,
      hasLastReadyDraft,
      hasMvpDraft,
      draftReadyForUi,
    });
  }
};

const tryResumeConversation = async (existingLogs?: ConsoleEventAssistantLog[]) => {
  if (!communityId.value || forceNewSession.value) return false;
  try {
    const logs = existingLogs ?? (await fetchEventAssistantLogs(communityId.value));
    const now = Date.now();
    const recentInProgress = logs
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
      const candidate = recentInProgress[0];
      if (communityId.value) {
        try {
          const fullLog = await fetchEventAssistantLog(communityId.value, candidate.id);
          restoreFromLog(fullLog);
          return true;
        } catch (err) {
          console.warn('Failed to fetch full log for resume', err);
        }
      }
      restoreFromLog(candidate, 'cache');
      return true;
    }
  } catch (err) {
    console.warn('Failed to resume assistant log', err);
  }
  return false;
};

const startNewConversation = () => {
  // mark previous in-progress log as completed to avoid auto-resume
  closeActiveSession();
  activeLogId.value = null;
  assistantSessionId.value = createSessionId();
  chatMessages.value = [];
  aiResult.value = null;
  pendingQuestion.value = null;
  currentQuestionId.value = null;
  currentQuestionIndex.value = 0;
  aiError.value = null;
  latestChecklist.value = [];
  latestConfirmQuestions.value = [];
  lastShownDraftId.value = null;
  seenDraftIds.value = [];
  lastMilestoneDraftId.value = null;
  lastMilestoneMessageId.value = null;
  lastDraftReady.value = false;
  lastDraftId.value = null;
  lastReadyDraft.value = null;
  lastInputMode.value = null;
  mode.value = 'chat';
  isCommitted.value = false;
  miniPreviewState.value = null;
  previewExpanded.value = false;
  choiceQuestionState.value = null;
  compareCandidatesState.value = null;
  showCandidateDetails.value = false;
  coachPromptState.value = null;
  resetQaState();
  chatDraft.value = '';
  // clear any sticky logId/newSession query to avoid unintended resume on refresh
  if (route.query.logId || route.query.newSession) {
    const nextQuery = { ...route.query };
    delete (nextQuery as any).logId;
    delete (nextQuery as any).newSession;
    router.replace({ query: nextQuery });
  }
  logDraftVisibilityTrace('init');
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
  if (typeof content !== 'object') return '';
  const original = typeof content.original === 'string' ? content.original : '';
  if (original.trim()) return original;
  const translations = content.translations;
  if (translations && typeof translations === 'object') {
    const preferred = content.lang ? (translations as any)[content.lang] : null;
    if (typeof preferred === 'string' && preferred.trim()) return preferred;
    const fallback = ['ja', 'zh', 'en']
      .map((key) => (translations as any)[key])
      .find((value) => typeof value === 'string' && value.trim());
    if (fallback) return fallback as string;
  }
  const direct = ['ja', 'zh', 'en']
    .map((key) => (content as any)[key])
    .find((value) => typeof value === 'string' && value.trim());
  return direct ? (direct as string) : '';
};

const goBack = () => {
  if (backTarget.value) {
    router.replace(backTarget.value);
    return;
  }
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

type UndoSnapshot = {
  formFields: Record<string, any>;
  description: string;
};
const lastUndoSnapshot = ref<UndoSnapshot | null>(null);

const goToForm = async (useAi: boolean) => {
  if (!communityId.value) return;
  const draftSource = useAi ? 'llm' : 'manual_form';
  let beforeSnapshot: Record<string, any> | null = null;
  try {
    const stored = sessionStorage.getItem(CONSOLE_AI_EVENT_DRAFT_KEY);
    beforeSnapshot = stored ? JSON.parse(stored) : null;
  } catch {
    beforeSnapshot = null;
  }
  if (useAi && aiResult.value) {
    const draft = aiResult.value;
    const fallbackDescription =
      extractText(draft.description) ||
      extractText(draft.notes) ||
      '';
    const fallbackLogistics =
      draft.logistics ?? null;
    const fallbackTickets =
      draft.ticketTypes && draft.ticketTypes.length
        ? draft.ticketTypes
        : [];
    const parsedCapacity = Number(draft.maxParticipants ?? draft.capacity ?? NaN);
    const payload = {
      title: extractText(draft.title),
      subtitle: extractText(draft.subtitle),
      description: fallbackDescription,
      notes: extractText(draft.notes),
      riskNotice: extractText(draft.riskNotice),
      logistics: fallbackLogistics,
      ticketTypes: fallbackTickets,
      requirements: draft.requirements ?? [],
      registrationForm: draft.registrationForm ?? [],
      maxParticipants: Number.isFinite(parsedCapacity) ? parsedCapacity : undefined,
      visibility: draft.visibility ?? 'public',
      checklist: latestChecklist.value,
      confirmQuestions: latestConfirmQuestions.value,
      generatedAt: Date.now(),
    };
    try {
      sessionStorage.setItem(CONSOLE_AI_EVENT_DRAFT_KEY, JSON.stringify(payload));
    } catch {
      // ignore session storage failure
    }
    try {
      localStorage.setItem(CONSOLE_AI_EVENT_DRAFT_KEY, JSON.stringify(payload));
    } catch {
      // ignore local storage failure
    }
    if (isEventAssistantDebug.value) {
      console.info('[EventAssistant][trace]', {
        requestId: lastRequestId.value,
        conversationId: assistantSessionId.value ?? null,
        messageId: null,
        event: 'form_write',
        source: draftSource,
        before: beforeSnapshot,
        after: payload,
      });
    }
  } else {
    sessionStorage.removeItem(CONSOLE_AI_EVENT_DRAFT_KEY);
    try {
      localStorage.removeItem(CONSOLE_AI_EVENT_DRAFT_KEY);
    } catch {
      // ignore local storage failure
    }
    if (isEventAssistantDebug.value) {
      console.info('[EventAssistant][trace]', {
        requestId: lastRequestId.value,
        conversationId: assistantSessionId.value ?? null,
        messageId: null,
        event: 'form_write',
        source: draftSource,
        before: beforeSnapshot,
        after: null,
      });
    }
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
  isLoadingLog.value = true;
  await loadProfileDefaults();
  await communityStore.loadCommunities();
  if (communityId.value) {
    communityStore.setActiveCommunity(communityId.value);
  }
  loadHistoryEntries();
  await loadActiveCommunityDetail();
  // If opened from history, set back target to console home
  if (route.query.logId || route.query.source === 'history') {
    backTarget.value = { name: 'ConsoleMobileHome' };
  } else {
    backTarget.value = null;
  }
  let restored = false;
  let cachedLogs: ConsoleEventAssistantLog[] | null = null;
  if (!forceNewSession.value && communityId.value) {
    try {
      cachedLogs = await fetchEventAssistantLogs(communityId.value);
    } catch (err) {
      console.warn('Failed to fetch assistant logs for restore', err);
      cachedLogs = null;
    }
  }
  if (!forceNewSession.value && requestedLogId.value) {
    let target =
      cachedLogs?.find((log) => log.id === requestedLogId.value) ??
      (await (async () => {
        if (!communityId.value) return null;
        try {
          const logs = cachedLogs ?? (await fetchEventAssistantLogs(communityId.value));
          return logs.find((log) => log.id === requestedLogId.value) ?? null;
        } catch (err) {
          console.warn('Failed to restore assistant log by id', err);
          return null;
        }
      })());
    if (communityId.value && requestedLogId.value) {
      try {
        target = await fetchEventAssistantLog(communityId.value, requestedLogId.value);
      } catch (err) {
        console.warn('Failed to fetch full assistant log', err);
      }
    }
    if (target) {
      restoreFromLog(target);
      restored = true;
    }
  }
  if (!restored) {
    const resumed = await tryResumeConversation(cachedLogs ?? undefined);
    if (!resumed) {
      startNewConversation();
    }
  }
  isLoadingLog.value = false;
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
      if (!viewport) return;
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
  background: #f7f7f8;
  color: #111827;
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
  background: #f7f7f8;
  display: flex;
  flex-direction: column;
}

.top-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: calc(env(safe-area-inset-top, 0px) + 6px) 12px 8px;
  z-index: 36;
}

.new-session-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: #6b7280;
  border-radius: 999px;
  padding: 0;
  box-shadow: none;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.history-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: #6b7280;
  border-radius: 999px;
  padding: 0;
  box-shadow: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.chat-surface {
  flex: 1;
  min-height: 0;
  background: #f7f7f8;
}

.guide-line {
  font-size: 12px;
  color: #6b7280;
  background: transparent;
  border-radius: 0;
  padding: 0;
  margin: 0 0 4px;
}

.chat-log {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 128px;
  box-sizing: border-box;
}

.intro-card {
  background: #f8fafc;
  border-radius: 14px;
  padding: 12px 14px;
  margin: 4px 0 18px;
  box-shadow: none;
  border: 1px solid rgba(148, 163, 184, 0.4);
  color: #111827;
  cursor: pointer;
}

.intro-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.intro-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.intro-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.intro-positioning {
  margin: 0;
  font-size: 12px;
  color: #1f2937;
  font-weight: 600;
}
.intro-action {
  margin: 0;
  font-size: 12px;
  color: #111827;
}
.intro-action-sub {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
.intro-main-example {
  margin-top: 4px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 13px;
  color: #111827;
  text-align: left;
}
.intro-expanded {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.intro-expander {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #94a3b8;
}
.intro-expander-line {
  display: block;
  width: 40%;
  height: 2px;
  border-radius: 999px;
  background: #e2e8f0;
}
.intro-expander-text {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.intro-expander-icon {
  width: 18px;
  height: 18px;
  transition: transform 0.2s ease;
}
.intro-expander-icon.is-open {
  transform: rotate(180deg);
}
.intro-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.intro-section-title {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}
.intro-list {
  margin: 0;
  padding-left: 14px;
  font-size: 12px;
  color: #475569;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.intro-list--muted {
  color: #64748b;
}
.intro-unknown {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
.intro-template {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  padding: 8px 10px;
  border-radius: 10px;
  background: #f1f5f9;
  text-align: center;
}
.intro-details-toggle {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 12px;
  color: #475569;
  text-align: left;
}
.intro-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.chip {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  color: #111827;
  cursor: pointer;
}

.chip--recommended {
  border-color: #d1d5db;
  background: #f3f4f6;
  color: #111827;
}

.mini-preview-card {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 14px;
  padding: 12px;
  font-size: 13px;
  color: #111827;
}

.mini-preview-toggle {
  display: flex;
  justify-content: flex-start;
}

.mini-preview-toggle-btn {
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 12px;
  padding: 0;
}

.mini-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.mini-preview-title {
  font-weight: 700;
  margin: 0;
  font-size: 13px;
}

.mini-preview-close {
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 12px;
  padding: 0;
}

.mini-preview-list {
  list-style: none;
  padding: 0;
  margin: 0 0 6px;
}

.mini-preview-list li {
  margin-bottom: 4px;
}

.mini-preview-note {
  font-size: 12px;
  color: #6b7280;
  margin: 0;
}


.choice-block {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 14px;
  padding: 10px 12px;
}

.choice-context {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 6px;
  color: #111827;
}

.choice-prompt {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 8px;
}

.choice-note {
  font-size: 12px;
  color: #6b7280;
  margin: 0 0 8px;
}

.choice-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.explain-actions {
  display: grid;
  gap: 10px;
  margin: 12px 0 8px;
}

.explain-button {
  appearance: none;
  border: 1px solid #d7dde5;
  background: #fff;
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 600;
  color: #2f3b4a;
}

.explain-button.primary {
  background: #1f2d3d;
  border-color: #1f2d3d;
  color: #fff;
}

.decision-block {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 14px;
  padding: 12px;
}

.decision-title {
  font-weight: 700;
  font-size: 14px;
  margin: 0 0 6px;
}

.decision-note {
  font-size: 12px;
  color: #6b7280;
  margin: 0 0 10px;
}

.decision-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.decision-toggle {
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 12px;
  padding: 0;
  cursor: pointer;
}

.candidate-details {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.candidate-detail-card {
  text-align: left;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 12px;
  padding: 10px 12px;
}

.candidate-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.candidate-tag {
  font-size: 11px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 999px;
}

.candidate-title {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.candidate-badge {
  font-size: 11px;
  color: #111827;
  border: 1px solid #e5e7eb;
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 999px;
}

.candidate-meta {
  list-style: none;
  padding: 0;
  margin: 0 0 6px;
  color: #6b7280;
  font-size: 12px;
}

.candidate-meta li {
  margin-bottom: 2px;
}

.candidate-summary {
  margin: 0 0 6px;
  font-size: 12px;
  color: #6b7280;
}

.decision-actions {
  margin-top: 8px;
}

.decision-secondary {
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 12px;
  padding: 0;
  cursor: pointer;
}

.choice-helper {
  font-size: 12px;
  color: #6b7280;
  margin: 6px 0 0;
}

.coach-prompt {
  font-size: 12px;
  color: #6b7280;
  margin: 4px 0 6px;
}

.commit-block {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 14px;
  padding: 12px;
}

.draft-summary {
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.draft-summary-title {
  margin: 0 0 8px;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6b7280;
}

.draft-summary-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 6px 10px;
  color: #111827;
  font-size: 12px;
}

.draft-summary-list strong {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  color: #6b7280;
  margin-bottom: 2px;
}

.draft-expert {
  margin-top: 10px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 8px;
  font-size: 12px;
  color: #4b5563;
}

.draft-expert summary {
  cursor: pointer;
  font-weight: 600;
  color: #111827;
  list-style: none;
}

.draft-expert summary::-webkit-details-marker {
  display: none;
}

.draft-expert p {
  margin: 6px 0 0;
  white-space: pre-wrap;
}

.commit-helper {
  margin: 0 0 4px;
  font-size: 12px;
  color: #6b7280;
}

.commit-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 10px;
  color: #111827;
}

.commit-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.commit-preview {
  width: 100%;
  border: 1px dashed #d1d5db;
  background: #f9fafb;
  color: #111827;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.commit-note {
  margin: 8px 0 10px;
  font-size: 12px;
  color: #6b7280;
}

.commit-primary {
  border: none;
  background: #111827;
  color: #ffffff;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.commit-secondary {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #111827;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}


.entry-bar {
  margin: 0 14px 8px;
  padding: 6px 10px;
  background: #ffffff;
  border-radius: 10px;
  text-align: center;
  border: 1px solid #e5e7eb;
}

.entry-button {
  background: transparent;
  border: none;
  color: #111827;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.new-session-btn.is-disabled {
  opacity: 0.5;
  pointer-events: none;
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

.intro-eyebrow {
  font-size: 12px;
  color: #6b7280;
  margin: 0 0 4px;
}

.intro-title {
  font-size: 17px;
  font-weight: 700;
  margin: 0 0 8px;
}

.intro-desc {
  font-size: 14px;
  line-height: 1.6;
  color: #374151;
  margin: 0 0 10px;
}

.intro-list {
  list-style: none;
  padding: 0;
  margin: 0;
  color: #4b5563;
  font-size: 13px;
  line-height: 1.5;
}

.chat-bubble {
  max-width: 78%;
  padding: 10px 12px;
  border-radius: 18px;
  box-sizing: border-box;
  word-break: break-word;
  box-shadow: none;
}

.chat-bubble--assistant {
  align-self: flex-start;
  background: transparent;
  border: none;
  padding: 4px 0;
  max-width: 100%;
}

.chat-bubble.is-current-question {
  border-color: transparent;
  box-shadow: none;
}

.chat-bubble.is-previous {
  opacity: 0.85;
}

.chat-bubble--assistant.chat-bubble--typing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
}

.chat-bubble--assistant.chat-bubble--error {
  border-color: rgba(239, 68, 68, 0.4);
  background: #fef2f2;
  color: #b91c1c;
}

.chat-bubble--user {
  align-self: flex-end;
  background: #f2f3f5;
  color: #111827;
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
  color: #111827;
  font-weight: 600;
  font-size: 13px;
  padding: 0;
  text-decoration: underline;
}

.chat-follow-up {
  padding: 10px 12px;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
}

.follow-up-label {
  margin: 0 0 4px;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: #6b7280;
  text-transform: uppercase;
}

.follow-up-text {
  margin: 0;
  font-weight: 700;
  color: #111827;
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
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  padding: 10px 12px;
}

.hint-toggle {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: none;
  background: transparent;
  color: #6b7280;
  font-weight: 600;
  padding: 0;
}

.hint-toggle__state {
  font-size: 12px;
  color: #6b7280;
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
  color: #111827;
  font-size: 14px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #9ca3af;
  margin-top: 6px;
  flex-shrink: 0;
}

.proposal-bubble {
  background: #ffffff;
  border: 1px solid #e5e7eb;
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
  color: #111827;
  font-size: 15px;
}

.proposal-desc {
  margin: 0;
  color: #374151;
  white-space: pre-line;
  line-height: 1.55;
}

.proposal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.question-helper {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.04);
  border: 1px dashed rgba(148, 163, 184, 0.6);
  font-size: 12px;
  color: #475569;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.question-helper-title {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: #64748b;
  text-transform: uppercase;
}
.question-helper-list {
  margin: 0;
  padding-left: 16px;
}
.question-helper-foot {
  margin: 0;
  color: #64748b;
}
.question-helper-action {
  align-self: flex-start;
  border: 1px solid #cbd5f5;
  background: #eef2ff;
  color: #3730a3;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
}

.ghost-link {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #111827;
  border-radius: 999px;
  padding: 6px 12px;
  font-weight: 600;
}

.chat-meta {
  display: none;
}

.typing-dot {
  width: 8px;
  height: 8px;
  border-radius: 10px;
  background: #9ca3af;
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
  background: #f7f7f8;
  border-top: 1px solid #e5e7eb;
  box-shadow: none;
  transform: translateY(calc(var(--keyboard-offset, 0px) * -1));
  transition: transform 0.2s ease;
}

.input-shell {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: none;
}

.chat-input {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 15px;
  color: #111827;
  resize: none;
  line-height: 1.5;
  max-height: 96px;
  overflow-y: hidden;
}

.chat-input::placeholder {
  color: #9ca3af;
}

.chat-input:focus {
  outline: none;
}

.chat-send {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  border: none;
  background: #111827;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
}

.chat-send-icon {
  width: 20px;
  height: 20px;
  display: block;
}

.chat-send:disabled {
  opacity: 0.4;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.plan-preview-close-icon {
  line-height: 1;
}

.plan-preview-scroll {
  overflow-y: auto;
  padding-right: 4px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
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

.plan-preview-actions {
  display: grid;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}
.preview-primary,
.preview-secondary,
.preview-ghost {
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  padding: 10px 12px;
  cursor: pointer;
}
.preview-primary {
  border: none;
  background: #111827;
  color: #ffffff;
}
.preview-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.preview-secondary {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #111827;
}
.preview-ghost {
  border: 1px dashed #e5e7eb;
  background: #ffffff;
  color: #6b7280;
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
