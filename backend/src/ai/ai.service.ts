import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import crypto from 'crypto';
import { EventAssistantPromptPhase, getEventAssistantPromptConfig, PromptDefaultsProfile } from './prompt.config';
import { determinePromptPhase, enforcePhaseOutput } from './assistant-phase.guard';
import { getEventAssistantOutputSchema, validateAssistantOutput } from './event-assistant.schemas';
import { buildSlotNormalizerPrompt, SlotNormalizerResult } from './slot-normalizer';
import { RouterResult, buildRouterPrompt } from './router-llm';
import { PrismaService } from '../prisma/prisma.service';
import { PromptStoreService } from './prompt-store.service';
import { analyzeFailures } from './diagnostics/failures';
import { redactTurnLog, writeTurnLog } from './diagnostics/logger';
import type {
  EventAssistantPromptPhase as DiagnosticPromptPhase,
  EventAssistantTurnLog,
  EventAssistantUiAction,
} from './diagnostics/types';

export interface GenerateEventContentDto {
  baseLanguage: string;
  topic: string;
  audience: string;
  style: string;
  details: string;
  titleSeed?: string;
}

export interface AiLocalizedField {
  original: string;
  lang: string;
  translations: Record<string, string>;
}

export interface AiEventContent {
  title: AiLocalizedField;
  subtitle?: AiLocalizedField;
  description: AiLocalizedField;
  notes: AiLocalizedField;
  riskNotice: AiLocalizedField;
  snsCaptions: {
    line: Record<string, string>;
    instagram: Record<string, string>;
  };
  logistics?: {
    startTime?: string;
    endTime?: string;
    locationText?: string;
    locationNote?: string;
  };
  ticketTypes?: Array<{
    name: string;
    price: number;
    currency?: string;
    quota?: number | null;
    type?: string;
  }>;
  requirements?: Array<{ label: string; type?: 'must' | 'nice-to-have' }>;
  registrationForm?: Array<{ label: string; type: string; required?: boolean }>;
  visibility?: 'public' | 'community' | 'private';
}

export interface AssistantConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateAssistantReplyDto extends GenerateEventContentDto {
  conversation?: AssistantConversationMessage[];
  action?: 'confirm_draft' | 'continue_edit' | 'resume_collecting';
  uiAction?: EventAssistantUiAction;
  uiMode?: 'explain' | 'collecting';
  requestId?: string;
  conversationId?: string;
  messageId?: string;
  clientLocale?: string;
  clientTimezone?: string;
}

export type AssistantReplyState = 'collecting' | 'options' | 'ready';
export type AssistantIntent = 'create' | 'explore' | 'unknown';
export type AssistantInputMode = 'describe' | 'fill' | 'compare';

export type AssistantStage = 'coach' | 'editor' | 'writer';

export interface AiAssistantOption {
  title: string;
  description?: string;
  pros?: string;
  cons?: string;
}

export interface AiAssistantMiniPreview {
  bullets: string[];
  note?: string;
}

export interface AiAssistantUiQuestion {
  key: keyof Slots;
  text: string;
}

export interface AiAssistantUiOption {
  label: string;
  value: string;
  recommended?: boolean;
}

export interface AiAssistantUiPayload {
  message?: string;
  question?: AiAssistantUiQuestion;
  options?: AiAssistantUiOption[];
  mode?: 'explain' | 'collecting' | 'decision';
}

export interface AiAssistantQuestionMeta {
  key: keyof Slots;
  exampleLines: string[];
}

export interface AiAssistantChoiceQuestion {
  key: keyof Slots | `confirm_${keyof Slots}`;
  prompt: string;
  options: Array<{ label: string; value: string; recommended?: boolean }>;
}

export interface AiAssistantCompareCandidate {
  id: string;
  summary: string;
  time?: string;
  price?: string;
  notes?: string;
}

export interface AiAssistantPublicDraft {
  title?: string;
  shortDescription?: string;
  detailedDescription?: string;
  ageRange?: string;
  highlights?: string[];
  schedule?: { date?: string; duration?: string; location?: string; startTime?: string; endTime?: string };
  price?: number | string | null;
  capacity?: number | string | null;
  signupNotes?: string;
  registrationForm?: Array<{ label: string; type: string; required?: boolean }>;
  visibility?: string;
  requireApproval?: boolean;
  enableWaitlist?: boolean;
  requireCheckin?: boolean;
  refundPolicy?: string;
  riskNotice?: string;
  expertComment?: string;
  facts_from_user?: Record<string, unknown>;
  assumptions?: Array<{ field: string; assumedValue: string; reason: string }>;
  open_questions?: Array<{ field: string; question: string }>;
  form_fields_payload?: Slots;
  rich_description_payload?: { short: string; long: string };
}

export interface AiAssistantExecutionPlan {
  objective?: string;
  coreExperienceDesign?: string;
  runOfShow?: string[];
  materials?: string[];
  staffing?: string[];
  risksAndMitigation?: string[];
  prepChecklist?: string[];
}

export type Slots = {
  title?: string;
  time?: string;
  location?: string;
  price?: string;
  capacity?: string;
  details?: string;
  visibility?: string;
  registrationForm?: string;
  requireApproval?: string;
  enableWaitlist?: string;
  requireCheckin?: string;
  refundPolicy?: string;
  riskNotice?: string;
};

export const detectUnsupportedCurrencyInput = (text: string) =>
  /元/.test(text) && !/円/.test(text) && !/日元/.test(text);

export const extractTokyoStartTimeIso = (text: string) => {
  if (!text) return null;
  const dateMatch =
    text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/) ||
    text.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  const timeMatch = text.match(/(\d{1,2})[:：](\d{2})/);
  if (!dateMatch || !timeMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }
  const utc = new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0));
  return utc.toISOString();
};

const normalizePriceAnswer = (text: string): string | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/無料|フリー|タダ|free|0円|0元/i.test(trimmed)) return '無料';
  const currencyMatch = trimmed.match(
    /(\d{1,5})\s*(円|日元|元)(?:\/人|\/名|\/per|\/person|\s*一人)?/,
  );
  if (currencyMatch?.[1]) return `${currencyMatch[1]}円`;
  const numberOnly = trimmed.match(/^\d{1,5}$/);
  if (numberOnly?.[0]) return `${numberOnly[0]}円`;
  return null;
};

const normalizeVisibilityAnswer = (text: string): string | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/招待|招待制|邀请/.test(trimmed)) return '招待制';
  if (/限定|コミュニティ内|メンバー限定/.test(trimmed)) return 'コミュニティ内限定';
  if (/非公開|プライベート|private|秘密/i.test(trimmed)) return '非公開';
  if (/公開|public/i.test(trimmed)) return '公開';
  return null;
};

const normalizeToggleAnswer = (text: string): string | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/あり|有効|オン|する|必要|必須|ありにする/i.test(trimmed)) return '有効';
  if (/なし|不要|無効|オフ|しない|不要です|不要だ/i.test(trimmed)) return '無効';
  return null;
};

const normalizeRegistrationFormAnswer = (text: string): string | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/未定|おまかせ|任せる|不要|なし|不要です|不要だ/i.test(trimmed)) return trimmed;
  const fields: string[] = [];
  if (/氏名|名前|お名前/.test(trimmed)) fields.push('氏名');
  if (/電話|携帯/.test(trimmed)) fields.push('電話番号');
  if (/メール|メールアドレス/.test(trimmed)) fields.push('メール');
  if (/住所/.test(trimmed)) fields.push('住所');
  if (/年齢/.test(trimmed)) fields.push('年齢');
  if (/性別/.test(trimmed)) fields.push('性別');
  if (/チケット|プラン/.test(trimmed)) fields.push('チケットプラン');
  if (fields.length) return fields.join(', ');
  return trimmed;
};

const normalizeLocationAnswer = (text: string): string | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/オンライン|zoom|teams|google meet|line/i.test(trimmed)) return 'オンライン';
  return trimmed;
};

const normalizeTimeAnswer = (text: string): string | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const timeRange = trimmed.match(/\d{1,2}[:：]\d{2}\s*[-〜~]\s*\d{1,2}[:：]\d{2}/);
  if (timeRange?.[0]) return timeRange[0];
  const cnRange = trimmed.match(/(\d{1,2})\s*点\s*(半|\d{1,2}\s*分)?.*(\d{1,2})\s*点/);
  if (cnRange?.[0]) return cnRange[0];
  return trimmed;
};

const isSafeTitleSuggestion = (title: string, rawInput: string) => {
  const trimmed = title.trim();
  if (trimmed.length < 4 || trimmed.length > 40) return false;
  if (trimmed === rawInput.trim()) return false;
  const hasTimeToken =
    /\d{1,2}[:：]\d{2}/.test(trimmed) ||
    /\d{1,2}月\d{1,2}日/.test(trimmed) ||
    /来週|今週|次の週|曜日|午前|午後|夜/.test(trimmed);
  if (hasTimeToken) return false;
  const overlap = rawInput && rawInput.includes(trimmed);
  if (overlap && rawInput.length / trimmed.length > 1.5) return false;
  return true;
};

export const buildFallbackQuestionText = (key?: keyof Slots | null) => {
  switch (key) {
    case 'price':
      return '参加費はいくらですか？（例：1000円 / 無料）';
    case 'time':
      return '開催日時を教えてください。';
    case 'location':
      return '開催場所を教えてください。オンラインでもOKです。';
    case 'title':
      return 'イベントのタイトルを教えてください。';
    case 'details':
      return 'イベントの内容や雰囲気を教えてください。';
    case 'capacity':
      return '定員はどれくらいですか？';
    case 'visibility':
      return '公開範囲はどうしますか？（例：公開 / 招待制）';
    case 'registrationForm':
      return '申込フォームで集めたい項目を教えてください。（例：氏名・電話・メール）';
    case 'requireApproval':
      return '参加承認は必要ですか？（例：承認あり / なし）';
    case 'enableWaitlist':
      return 'キャンセル待ちは有効にしますか？（例：有効 / 無効）';
    case 'requireCheckin':
      return 'チェックイン（検票）は必要ですか？（例：有効 / 無効）';
    case 'refundPolicy':
      return '返金ポリシーを教えてください。（例：3日前まで全額返金）';
    case 'riskNotice':
      return '注意事項や持ち物を教えてください。';
    default:
      return '続けて教えてください。';
  }
};

const buildConfirmPrompt = (key: keyof Slots, value: string) => {
  const label = SLOT_LABELS[key] ?? '';
  const safeValue = value.trim();
  if (label && safeValue) return `${label}は「${safeValue}」でよいですか？`;
  if (label) return `${label}はこの内容でよいですか？`;
  return 'この内容でよいですか？';
};

const SLOT_LABELS: Partial<Record<keyof Slots, string>> = {
  title: 'タイトル',
  time: '開催日時',
  location: '開催場所',
  price: '参加費',
  capacity: '定員',
  details: '内容',
  visibility: '公開範囲',
  registrationForm: '申込フォーム',
  requireApproval: '参加承認',
  enableWaitlist: 'キャンセル待ち',
  requireCheckin: 'チェックイン',
  refundPolicy: '返金ポリシー',
  riskNotice: '注意事項',
};

const FREE_TEXT_SLOTS = new Set<keyof Slots>(['title', 'details', 'refundPolicy', 'riskNotice']);

const isLikelyPriceFreeText = (text: string) => {
  return (
    /[0-9]/.test(text) ||
    /円|¥|￥|元|無料|free/i.test(text) ||
    /プラン|套餐|A套餐|B套餐|コース|チケット|プランA|プランB/i.test(text)
  );
};

export const isLikelyAnswerForSlot = (key: keyof Slots, text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (FREE_TEXT_SLOTS.has(key)) return true;
  switch (key) {
    case 'price':
      return Boolean(normalizePriceAnswer(trimmed)) || isLikelyPriceFreeText(trimmed);
    case 'time':
      return (
        Boolean(extractTokyoStartTimeIso(trimmed)) ||
        /(\d{1,2}[:：]\d{2}|\d{1,2}月\d{1,2}日|今週|来週|曜日|午前|午後|本日|今日|明日|今夜|夜)/.test(
          trimmed,
        )
      );
    case 'location':
      if (/オンライン|zoom|teams|google meet|line/i.test(trimmed)) return true;
      return (
        /都|道|府|県|市|区|町|村|駅|公園|会場|住所|ホール|センター|キャンパス|広場|体育館|カフェ|レストラン|ホテル|スタジオ|寺|神社|河川|公民館/.test(
          trimmed,
        ) || /[0-9]+\s*丁目|[0-9]+-[0-9]+/.test(trimmed)
      );
    case 'capacity':
      return /\d/.test(trimmed);
    case 'visibility':
      return Boolean(normalizeVisibilityAnswer(trimmed));
    case 'registrationForm':
      return Boolean(normalizeRegistrationFormAnswer(trimmed));
    case 'requireApproval':
    case 'enableWaitlist':
    case 'requireCheckin':
      return Boolean(normalizeToggleAnswer(trimmed));
    case 'title':
      return trimmed.length >= 3;
    case 'details':
      return trimmed.length >= 5;
    case 'refundPolicy':
    case 'riskNotice':
      return trimmed.length >= 5;
    default:
      return true;
  }
};

export const buildUnrelatedAnswerMessage = (key?: keyof Slots | null) => {
  if (!key) return '今は回答を確認しています。';
  const label = SLOT_LABELS[key] || 'この項目';
  const question = buildFallbackQuestionText(key);
  const meta = buildQuestionMeta(key);
  const examples = meta?.exampleLines?.length ? `例: ${meta.exampleLines.join(' / ')}` : '';
  const suffix = examples ? `\n${examples}` : '';
  return `今は「${label}」を確認しています。${question}${suffix}\n難しければ「スキップ」も選べます。`;
};

const buildUnrelatedAnswerMessageByLanguage = (key: keyof Slots | null) => {
  return buildUnrelatedAnswerMessage(key);
};

const QUESTION_META_BY_KEY: Partial<Record<keyof Slots, { exampleLines: string[] }>> = {
  title: { exampleLines: ['来週金曜のBBQナイト', '初心者向けゆる交流会'] },
  time: { exampleLines: ['9/20(金) 19:00-21:00', '平日夜 2時間 くらい'] },
  location: { exampleLines: ['渋谷駅周辺 / 近くの公園', 'オンラインでもOK'] },
  price: { exampleLines: ['無料 / 1000円', '材料費のみでもOK'] },
  capacity: { exampleLines: ['10人くらい', '少人数でもOK'] },
  details: { exampleLines: ['持ち物 / 服装 / 集合場所', '注意事項やルール'] },
  visibility: { exampleLines: ['公開 / 招待制', 'コミュニティ内限定'] },
  registrationForm: { exampleLines: ['氏名 / 電話 / メール', '希望チケットプラン'] },
  requireApproval: { exampleLines: ['承認あり / なし', '手動承認にする'] },
  enableWaitlist: { exampleLines: ['有効 / 無効', '満員時のみ有効'] },
  requireCheckin: { exampleLines: ['有効 / 無効', '当日受付でQR確認'] },
  refundPolicy: { exampleLines: ['3日前まで全額返金', '当日キャンセルは返金不可'] },
  riskNotice: { exampleLines: ['持ち物：身分証', '注意事項：遅刻連絡必須'] },
};

const buildQuestionMeta = (key?: keyof Slots | null) => {
  if (!key) return undefined;
  const meta = QUESTION_META_BY_KEY[key];
  if (!meta) return undefined;
  return { key, exampleLines: meta.exampleLines };
};

export type Confidence = Record<keyof Slots, number>;

export const isMetaComment = (text: string) => {
  if (!text) return false;
  return (
    /ずっと|永遠|ループ|また同じ|何度も|なんで|なぜ|おかしい|どうなって|進まない|質問ばかり|やめて|止めて|やめたい|おかしくない|納得できない/i.test(
      text,
    ) || /为什么|为何|一直|循环|卡住|到不了|不想|别再问|停止/i.test(text)
  );
};

export const isHelpIntent = (text: string) => {
  if (!text) return false;
  return (
    /これは何の機能|何をしているの|どう使うの|どう使えばいい|何をすればいい|なんで選ぶ|どういう意味|説明して/i.test(text) ||
    /这个功能是干嘛|你在做什么|怎么用的|怎么用|怎么用啊|现在要我做什么|我该做什么|为什么要我选|什么意思|解释一下|有什么用|有啥用/i.test(text) ||
    /何のため|何に使う|何に使えば|用途は|使い方は/i.test(text)
  );
};
export const isHelpUtterance = (text: string) => {
  if (!text) return false;
  return (
    isHelpIntent(text) ||
    /なにこれ|何これ|何の機能|どういうこと|どうなってる|使い方|助けて|ヘルプ/i.test(text) ||
    /这是啥|这是什麼|这是?啥|啥意思|怎么回事|怎么搞|怎么弄/i.test(text)
  );
};

const ROUTER_CONFIDENCE_THRESHOLD = 0.62;
const HELP_ROUTES = new Set(['HELP_SYSTEM', 'HELP_WHAT_NEXT', 'HELP_HOWTO']);

type InitialParseResult = {
  intent:
    | 'EVENT_INFO'
    | 'HELP_SYSTEM'
    | 'HELP_WHAT_NEXT'
    | 'HELP_HOWTO'
    | 'CANCEL'
    | 'OTHER'
    | 'UNKNOWN';
  slots: Partial<Record<keyof Slots, string>>;
  missing: (keyof Slots)[];
  confidence: Partial<Record<keyof Slots, number>>;
  language: 'ja' | 'zh' | 'en';
  firstReplyKey:
    | 'ASK_TITLE'
    | 'ASK_TIME'
    | 'ASK_LOCATION'
    | 'ASK_PRICE'
    | 'ASK_CLARIFY'
    | 'HELP'
    | 'UNKNOWN';
};

export const INITIAL_PARSE_SCHEMA = {
  name: 'initial_event_parse',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      intent: {
        type: 'string',
        enum: [
          'EVENT_INFO',
          'HELP_SYSTEM',
          'HELP_WHAT_NEXT',
          'HELP_HOWTO',
          'CANCEL',
          'OTHER',
          'UNKNOWN',
        ],
      },
      slots: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          time: { type: 'string' },
          location: { type: 'string' },
          price: { type: 'string' },
          capacity: { type: 'string' },
          details: { type: 'string' },
          visibility: { type: 'string' },
          registrationForm: { type: 'string' },
          requireApproval: { type: 'string' },
          enableWaitlist: { type: 'string' },
          requireCheckin: { type: 'string' },
          refundPolicy: { type: 'string' },
          riskNotice: { type: 'string' },
        },
      },
      missing: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'title',
            'time',
            'location',
            'price',
            'capacity',
            'details',
            'visibility',
            'registrationForm',
            'requireApproval',
            'enableWaitlist',
            'requireCheckin',
            'refundPolicy',
            'riskNotice',
          ],
        },
      },
      confidence: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'number' },
          time: { type: 'number' },
          location: { type: 'number' },
          price: { type: 'number' },
          capacity: { type: 'number' },
          details: { type: 'number' },
          visibility: { type: 'number' },
          registrationForm: { type: 'number' },
          requireApproval: { type: 'number' },
          enableWaitlist: { type: 'number' },
          requireCheckin: { type: 'number' },
          refundPolicy: { type: 'number' },
          riskNotice: { type: 'number' },
        },
      },
      language: { type: 'string', enum: ['ja', 'zh', 'en'] },
      firstReplyKey: {
        type: 'string',
        enum: [
          'ASK_TITLE',
          'ASK_TIME',
          'ASK_LOCATION',
          'ASK_PRICE',
          'ASK_CLARIFY',
          'HELP',
          'UNKNOWN',
        ],
      },
    },
    required: ['intent', 'slots', 'missing', 'confidence', 'language', 'firstReplyKey'],
  },
} as const;

const buildInitialParsePrompt = (params: {
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>;
  userText: string;
}) => {
  const systemPrompt =
    'You are a router+extractor for the first user message of an event assistant. ' +
    'Return strict JSON only. Do NOT generate any user-facing message, no Markdown. ' +
    'Output only the schema fields: { intent, slots, missing, confidence, language, firstReplyKey }. ' +
    'Extract possible slots (title/time/location/price/details/visibility/capacity/registrationForm/requireApproval/enableWaitlist/requireCheckin/refundPolicy/riskNotice). ' +
    'If the user asks what this is/how to use, set intent to HELP_SYSTEM or HELP_HOWTO. ' +
    'If you can extract ANY slot (even only title, or time/price as raw non-standard text), set intent to EVENT_INFO. ' +
    'If EVENT_INFO has zero extracted slots, change intent to UNKNOWN. ' +
    'UNKNOWN is only for unrelated paste, gibberish, or inputs that are not HELP_* and cannot yield any slots. ' +
    'For non-standard time or currency, do not normalize; keep raw text in slots.time / slots.price (e.g., "下周五下午", "1000元", "無料", "¥1000"). ' +
    'Only output missing keys when intent is EVENT_INFO. Default required order: [title, time, location, price]. ' +
    'Output firstReplyKey as one of: ASK_TITLE/ASK_TIME/ASK_LOCATION/ASK_PRICE/ASK_CLARIFY/HELP/UNKNOWN. ' +
    'If intent is EVENT_INFO and missing is non-empty, set firstReplyKey from missing[0]. ' +
    'If intent is EVENT_INFO and missing is empty, firstReplyKey=ASK_CLARIFY. ' +
    'If intent is HELP_* then firstReplyKey=HELP. ' +
    'If intent is UNKNOWN, firstReplyKey=UNKNOWN (prefer UNKNOWN unless the text seems intentional but unparseable). ' +
    'Use the user language for the language field.';
  const userPayload = {
    userText: params.userText,
    conversation: params.conversation.slice(-4),
  };
  return { systemPrompt, userPayload, schema: INITIAL_PARSE_SCHEMA };
};

export const shouldEnterExplainMode = (route?: RouterResult['route'] | null, confidence?: number | null) => {
  if (!route || typeof confidence !== 'number') return false;
  return HELP_ROUTES.has(route) && confidence >= ROUTER_CONFIDENCE_THRESHOLD;
};

export const isDelegateAnswer = (text: string) => {
  if (!text) return false;
  return (
    /任せる|おまかせ|お任せ|適当に決めて|決めておいて|好きに決めて|決めていい|自由に決めて/i.test(text) ||
    /你决定|帮我决定|随便|看着办|你来定|你来决定/i.test(text)
  );
};

export const isDelegateTitleAnswer = (text: string) => {
  if (!text) return false;
  return (
    isDelegateAnswer(text) ||
    /タイトル|題名|名前|ネーミング/.test(text) &&
      /考えて|考えといて|考えておいて|決めて|作って|おまかせ|任せる/.test(text) ||
    /标题|標題|题名|名稱|名字/.test(text) && /(想|帮我想|起|给我想|决定)/.test(text) ||
    /帮我想一个|帮我取个|你帮我想|你来取/i.test(text)
  );
};

interface AiAssistantReplyPayload {
  state: AssistantReplyState;
  language: string;
  thinkingSteps: string[];
  coachPrompt?: string;
  editorChecklist?: string[];
  writerSummary?: string;
  message?: string;
  questions?: string[];
  options?: Array<AiAssistantOption | string>;
  ui?: AiAssistantUiPayload;
  miniPreview?: AiAssistantMiniPreview;
  choiceQuestion?: AiAssistantChoiceQuestion;
  compareCandidates?: AiAssistantCompareCandidate[];
  titleSuggestions?: string[];
  inputMode?: AssistantInputMode;
  nextQuestionKey?: keyof Slots | null;
  questionMeta?: AiAssistantQuestionMeta;
  uiMode?: 'explain' | 'collect' | 'decision';
  autoTitle?: string;
  publicActivityDraft?: AiAssistantPublicDraft;
  internalExecutionPlan?: AiAssistantExecutionPlan;
  slots?: Slots;
  confidence?: Confidence;
  draftId?: string;
  draftReady?: boolean;
  applyEnabled?: boolean;
  modeHint?: 'chat' | 'operate';
  messageSource?: 'backend.ui' | 'backend.normalizer' | 'backend.interrupt';
}

export interface AiAssistantReply extends AiAssistantReplyPayload {
  promptVersion: string;
  language: string;
  turnCount: number;
  status: AssistantReplyState;
  optionTexts?: string[];
  stage?: AssistantStage;
  confirmQuestions?: string[];
  coachPrompts?: string[];
  optionDetails?: AiAssistantOption[];
  intent?: AssistantIntent;
}

export interface AiAssistantProfileDefaults {
  version: string;
  defaults: PromptDefaultsProfile;
}

export interface AiModuleUsageMetrics {
  totalLogs: number;
  last24h: number;
  last7d: number;
  activeCommunities: number;
  activeUsers: number;
  lastActivityAt: Date | null;
}

export interface AiModuleUsageSummary {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'coming-soon';
  metrics?: AiModuleUsageMetrics;
}

export interface AiUsageSummaryResponse {
  generatedAt: Date;
  modules: AiModuleUsageSummary[];
}

export interface AiUsageDetailResponse {
  module: {
    id: string;
    name: string;
    description: string;
  };
  metrics: AiModuleUsageMetrics & {
    avgTurns: number | null;
  };
  breakdown: {
    stage: Array<{ label: string; count: number }>;
    language: Array<{ label: string; count: number }>;
  };
  recentSessions: Array<{
    id: string;
    communityId: string;
    communityName: string;
    userId: string;
    userName: string;
    userEmail?: string | null;
    stage?: string | null;
    status?: string | null;
    summary?: string | null;
    turnCount?: number | null;
    createdAt: Date;
  }>;
}

export interface AiCommunityUsage {
  communityId: string;
  totalAiCallsThisMonth: number;
  estimatedMinutesSaved: number;
}

export interface TranslateTextItem {
  key: string;
  text: string;
  preserveFormat?: 'plain' | 'markdown' | 'html';
}

export interface TranslateTextDto {
  sourceLang: string;
  targetLangs: string[];
  items: TranslateTextItem[];
}

export interface TranslateTextResult {
  translations: Array<{
    key: string;
    source: string;
    translated: Record<string, string>;
  }>;
}

@Injectable()
export class AiService {
  private readonly client: OpenAI | null;
  private readonly model: string;
   // simple in-memory cache: key => { [targetLang]: translated }
  private readonly translationCache = new Map<string, Record<string, string>>();
  private readonly POLICY_VERSION = 'ready-gate-v1';

  constructor(
    private readonly prisma: PrismaService,
    private readonly promptStore: PromptStoreService,
  ) {
    const apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  private applyPromptParams(
    template: string,
    params: Record<string, string>,
    allowed?: string[],
  ) {
    if (!template) return template;
    const normalizedParams: Record<string, string> = {};
    Object.entries(params).forEach(([key, value]) => {
      const normalizedKey = key.toLowerCase();
      normalizedParams[normalizedKey] = value;
      normalizedParams[normalizedKey.replace(/_/g, '')] = value;
    });
    const allowSet = Array.isArray(allowed) && allowed.length > 0
      ? new Set(allowed.map((p) => p.toLowerCase()))
      : null;
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, rawKey) => {
      const key = String(rawKey).toLowerCase();
      if (allowSet && !allowSet.has(key) && !allowSet.has(key.replace(/_/g, ''))) {
        return `{${rawKey}}`;
      }
      return normalizedParams[key] ?? normalizedParams[key.replace(/_/g, '')] ?? `{${rawKey}}`;
    });
  }

  private async resolveEventAssistantPrompt(
    phase: EventAssistantPromptPhase,
    params: Record<string, string>,
  ): Promise<{ systemPrompt: string; instruction: string; version: string }> {
    const config = getEventAssistantPromptConfig(phase);
    const promptId = config.promptId;
    if (!promptId) {
      return {
        systemPrompt: this.applyPromptParams(config.systemPrompt, params),
        instruction: this.applyPromptParams(config.instruction, params),
        version: config.version,
      };
    }
    let promptDef;
    try {
      const prompts = await this.promptStore.getAll();
      promptDef =
        prompts.find((p) => p.id === promptId && p.status === 'published') ??
        prompts.find((p) => p.id === promptId);
    } catch (err) {
      console.warn('[AiService] failed to load prompt definitions, fallback to config', err);
    }
    if (!promptDef) {
      return {
        systemPrompt: this.applyPromptParams(config.systemPrompt, params),
        instruction: this.applyPromptParams(config.instruction, params),
        version: config.version,
      };
    }
    const allowedParams = Array.isArray(promptDef.params) ? promptDef.params : undefined;
    const systemPrompt = promptDef.system
      ? this.applyPromptParams(promptDef.system, params, allowedParams)
      : this.applyPromptParams(config.systemPrompt, params);
    const instructionTemplate =
      typeof promptDef.instructions === 'string' && promptDef.instructions.trim().length > 0
        ? promptDef.instructions
        : config.instruction;
    const instruction = this.applyPromptParams(instructionTemplate, params, allowedParams);
    const version = promptDef.version || config.version;
    return { systemPrompt, instruction, version };
  }

  private async generateTitleSuggestions(
    draft: AiAssistantPublicDraft | undefined,
    language: string,
  ): Promise<string[]> {
    const client = this.client;
    if (!client) return [];
    const lang = language || 'ja';
    const payload = {
      title: draft?.title ?? '',
      shortDescription: draft?.shortDescription ?? '',
      detailedDescription: draft?.detailedDescription ?? '',
      schedule: draft?.schedule ?? null,
      price: draft?.price ?? null,
      capacity: draft?.capacity ?? null,
      signupNotes: draft?.signupNotes ?? '',
    };
    const response = await client.chat.completions.create({
      model: this.model,
      temperature: 0.7,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'TitleSuggestions',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              titles: {
                type: 'array',
                minItems: 3,
                maxItems: 5,
                items: { type: 'string' },
              },
            },
            required: ['titles'],
          },
        },
      },
      messages: [
        {
          role: 'system',
          content:
            `You generate event title suggestions for a community app. ` +
            `Return only JSON that matches the schema. Use the user's language: ${lang}. ` +
            `Do NOT invent facts. Keep titles short and friendly.`,
        },
        {
          role: 'user',
          content: JSON.stringify(payload),
        },
      ],
    });
    const raw = response.choices?.[0]?.message?.content ?? '';
    try {
      const parsed = JSON.parse(raw) as { titles?: string[] };
      const titles = Array.isArray(parsed.titles) ? parsed.titles.map((t) => t.trim()).filter(Boolean) : [];
      return titles.slice(0, 5);
    } catch {
      return [];
    }
  }

  async generateEventContent(payload: GenerateEventContentDto): Promise<AiEventContent> {
    const client = this.client;
    if (!client) {
      throw new HttpException('OpenAI API key is not configured', HttpStatus.BAD_REQUEST);
    }

    try {
      const completion = await client.chat.completions.create({
        model: this.model,
        temperature: 0.7,
        response_format: {
          type: 'json_schema',
          json_schema: this.buildJsonSchema(),
        },
        messages: [
          {
            role: 'system',
            content:
              'You are MORE App event planner AI assistant. Respond ONLY with JSON that follows the provided schema. Focus on multicultural community events in Japan.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              instruction:
                'Generate multilingual content for an event hosted on MORE App. Use warm, inclusive tone. Keep sentences concise enough for mobile UI.',
              data: payload,
            }),
          },
        ],
      });

      const messageContent = completion.choices[0]?.message?.content;
      const raw =
        typeof messageContent === 'string'
          ? messageContent
          : Array.isArray(messageContent)
            ? (messageContent as Array<{ text?: string } | null>)
                .map((part) => part?.text ?? '')
                .join('')
            : '';

      if (!raw) {
        throw new Error('Empty response from AI');
      }

      return JSON.parse(raw) as AiEventContent;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to generate event copy', HttpStatus.INTERNAL_SERVER_ERROR, {
        cause: error,
      });
    }
  }

  async generateAssistantReply(payload: GenerateAssistantReplyDto): Promise<AiAssistantReply> {
    const client = this.client;
    if (!client) {
      throw new HttpException('OpenAI API key is not configured', HttpStatus.BAD_REQUEST);
    }
    const debugEnabled = process.env.EVENT_ASSISTANT_DEBUG === '1';
    const requestId =
      payload.requestId || `ea-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const conversationId = payload.conversationId || 'unknown';
    const llmCallLedger: Array<{ name: string; reason: string; allowed: boolean }> = [];
    const logDebug = (message: string, meta?: Record<string, unknown>) => {
      if (!debugEnabled) return;
      console.info('[EventAssistant][debug]', { requestId, conversationId, message, ...meta });
    };
    const logWarn = (message: string, meta?: Record<string, unknown>) => {
      if (!debugEnabled) return;
      console.warn('[EventAssistant][warn]', { requestId, conversationId, message, ...meta });
    };
    const clientTimezone = payload.clientTimezone || 'Asia/Tokyo';
    const llmBudget = 2;
    let llmCallCount = 0;
    let normalizerUsed = false;
    let mainLlmUsed = false;
    const recordLlmCall = (name: string, reason: string, allowed: boolean) => {
      llmCallLedger.push({ name, reason, allowed });
      const allowedCount = llmCallLedger.filter((entry) => entry.allowed).length;
      if (debugEnabled && allowedCount >= 3) {
        logWarn('llm_call_ledger_threshold', { count: allowedCount, ledger: llmCallLedger });
      }
      logDebug('llm_call', { name, reason, allowed });
      if (!allowed) {
        logWarn('llm_call_blocked', { name, reason });
      }
    };
    const canCallLlm = (name: string, ctx: {
      promptPhase: 'parse' | 'collect' | 'ready' | 'operate';
      loopTriggered: boolean;
      helpIntent: boolean;
      turnIndex: number;
    }) => {
      if (ctx.helpIntent) {
        recordLlmCall(name, 'help_intent_blocked', false);
        return false;
      }
      if (llmCallCount >= llmBudget) {
        recordLlmCall(name, 'budget_exceeded', false);
        return false;
      }
      if (name === 'normalizer' && mainLlmUsed) {
        recordLlmCall(name, 'main_llm_already_used', false);
        return false;
      }
      if (name === 'main_llm' && normalizerUsed) {
        recordLlmCall(name, 'normalizer_already_used', false);
        return false;
      }
      if (name === 'title_suggestions') {
        const allowed = ctx.promptPhase === 'collect';
        recordLlmCall(name, 'collect_title_suggestions', allowed);
        if (allowed) llmCallCount += 1;
        return allowed;
      }
      if (ctx.promptPhase === 'parse') {
        if (ctx.turnIndex === 0) {
          const allowed = name === 'router' || name === 'initial_parse';
          recordLlmCall(name, 'turn0_parse_only', allowed);
          if (allowed) llmCallCount += 1;
          return allowed;
        }
        recordLlmCall(name, 'parse_phase_non_turn0', false);
        return false;
      }
      if (ctx.promptPhase === 'collect') {
        if (name === 'normalizer') {
          const allowed = ctx.turnIndex >= 1 && ctx.loopTriggered && !normalizerUsed && llmCallCount === 0;
          recordLlmCall(name, 'collect_loop_only', allowed);
          if (allowed) llmCallCount += 1;
          return allowed;
        }
        recordLlmCall(name, 'collect_disallow', false);
        return false;
      }
      if (ctx.promptPhase === 'ready') {
        const allowed = name === 'main_llm' && !ctx.loopTriggered && llmCallCount === 0;
        recordLlmCall(name, 'ready_main_only', allowed);
        if (allowed) llmCallCount += 1;
        return allowed;
      }
      if (ctx.promptPhase === 'operate') {
        const allowed = name === 'main_llm' && llmCallCount === 0;
        recordLlmCall(name, 'operate_main_only', allowed);
        if (allowed) llmCallCount += 1;
        return allowed;
      }
      recordLlmCall(name, 'unknown_phase', false);
      return false;
    };

    const requiredSlots: (keyof Slots)[] = ['title', 'time', 'location', 'price'];
    const primaryOptionalSlots: (keyof Slots)[] = ['capacity', 'registrationForm', 'visibility'];
    const secondaryOptionalSlots: (keyof Slots)[] = [];
    const detailsChoiceLines: Record<string, string> = {
      lively: '雰囲気：わいわい（飲み会っぽい）',
      calm_chat: '雰囲気：落ち着いた会話中心',
      potluck_drinks: '雰囲気：持ち寄り（ドリンク/軽食）',
      no_alcohol: '雰囲気：ノンアル中心',
    };

    const normalizeSlotsForHash = (slots: Slots) => {
      const norm: Slots = {};
      const normalizeText = (v?: string) => (v ? v.trim() : v);
      const normalizePrice = (v?: string) => {
        if (!v) return v;
        const lower = v.trim().toLowerCase();
        if (['free', '無料', '0', '0円', 'free of charge', 'フリー'].includes(lower)) return 'free';
        return lower;
      };
      const normalizeLocation = (v?: string) => (v ? v.replace(/\s+/g, ' ').trim() : v);
      norm.title = normalizeText(slots.title);
      norm.time = normalizeText(slots.time);
      norm.location = normalizeLocation(slots.location);
      norm.price = normalizePrice(slots.price);
      norm.capacity = normalizeText(slots.capacity);
      norm.details = normalizeText(slots.details);
      norm.visibility = normalizeText(slots.visibility);
      norm.registrationForm = normalizeText(slots.registrationForm);
      norm.requireApproval = normalizeText(slots.requireApproval);
      norm.enableWaitlist = normalizeText(slots.enableWaitlist);
      norm.requireCheckin = normalizeText(slots.requireCheckin);
      norm.refundPolicy = normalizeText(slots.refundPolicy);
      norm.riskNotice = normalizeText(slots.riskNotice);
      return norm;
    };

    const hashStable = (input: unknown) =>
      crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');

    const parseTimeRangeFromText = (text: string) => {
      if (!text) return null;
      const hasPm = /午後|下午|晚上|夜/i.test(text);
      const hasAm = /午前|上午|早上/i.test(text);
      const normalizeHour = (hour: number) => {
        if (hasPm && hour < 12) return hour + 12;
        if (hasAm && hour === 12) return 0;
        return hour;
      };
      const parseMinutes = (raw?: string) => {
        if (!raw) return 0;
        if (raw === '半') return 30;
        const num = Number(raw.replace(/\D/g, ''));
        return Number.isNaN(num) ? 0 : num;
      };
      const timeRangeMatch = text.match(
        /(\d{1,2})[:：](\d{2})\s*[-〜~]\s*(\d{1,2})[:：](\d{2})/,
      );
      if (timeRangeMatch) {
        const startHour = normalizeHour(Number(timeRangeMatch[1]));
        const startMinute = Number(timeRangeMatch[2]);
        const endHour = normalizeHour(Number(timeRangeMatch[3]));
        const endMinute = Number(timeRangeMatch[4]);
        return {
          start: { hour: startHour, minute: Number.isNaN(startMinute) ? 0 : startMinute },
          end: { hour: endHour, minute: Number.isNaN(endMinute) ? 0 : endMinute },
        };
      }
      const cnRangeMatch = text.match(
        /(\d{1,2})\s*点\s*(半|(\d{1,2})\s*分)?\s*(?:到|至|~|-)\s*(\d{1,2})\s*点\s*(半|(\d{1,2})\s*分)?/,
      );
      if (cnRangeMatch) {
        const startHour = normalizeHour(Number(cnRangeMatch[1]));
        const startMinute = parseMinutes(cnRangeMatch[2] ?? cnRangeMatch[3]);
        const endHour = normalizeHour(Number(cnRangeMatch[4]));
        const endMinute = parseMinutes(cnRangeMatch[5] ?? cnRangeMatch[6]);
        return {
          start: { hour: startHour, minute: startMinute },
          end: { hour: endHour, minute: endMinute },
        };
      }
      const singleMatch = text.match(/(\d{1,2})[:：](\d{2})/);
      if (singleMatch) {
        const hour = normalizeHour(Number(singleMatch[1]));
        const minute = Number(singleMatch[2]);
        return {
          start: { hour, minute: Number.isNaN(minute) ? 0 : minute },
        };
      }
      const singleCnMatch = text.match(/(\d{1,2})\s*点\s*(半|(\d{1,2})\s*分)?/);
      if (singleCnMatch) {
        const hour = normalizeHour(Number(singleCnMatch[1]));
        const minute = parseMinutes(singleCnMatch[2] ?? singleCnMatch[3]);
        return {
          start: { hour, minute },
        };
      }
      return null;
    };

    const getBaseDateInTimezone = (timezone: string) => {
      try {
        const now = new Date();
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(now);
        const year = Number(parts.find((p) => p.type === 'year')?.value ?? now.getFullYear());
        const month = Number(parts.find((p) => p.type === 'month')?.value ?? now.getMonth() + 1);
        const day = Number(parts.find((p) => p.type === 'day')?.value ?? now.getDate());
        return new Date(year, month - 1, day, 0, 0, 0, 0);
      } catch {
        return new Date();
      }
    };

    const resolveWeekdayDate = (weekday: number, weekOffset: number) => {
      const baseDate = getBaseDateInTimezone(clientTimezone);
      const current = baseDate.getDay();
      let delta = (weekday - current + 7) % 7;
      if (weekOffset > 0) delta += 7 * weekOffset;
      const next = new Date(baseDate);
      next.setDate(baseDate.getDate() + delta);
      return next;
    };

    const parseDateFromText = (text: string) => {
      if (!text) return null;
      const ymdMatch = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
      if (ymdMatch) {
        const year = Number(ymdMatch[1]);
        const month = Number(ymdMatch[2]) - 1;
        const day = Number(ymdMatch[3]);
        return new Date(year, month, day, 0, 0, 0, 0);
      }
      const mdMatch = text.match(/(\d{1,2})月(\d{1,2})日/);
      if (mdMatch) {
        const base = getBaseDateInTimezone(clientTimezone);
        const year = base.getFullYear();
        const month = Number(mdMatch[1]) - 1;
        const day = Number(mdMatch[2]);
        return new Date(year, month, day, 0, 0, 0, 0);
      }
      const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})/);
      if (slashMatch) {
        const base = getBaseDateInTimezone(clientTimezone);
        const year = base.getFullYear();
        const month = Number(slashMatch[1]) - 1;
        const day = Number(slashMatch[2]);
        return new Date(year, month, day, 0, 0, 0, 0);
      }
      const jpMatch = text.match(/(来週|今週)?\s*([月火水木金土日])曜/);
      if (jpMatch) {
        const prefix = jpMatch[1] ?? '';
        const weekdayMap: Record<string, number> = {
          日: 0,
          月: 1,
          火: 2,
          水: 3,
          木: 4,
          金: 5,
          土: 6,
        };
        const weekday = weekdayMap[jpMatch[2]];
        const offset = /来週/.test(prefix) ? 1 : 0;
        return resolveWeekdayDate(weekday, offset);
      }
      const cnMatch =
        text.match(/(下周|下星期|本周|本週|这周|這周|今周|今週)?\s*(周|星期)\s*([一二三四五六日天1234567])/);
      if (cnMatch) {
        const prefix = cnMatch[1] ?? '';
        const dayToken = cnMatch[3];
        const weekdayMap: Record<string, number> = {
          日: 0,
          天: 0,
          一: 1,
          二: 2,
          三: 3,
          四: 4,
          五: 5,
          六: 6,
          '1': 1,
          '2': 2,
          '3': 3,
          '4': 4,
          '5': 5,
          '6': 6,
          '7': 0,
        };
        const weekday = weekdayMap[dayToken];
        const offset = /下周|下星期/.test(prefix) ? 1 : 0;
        return resolveWeekdayDate(weekday, offset);
      }
      const cnShortMatch = text.match(/(下周|下星期)\s*([一二三四五六日天1234567])/);
      if (cnShortMatch) {
        const dayToken = cnShortMatch[2];
        const weekdayMap: Record<string, number> = {
          日: 0,
          天: 0,
          一: 1,
          二: 2,
          三: 3,
          四: 4,
          五: 5,
          六: 6,
          '1': 1,
          '2': 2,
          '3': 3,
          '4': 4,
          '5': 5,
          '6': 6,
          '7': 0,
        };
        const weekday = weekdayMap[dayToken];
        return resolveWeekdayDate(weekday, 1);
      }
      return null;
    };

    const buildStructuredSchedule = (text: string) => {
      const explicitStart = extractTokyoStartTimeIso(text);
      const timeRange = parseTimeRangeFromText(text);
      const dateOnly = parseDateFromText(text);
      if (!timeRange || !dateOnly) {
        if (explicitStart) {
          return { startTime: explicitStart, endTime: undefined };
        }
        return null;
      }
      const start = new Date(dateOnly);
      start.setHours(timeRange.start.hour, timeRange.start.minute, 0, 0);
      let end: Date | null = null;
      if (timeRange.end) {
        end = new Date(dateOnly);
        end.setHours(timeRange.end.hour, timeRange.end.minute, 0, 0);
        if (end <= start) {
          end.setDate(end.getDate() + 1);
        }
      }
      return {
        startTime: start.toISOString(),
        endTime: end ? end.toISOString() : undefined,
      };
    };

    const detectIntent = (text: string): AssistantIntent => {
      if (/[作办办]活動|イベントを?作|開催|公開|募集|申し込みフォーム|申込フォーム|作成|掲載|告知/i.test(text)) return 'create';
      if (/見たい|試す|体験だけ|デモ|見学/i.test(text)) return 'explore';
      return 'unknown';
    };

    const detectInputMode = (text: string): AssistantInputMode => {
      const selectionPattern = /【選択】\s*([a-zA-Z_]+)\s*[:：]\s*(.+)/;
      if (selectionPattern.test(text)) return 'fill';
      const activityKeywords = [
        'bbq',
        'バーベキュー',
        '交流会',
        '勉強会',
        '説明会',
        'パーティー',
        'セミナー',
        'ワークショップ',
        'ミートアップ',
      ];
      const activityMatches = new Set(activityKeywords.filter((kw) => new RegExp(kw, 'i').test(text)));
      const timeRangeRegexGlobal = /\d{1,2}[:：]\d{2}\s*[-〜~]\s*\d{1,2}[:：]\d{2}/g;
      const timeRanges = text.match(timeRangeRegexGlobal) ?? [];
      const timeWords = text.match(/来週|今週|平日夜|週末|土曜|日曜|金曜|月曜|火曜|水曜|木曜|夜|午後|午前/g) ?? [];
      const timeTokens = new Set([...timeRanges, ...timeWords]);
      const lineParts = text.split(/\n+/).map((t) => t.trim()).filter(Boolean);
      const timeRangeRegex = /\d{1,2}[:：]\d{2}\s*[-〜~]\s*\d{1,2}[:：]\d{2}/;
      const timeWordRegex = /(来週|今週|平日夜|週末|土曜|日曜|金曜|月曜|火曜|水曜|木曜|夜|午後|午前)/;
      const candidateLines = lineParts.filter(
        (line) =>
          activityKeywords.some((kw) => new RegExp(kw, 'i').test(line)) ||
          timeRangeRegex.test(line) ||
          timeWordRegex.test(line),
      );
      const hasMultipleCandidateLines = candidateLines.length >= 2;
      let compareSignals = 0;
      if (activityMatches.size >= 2 && hasMultipleCandidateLines) compareSignals += 1;
      if (timeTokens.size >= 2) compareSignals += 1;
      if (hasMultipleCandidateLines) compareSignals += 1;
      if (compareSignals >= 2) return 'compare';
      if (timeTokens.size >= 1 || /円|無料|フリー|0円/.test(text)) return 'fill';
      return 'describe';
    };

    const extractCompareCandidates = (text: string): AiAssistantCompareCandidate[] => {
      if (!text) return [];
      const activityRegex = /(BBQ|バーベキュー|交流会|勉強会|説明会|パーティー|セミナー|ワークショップ|ミートアップ)/i;
      const activityGlobalRegex = new RegExp(
        activityRegex.source,
        activityRegex.flags.includes('g') ? activityRegex.flags : `${activityRegex.flags}g`,
      );
      const activityMatches = Array.from(text.matchAll(activityGlobalRegex));
      const lineParts = text
        .split(/\n+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const timeRangeRegex = /\d{1,2}[:：]\d{2}\s*[-〜~]\s*\d{1,2}[:：]\d{2}/;
      const dayWordRegex = /(来週|今週|平日夜|週末|土曜|日曜|金曜|月曜|火曜|水曜|木曜|夜|午後|午前)/;
      const candidateLines = lineParts.filter(
        (line) => activityRegex.test(line) || timeRangeRegex.test(line) || dayWordRegex.test(line),
      );
      const explicitSeparator = /(または|あるいは|or|vs|対|／|｜|\s\/\s)/i.test(text);
      const timeRangeMatches = text.match(timeRangeRegex) ? text.match(new RegExp(timeRangeRegex.source, 'g')) ?? [] : [];
      let segments: string[] = [];
      if (candidateLines.length >= 2) {
        segments = candidateLines;
      } else if (activityMatches.length >= 2 && (explicitSeparator || timeRangeMatches.length >= 2)) {
        for (let i = 0; i < activityMatches.length; i += 1) {
          const start = activityMatches[i].index ?? 0;
          const end = activityMatches[i + 1]?.index ?? text.length;
          segments.push(text.slice(start, end).trim());
        }
      } else {
        segments = [];
      }
      if (segments.length < 2) return [];
      const priceRegex = /(\d{2,5})\s*円|無料|フリー|0円/;
      const noteRegex = /(ドリンク持参|持参|持ち寄り|持ち物|食材)/;
      return segments.slice(0, 3).map((segment, idx) => {
        const id = String.fromCharCode(65 + idx);
        const activity = segment.match(activityRegex)?.[0] ?? segment.slice(0, 12);
        const time =
          segment.match(timeRangeRegex)?.[0] ??
          segment.match(dayWordRegex)?.[0] ??
          undefined;
        const priceMatch = segment.match(priceRegex)?.[0];
        const price = priceMatch ? priceMatch.replace(/\s+/g, '') : undefined;
        const notes = segment.match(noteRegex)?.[0];
        const summaryParts = [activity, time, price, notes].filter(Boolean);
        return {
          id,
          summary: summaryParts.join(' / '),
          time,
          price,
          notes,
        };
      });
    };

    const findLatestCompareMessage = (messages: AssistantConversationMessage[]) => {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i].role !== 'user') continue;
        const content = messages[i].content || '';
        if (detectInputMode(content) === 'compare') return content;
      }
      return '';
    };

    const buildTitleSuggestions = (hint: Slots): string[] => {
      const base = [];
      if (hint.location) base.push(hint.location);
      const seeds = base.filter(Boolean).slice(0, 2).join('・');
      const templates = [
        `${seeds ? `${seeds}・` : ''}体験会`,
        `${seeds ? `${seeds}・` : ''}交流ナイト`,
        `${seeds ? `${seeds}・` : ''}ワークショップ`,
        `${seeds ? `${seeds}・` : ''}オープンDay`,
        `${seeds ? `${seeds}・` : ''}ミートアップ`,
        `${seeds ? `${seeds}・` : ''}ラボ`,
        `${seeds ? `${seeds}・` : ''}フェス`,
      ];
      return templates.slice(0, 7);
    };

    type SlotOrigin = 'explicit' | 'inferred' | 'llm' | 'selection';
    const extractSlots = (
      conversationMessages: AssistantConversationMessage[],
      basePayload: GenerateAssistantReplyDto,
    ): {
      slots: Slots;
      confidence: Confidence;
      intent: AssistantIntent;
      flags: { hasRulePaste: boolean };
      origins: Partial<Record<keyof Slots, SlotOrigin>>;
      confirmations: Partial<Record<keyof Slots, boolean>>;
      denials: Partial<Record<keyof Slots, boolean>>;
    } => {
      const slots: Slots = {};
      const confidence: Confidence = {
        title: 0,
        time: 0,
        location: 0,
        price: 0,
        capacity: 0,
        details: 0,
        visibility: 0,
        registrationForm: 0,
        requireApproval: 0,
        enableWaitlist: 0,
        requireCheckin: 0,
        refundPolicy: 0,
        riskNotice: 0,
      };
      const origins: Partial<Record<keyof Slots, SlotOrigin>> = {};
      const confirmations: Partial<Record<keyof Slots, boolean>> = {};
      const denials: Partial<Record<keyof Slots, boolean>> = {};
      const setSlot = (key: keyof Slots, value?: string, conf?: number, origin: SlotOrigin = 'inferred') => {
        if (!value) return;
        const nextConf = conf ?? 0.7;
        if ((confidence[key] ?? 0) < nextConf) {
          slots[key] = value.trim();
          confidence[key] = nextConf;
          origins[key] = origin;
        }
      };
      const appendDetailLine = (line: string, conf = 1) => {
        const trimmed = line?.trim();
        if (!trimmed) return;
        const existing = slots.details ? slots.details.split('\n').map((item) => item.trim()) : [];
        if (!existing.includes(trimmed)) {
          existing.push(trimmed);
        }
        slots.details = existing.filter(Boolean).join('\n');
        confidence.details = Math.max(confidence.details ?? 0, conf);
        origins.details = 'explicit';
      };

      // seed from payload
      // topic from payload is low-confidence unless user explicitly provides it later
      if (basePayload.topic?.trim()) {
        // Keep topic for LLM prompt only; do not map to slots.
      }
      if (basePayload.titleSeed?.trim()) {
        setSlot('title', basePayload.titleSeed.trim(), 0.8, 'inferred');
      }
      if (basePayload.details?.trim()) {
        setSlot('details', basePayload.details.trim(), 0.7, 'inferred');
        const priceMatch = basePayload.details.match(/(\d{1,5})\s*円(?:\/人)?/);
        if (priceMatch?.[1]) {
          const amount = Number(priceMatch[1]);
          if (!Number.isNaN(amount)) {
            if (amount === 0) {
              setSlot('price', 'free', 0.7, 'inferred');
            } else {
              setSlot('price', priceMatch[0].replace(/\s+/g, ''), 0.75, 'inferred');
            }
          }
        } else if (/無料|フリー|タダ|free/i.test(basePayload.details)) {
          setSlot('price', 'free', 0.7, 'inferred');
        }
        if (/オンライン|zoom|teams|google meet|line/i.test(basePayload.details)) {
          setSlot('location', 'online', 0.7, 'inferred');
        }
      }

      const userMessages = conversationMessages.filter((msg) => msg.role === 'user');
      let hasRulePaste = false;
      const allUserText = userMessages.map((m) => m.content || '').join(' ');

      for (const msg of userMessages) {
        const text = msg.content || '';
        const listLines = text
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean);
        let parsedDate: string | null = null;
        let parsedTime: string | null = null;
        for (const line of listLines) {
          const match = line.match(
            /^[-*•]?\s*\**(イベント名|日付|時間|場所|参加人数|参加条件|参加費|料金|申込フォーム|申込項目|公開範囲|参加承認|承認|キャンセル待ち|待機リスト|チェックイン|検票|返金ポリシー|注意事項)\**\s*[:：]\s*(.+)$/,
          );
          if (!match) continue;
          const label = match[1];
          const value = match[2].trim();
          if (!value) continue;
          if (label === 'イベント名') {
            if (!isDelegateTitleAnswer(value)) setSlot('title', value, 0.9, 'explicit');
            continue;
          }
          if (label === '日付') {
            parsedDate = value;
            continue;
          }
          if (label === '時間') {
            parsedTime = value;
            continue;
          }
          if (label === '場所') {
            setSlot('location', value, /オンライン|zoom|teams|meet|line/i.test(value) ? 0.9 : 0.85, 'explicit');
            continue;
          }
          if (label === '参加人数') {
            setSlot('capacity', value, 0.7, 'explicit');
            continue;
          }
      if (label === '参加条件') {
        appendDetailLine(value, 0.75);
        continue;
      }
          if (label === '申込フォーム' || label === '申込項目') {
            setSlot('registrationForm', value, 0.75, 'explicit');
            continue;
          }
          if (label === '公開範囲') {
            const normalized = normalizeVisibilityAnswer(value);
            setSlot('visibility', normalized || value, 0.75, 'explicit');
            continue;
          }
          if (label === '参加承認' || label === '承認') {
            const normalized = normalizeToggleAnswer(value);
            setSlot('requireApproval', normalized || value, 0.75, 'explicit');
            continue;
          }
          if (label === 'キャンセル待ち' || label === '待機リスト') {
            const normalized = normalizeToggleAnswer(value);
            setSlot('enableWaitlist', normalized || value, 0.75, 'explicit');
            continue;
          }
          if (label === 'チェックイン' || label === '検票') {
            const normalized = normalizeToggleAnswer(value);
            setSlot('requireCheckin', normalized || value, 0.75, 'explicit');
            continue;
          }
      if (label === '返金ポリシー') {
        setSlot('refundPolicy', value, 0.7, 'explicit');
        continue;
      }
          if (label === '注意事項') {
            setSlot('riskNotice', value, 0.7, 'explicit');
            continue;
          }
          if (label === '参加費' || label === '料金') {
            const normalizedPrice = normalizePriceAnswer(value);
            if (normalizedPrice) {
              setSlot('price', normalizedPrice, 0.85, 'explicit');
            } else {
              setSlot('price', value, 0.7, 'explicit');
            }
            continue;
          }
        }
        if (parsedDate || parsedTime) {
          const combined = [parsedDate, parsedTime].filter(Boolean).join(' ');
          if (combined) setSlot('time', combined, 0.85, 'explicit');
        }
        const selectionMatch = text.match(/【選択】\s*([a-zA-Z_]+)\s*[:：]\s*(.+)/);
        if (selectionMatch?.[1] && selectionMatch?.[2]) {
          const rawKey = selectionMatch[1].trim();
          const rawValue = selectionMatch[2].trim();
          const isConfirmKey = rawKey.startsWith('confirm_');
          const normalizedKey = isConfirmKey ? rawKey.replace('confirm_', '') : rawKey;
          const targetKey = normalizedKey as keyof Slots;
          const normalizedValue = rawValue.toLowerCase();
          const isYes = /^(はい|yes|y|ok|了解|是|对|好)$/i.test(normalizedValue);
          const isNo = /^(いいえ|no|n|不|不是|否|不要)$/i.test(normalizedValue);
          if (isConfirmKey && Object.prototype.hasOwnProperty.call(confidence, targetKey)) {
            if (isYes) confirmations[targetKey] = true;
            if (isNo) denials[targetKey] = true;
            continue;
          }
          const candidateMatch = rawValue.match(/候補([A-C])/);
          if (candidateMatch?.[1]) {
            const compareSource = findLatestCompareMessage(userMessages);
            const candidates = extractCompareCandidates(compareSource);
            const selected = candidates.find((c) => c.id === candidateMatch[1]);
            if (selected) {
              if (selected.time) setSlot('time', selected.time, 1, 'selection');
              if (selected.price) setSlot('price', selected.price, 1, 'selection');
              if (selected.notes) setSlot('details', selected.notes, 0.8, 'selection');
              continue;
            }
          }
          if (Object.prototype.hasOwnProperty.call(confidence, targetKey)) {
            if (targetKey === 'details' && detailsChoiceLines[rawValue]) {
              appendDetailLine(detailsChoiceLines[rawValue], 1);
              continue;
            }
            setSlot(targetKey, rawValue, 1, 'selection');
            continue;
          }
        }
        if (text.length > 400 && /(憲章|constitution|rule|規約)/i.test(text)) {
          hasRulePaste = true;
        }

        // time detection
        const timeRangeMatch = text.match(/(\d{1,2}[:：]\d{2}\s*[-〜~]\s*\d{1,2}[:：]\d{2})/);
        const cnTimeTokenRegex = /(\d{1,2})\s*点\s*(半|(\d{1,2})\s*分)?/g;
        const cnTokens = Array.from(text.matchAll(cnTimeTokenRegex));
        const hasPm = /下午|晚上|夜/.test(text);
        const hasAm = /上午|早上/.test(text);
        const normalizeHour = (hour: number) => {
          if (hasPm && hour < 12) return hour + 12;
          if (hasAm && hour === 12) return 0;
          return hour;
        };
        const formatTime = (hour: number, minute: number) =>
          `${String(normalizeHour(hour)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        const cnRangeFromTokens = (() => {
          if (cnTokens.length < 2) return null;
          const parseToken = (match: RegExpMatchArray) => {
            const hour = Number(match[1]);
            const minute = match[2] === '半' ? 30 : Number(match[3] || 0);
            return formatTime(hour, Number.isNaN(minute) ? 0 : minute);
          };
          const start = parseToken(cnTokens[0]);
          const end = parseToken(cnTokens[1]);
          if (!start || !end) return null;
          return `${start}-${end}`;
        })();
        const cnDayMatch = text.match(
          /(下周|下星期|本周|本週|这周|這周|今周|今週)?\s*(?:周|星期)?\s*([一二三四五六日天1234567])/,
        );
        const timeDateMatch =
          text.match(/(\d{4}-\d{2}-\d{2}(?:\s*\d{1,2}[:：]\d{2})?|\d{1,2}月\d{1,2}日(?:\s*\d{1,2}[:：]\d{2})?)/) ??
          text.match(/(\d{1,2}\/\d{1,2}(?:\s*\d{1,2}[:：]\d{2})?)/);
        if (timeRangeMatch?.[1]) {
          setSlot('time', timeRangeMatch[1], 0.75, 'explicit');
        } else if (cnRangeFromTokens) {
          const dayPrefix = cnDayMatch?.[0] ? `${cnDayMatch[0].replace(/\s+/g, '')} ` : '';
          setSlot('time', `${dayPrefix}${cnRangeFromTokens}`.trim(), 0.75, 'explicit');
        } else if (timeDateMatch?.[0]) {
          setSlot('time', timeDateMatch[0], 0.75, 'explicit');
        } else if (/平日夜|週末|土曜|日曜|金曜|午後|午前/.test(text)) {
          setSlot('time', text.match(/(平日夜|週末|土曜|日曜|金曜|午後|午前)/)?.[0], 0.65, 'inferred');
        }
        // location detection
        if (/オンライン|zoom|teams|meet|line/i.test(text)) {
          setSlot('location', 'online', 0.8, 'explicit');
        } else {
          const locMatch =
            text.match(/([\u4e00-\u9fff]{1,6}(市|区|區|县|縣|町|村))/) ??
            text.match(/([ぁ-んァ-ン\u4e00-\u9fff]{1,6}(駅|駅前))/) ??
            text.match(/(渋谷|新宿|池袋|東京|大阪|名古屋|福岡|札幌|横浜|神戸|京都|仙台|那覇|千葉|埼玉|神奈川)/);
          if (locMatch?.[0]) {
            setSlot('location', locMatch[0], 0.7, 'explicit');
          }
        }
        // price detection
        const priceMatch = text.match(/(\d{1,5})\s*(円|元)(?:\/人)?/);
        const perPersonMatch = text.match(/(一人|每人)\s*(\d{1,5})/);
        if (priceMatch?.[1]) {
          const amount = Number(priceMatch[1]);
          if (!Number.isNaN(amount)) {
            if (amount === 0) {
              setSlot('price', 'free', 0.8, 'explicit');
            } else {
              setSlot('price', priceMatch[0].replace(/\s+/g, ''), 0.75, 'explicit');
            }
          }
        } else if (perPersonMatch?.[2]) {
          const amount = Number(perPersonMatch[2]);
          if (!Number.isNaN(amount)) {
            setSlot('price', `${amount}元/人`, 0.75, 'explicit');
          }
        } else if (/無料|フリー|タダ|free/i.test(text)) {
          setSlot('price', 'free', 0.8, 'explicit');
        }
        // visibility detection
        const normalizedVisibility = normalizeVisibilityAnswer(text);
        if (normalizedVisibility) {
          setSlot('visibility', normalizedVisibility, 0.7);
        }
        // capacity detection
        const capMatch = text.match(/(\d{1,3})\s*(名|人)/);
        if (capMatch?.[1]) {
          setSlot('capacity', capMatch[1], 0.7, 'explicit');
        }
        // registration form hints
        if (/申込フォーム|申込項目|質問項目|フォーム項目/.test(text)) {
          setSlot('registrationForm', text, 0.7);
        } else {
          const fields: string[] = [];
          if (/氏名|名前|お名前/.test(text)) fields.push('氏名');
          if (/電話|携帯/.test(text)) fields.push('電話番号');
          if (/メール|メールアドレス/.test(text)) fields.push('メール');
          if (/住所|郵便/.test(text)) fields.push('住所');
          if (/年齢/.test(text)) fields.push('年齢');
          if (/性別/.test(text)) fields.push('性別');
          if (/チケット|プラン/.test(text)) fields.push('チケットプラン');
          if (fields.length && (confidence.registrationForm ?? 0) < 0.7) {
            setSlot('registrationForm', fields.join(', '), 0.7);
          }
        }
        if (/承認|参加承認|承認制/.test(text)) {
          const normalized = normalizeToggleAnswer(text);
          if (normalized) setSlot('requireApproval', normalized, 0.7);
        }
        if (/キャンセル待ち|待機リスト/.test(text)) {
          const normalized = normalizeToggleAnswer(text);
          if (normalized) setSlot('enableWaitlist', normalized, 0.7);
        }
        if (/チェックイン|検票|受付/.test(text)) {
          const normalized = normalizeToggleAnswer(text);
          if (normalized) setSlot('requireCheckin', normalized, 0.7);
        }
        if (/返金|キャンセルポリシー|返金ポリシー/.test(text)) {
          setSlot('refundPolicy', text, 0.65);
        }
        if (/注意事項|持ち物|免責/.test(text)) {
          setSlot('riskNotice', text, 0.65);
        }
        const hasCjk = /[\u3040-\u30ff\u4e00-\u9fff]/.test(text);
        const minTitleLength = hasCjk ? 2 : 4;
        const explicitTitleMatch = text.match(/タイトル[:：]\s*(.+)/) ?? text.match(/タイトルは(.+)/);
        if (explicitTitleMatch?.[1]) {
          const candidate = explicitTitleMatch[1].trim();
          if (candidate.length >= minTitleLength && candidate.length <= 40) {
            setSlot('title', candidate, 0.85);
          }
        }
        if (text.length > 80 && (confidence.details ?? 0) < 0.6) {
          setSlot('details', text, 0.65);
        }
      }

      const intent = hasRulePaste ? 'unknown' : detectIntent(allUserText || basePayload.details || '');
      return { slots, confidence, intent, flags: { hasRulePaste }, origins, confirmations, denials };
    };
    const buildAssumptionsFromHeuristics = (slotValues: Slots, slotConfidence: Confidence, sourceText: string) => {
      const assumptions: Array<{ field: string; assumedValue: string; reason: string }> = [];
      const lower = sourceText.toLowerCase();
      const hasBBQ =
        /bbq|バーベキュー/.test(lower) ||
        /bbq|バーベキュー/i.test(slotValues.title ?? '') ||
        /bbq|バーベキュー/i.test(slotValues.details ?? '');
      if (hasBBQ) {
        if ((slotConfidence.location ?? 0) < 0.6) {
          assumptions.push({
            field: 'location',
            assumedValue: '屋外（公園など）',
            reason: 'BBQの一般的な開催場所',
          });
        }
      }
      return assumptions;
    };
    const buildMiniPreview = (
      slotValues: Slots,
      slotConfidence: Confidence,
      assumptions: Array<{ field: string; assumedValue: string; reason: string }>,
      sourceText: string,
    ): AiAssistantMiniPreview | null => {
      const hasTime = (slotConfidence.time ?? 0) >= 0.6 && slotValues.time;
      const hasPrice = (slotConfidence.price ?? 0) >= 0.6 && slotValues.price;
      const hasTopic = (slotConfidence.title ?? 0) >= 0.6;
      if (!hasTime || !hasPrice || !hasTopic) return null;
      const bullets: string[] = [];
      const assumptionMap = new Map(assumptions.map((a) => [a.field, a.assumedValue]));
      if (hasTime && slotValues.time) {
        bullets.push(`日時: ${slotValues.time}`);
      }
      if (hasPrice && slotValues.price) {
        bullets.push(`料金: ${slotValues.price}`);
      }
      if ((slotConfidence.location ?? 0) >= 0.6 && slotValues.location) {
        bullets.push(`場所: ${slotValues.location}`);
      } else if (assumptionMap.has('location')) {
        bullets.push(`場所: ${assumptionMap.get('location')}（暫定）`);
      }
      const missingLabels: string[] = [];
      const missingOrder: Array<{ key: keyof Slots; label: string }> = [
        { key: 'title', label: 'タイトル' },
        { key: 'location', label: '場所' },
        { key: 'time', label: '日時' },
        { key: 'price', label: '料金' },
        { key: 'capacity', label: '定員' },
        { key: 'details', label: '詳細' },
        { key: 'registrationForm', label: '申込フォーム' },
      ];
      missingOrder.forEach(({ key, label }) => {
        if ((slotConfidence[key] ?? 0) >= 0.6 && slotValues[key]) return;
        missingLabels.push(label);
      });
      const noteParts: string[] = [];
      if (missingLabels.length) {
        noteParts.push(`未定：${missingLabels.slice(0, 2).join(' / ')}（あとで変更できます）`);
      }
      const riskSource = `${sourceText || ''} ${slotValues.details ?? ''}`;
      if (/(飲み|酒|bbq|バーベキュー|食事|飲食|アルコール)/i.test(riskSource)) {
        noteParts.push('注意：飲食がある場合は持ち物・アレルギー案内があると安心です');
      }
      const note = noteParts.filter(Boolean).join(' / ');
      return bullets.length ? { bullets: bullets.slice(0, 6), note } : null;
    };
    const isAmbiguousAnswer = (text: string) => {
      if (!text) return false;
      return (
        /未定|わからない|適当|あとで|どれでも|随便|没想好|都行|まだ決めてない/i.test(text) ||
        /わからん|迷ってる|不确定|不知道|随意|隨便/.test(text) ||
        /あとで決める|いまは決めない/.test(text)
      );
    };
    const isOptionRequest = (text: string) => {
      if (!text) return false;
      return /候補|おすすめ|選択肢|案を出して|提案|オプション|option|choices?|选项|選項|推荐|推薦|建议|建議|給我|给我/i.test(text);
    };
    const noNewInfoForKey = (
      key: keyof Slots,
      prevSlots: Slots,
      prevConfidence: Confidence,
      currentSlots: Slots,
      currentConfidence: Confidence,
    ) => {
      const prevValue = prevSlots[key] ?? '';
      const currValue = currentSlots[key] ?? '';
      const prevConf = prevConfidence[key] ?? 0;
      const currConf = currentConfidence[key] ?? 0;
      return prevValue === currValue && currConf <= prevConf;
    };
    const buildDecisionChoiceQuestion = (
      key: keyof Slots | null,
      slotValues: Slots,
      slotConfidence: Confidence,
      prevSlots: Slots,
      prevConfidence: Confidence,
      lastUserMessage: string,
      lastAskedSlot: keyof Slots | null,
    ): AiAssistantChoiceQuestion | null => {
      if (!key) return null;
      const subjectiveKeys: (keyof Slots)[] = [
        'details',
        'visibility',
        'requireApproval',
        'enableWaitlist',
        'requireCheckin',
      ];
      if (!subjectiveKeys.includes(key)) return null;
      const hasSlotValue = Boolean(slotValues[key]) && (slotConfidence[key] ?? 0) >= 0.6;
      const ambiguous = isAmbiguousAnswer(lastUserMessage) || isOptionRequest(lastUserMessage);
      const askedSame = lastAskedSlot === key;
      const noNewInfo = askedSame && noNewInfoForKey(key, prevSlots, prevConfidence, slotValues, slotConfidence);
      const shouldOfferChoices = !hasSlotValue || ambiguous || noNewInfo;
      if (!shouldOfferChoices) return null;
      if (key === 'details') {
        const recommendedPotluck =
          /ドリンク持参|持参|持ち寄り/.test(lastUserMessage) ||
          /ドリンク持参|持参|持ち寄り/.test(slotValues.details ?? '');
        const recommendLabel = recommendedPotluck ? '持ち寄り' : 'わいわい';
        return {
          key: 'details',
          prompt: `雰囲気はどれが近いですか？（おすすめ：${recommendLabel}）`,
          options: [
            { label: '🍻 わいわい（飲み会っぽい）', value: 'lively', recommended: !recommendedPotluck },
            { label: '☕ 落ち着いた会話中心', value: 'calm_chat' },
            { label: '🍱 持ち寄り（ドリンク/軽食）', value: 'potluck_drinks', recommended: recommendedPotluck },
            { label: '🚫 ノンアル中心', value: 'no_alcohol' },
          ],
        };
      }
      if (key === 'visibility') {
        return {
          key: 'visibility',
          prompt: '公開範囲はどうしますか？（おすすめ：公開）',
          options: [
            { label: '🌍 公開', value: 'public', recommended: true },
            { label: '👥 コミュニティ内限定', value: 'community_only' },
            { label: '🔒 招待制', value: 'invite_only' },
            { label: '🙈 非公開', value: 'private' },
          ],
        };
      }
      if (key === 'requireApproval') {
        return {
          key: 'requireApproval',
          prompt: '参加承認は必要ですか？',
          options: [
            { label: '承認あり（手動で承認）', value: '有効', recommended: true },
            { label: '承認なし（自動参加）', value: '無効' },
          ],
        };
      }
      if (key === 'enableWaitlist') {
        return {
          key: 'enableWaitlist',
          prompt: 'キャンセル待ちは有効にしますか？',
          options: [
            { label: '有効にする', value: '有効', recommended: true },
            { label: '無効にする', value: '無効' },
          ],
        };
      }
      if (key === 'requireCheckin') {
        return {
          key: 'requireCheckin',
          prompt: 'チェックイン（検票）は必要ですか？',
          options: [
            { label: '必要（当日チェックイン）', value: '有効', recommended: true },
            { label: '不要', value: '無効' },
          ],
        };
      }
      return null;
    };
    const hitSlot = (key: keyof Slots, slotValues: Slots, slotConfidence: Confidence) =>
      Boolean(slotValues[key]) && (slotConfidence[key] ?? 0) >= 0.6;
    const buildDelegateDefaults = (language: string) => {
      const now = new Date();
      const nextSaturdayOffset = (6 - now.getDay() + 7) % 7 || 7;
      const nextSaturday = new Date(now);
      nextSaturday.setDate(now.getDate() + nextSaturdayOffset);
      const yyyy = nextSaturday.getFullYear();
      const mm = String(nextSaturday.getMonth() + 1).padStart(2, '0');
      const dd = String(nextSaturday.getDate()).padStart(2, '0');
      const dateText = `${yyyy}-${mm}-${dd}`;
      return {
        time: `${dateText} 10:00-12:00`,
        location: 'オンライン',
        price: '無料',
        visibility: 'public',
        capacity: '10',
        registrationForm: '氏名,メール',
        requireApproval: '無効',
        enableWaitlist: '無効',
        requireCheckin: '無効',
        refundPolicy: language.startsWith('zh') ? '活动开始前3天可全额退款' : '開始3日前まで全額返金',
        riskNotice: language.startsWith('zh') ? '请准时集合，携带身份证明' : '遅刻連絡をお願いします',
        details: language.startsWith('zh') ? '細節稍後再調整' : '詳細は後で調整します',
      } as const;
    };
    const detectAskedSlot = (message: string): keyof Slots | null => {
      const lower = message.toLowerCase();
      if (/日時|いつ|何時|日程|時間/.test(message) || /(time|when)/.test(lower)) return 'time';
      if (/場所|どこ|会場|オンライン/.test(message) || /(where|location)/.test(lower)) return 'location';
      if (/参加費|料金|価格|いくら|予算/.test(message) || /(price|fee|cost|budget)/.test(lower))
        return 'price';
      if (/タイトル|題名/.test(message) || /(title|name)/.test(lower)) return 'title';
      if (/定員|人数/.test(message)) return 'capacity';
      if (/内容|詳細|説明|雰囲気/.test(message) || /(details|description)/.test(lower)) return 'details';
      if (/申込フォーム|申込項目|質問項目|フォーム項目/.test(message) || /(registration|form)/.test(lower))
        return 'registrationForm';
      if (/参加承認|承認/.test(message)) return 'requireApproval';
      if (/キャンセル待ち|待機リスト/.test(message)) return 'enableWaitlist';
      if (/チェックイン|検票|受付/.test(message)) return 'requireCheckin';
      if (/返金ポリシー|キャンセルポリシー|返金/.test(message)) return 'refundPolicy';
      if (/注意事項|免責|持ち物/.test(message)) return 'riskNotice';
      if (/公開|非公開|招待|招待制|限定|邀请/.test(message) || /(visibility|private|public|invite)/.test(lower))
        return 'visibility';
      return null;
    };
    const sanitizeAssistantQuestion = (
      message: string | undefined,
      nextKey: keyof Slots | null,
      slotValues: Slots,
      slotConfidence: Confidence,
      mode: AssistantInputMode,
      hasChoice: boolean,
    ) => {
      if (!message) return message ?? '';
      if (mode === 'compare' || hasChoice) return '次の1つを選んでください。';
      const askedSlot = detectAskedSlot(message);
      if (!askedSlot) return message;
      if (!nextKey) return '';
      if (askedSlot !== nextKey) return '';
      if (hitSlot(askedSlot, slotValues, slotConfidence)) return '';
      return message;
    };
    const buildCompareChoiceQuestion = (
      candidates: AiAssistantCompareCandidate[],
    ): AiAssistantChoiceQuestion | null => {
      if (!candidates || candidates.length < 2) return null;
      return {
        key: 'details',
        prompt: 'どちらの候補を先に作りますか？',
        options: candidates.map((candidate, idx) => ({
          label: `候補${candidate.id}: ${candidate.summary}`,
          value: `候補${candidate.id}`,
          recommended: idx === 0,
        })),
      };
    };
    const sanitize = (text?: string | null) => {
      if (!text) return text ?? '';
      const banned = ['AI 憲章', 'AI憲章', '憲章', 'AI Constitution', 'SOCIALMORE AI', 'SOCIALMORE', 'You are MORE App', 'Rules:'];
      const lower = text.toLowerCase();
      const hasLeak = banned.some((kw) => text.includes(kw)) || lower.includes('constitution');
      if (hasLeak || text.length > 400) return '';
      return text;
    };
    const conversation = (payload.conversation ?? []).slice(-12);
    const turnCount = conversation.filter((msg) => msg.role === 'user').length;
    const latestUserMessage =
      [...conversation].reverse().find((msg) => msg.role === 'user')?.content ?? '';
    const turnIndex = Math.max(0, turnCount - 1);
    const uiAction: EventAssistantUiAction = payload.uiAction ?? (payload.action ?? null);
    const baseLocale = payload.clientLocale ?? payload.baseLanguage ?? 'unknown';
    const baseTimezone = payload.clientTimezone ?? 'unknown';
    let logPromptPhase: DiagnosticPromptPhase = 'unknown';
    let logLoopTriggered = false;
    let logMissingKeys: string[] = [];
    let logCandidateKeys: string[] = [];
    let logConfirmedKeys: string[] = [];
    let logNextQuestionKey: string | null = null;
    let logDraftReady = false;
    let logDecisionTrace: Record<string, unknown> | null = null;
    let logMessageSource: string | null = null;
    let logPreviousAskedKey: string | null = null;
    let logParserTime = {
      rawText: null as string | null,
      candidateStartAt: null as string | null,
      candidateEndAt: null as string | null,
      confidence: null as number | null,
      ok: false,
      reason: 'not_attempted',
    };
    let logParserPrice = {
      rawText: null as string | null,
      candidateAmount: null as number | null,
      currency: null as string | null,
      type: null as string | null,
      confidence: null as number | null,
      ok: false,
      reason: 'not_attempted',
    };

    const buildDraftSummary = (draft?: AiAssistantPublicDraft | null) => {
      if (!draft) return null;
      return {
        title: draft.title ?? null,
        startAt: draft.schedule?.startTime ?? null,
        endAt: draft.schedule?.endTime ?? null,
        location: draft.schedule?.location ?? null,
        price: draft.price ?? null,
        capacity: draft.capacity ?? null,
      };
    };

    const emitTurnLog = async (reply: Partial<AiAssistantReply>) => {
      const uiMode = reply.ui?.mode === 'explain' || payload.uiMode === 'explain' ? 'explain' : 'normal';
      const assistantMessageText = reply.ui?.message ?? reply.message ?? '';
      const uiQuestionText = reply.ui?.question?.text ?? null;
      const draftSummary = buildDraftSummary(reply.publicActivityDraft as AiAssistantPublicDraft | null);
      const failureAnalysis = analyzeFailures({
        userText: latestUserMessage,
        previousAskedKey: logPreviousAskedKey,
        promptPhase: logPromptPhase,
        missingKeys: logMissingKeys,
        candidateKeys: logCandidateKeys,
        confirmedKeys: logConfirmedKeys,
        nextQuestionKey: logNextQuestionKey,
        draftReady: logDraftReady,
        uiMode,
        uiAction,
        parser: {
          timeOk: logParserTime.ok,
          priceOk: logParserPrice.ok,
        },
        draftSummary: {
          title: draftSummary?.title ?? null,
          startTime: draftSummary?.startAt ?? null,
          location: draftSummary?.location ?? null,
          price: draftSummary?.price ? String(draftSummary.price) : null,
        },
      });
      const entry: EventAssistantTurnLog = {
        ts: new Date().toISOString(),
        day: new Date().toISOString().slice(0, 10),
        env: (process.env.APP_ENV || process.env.NODE_ENV || 'dev').startsWith('prod')
          ? 'prod'
          : (process.env.APP_ENV || process.env.NODE_ENV || 'dev').startsWith('stg')
          ? 'stg'
          : 'dev',
        requestId,
        conversationId,
        turnIndex,
        input: {
          userText: latestUserMessage,
          uiAction,
          uiMode,
          locale: baseLocale,
          timezone: baseTimezone,
        },
        machine: {
          promptPhase: logPromptPhase,
          loopTriggered: logLoopTriggered,
          missingKeys: logMissingKeys,
          candidateKeys: logCandidateKeys,
          confirmedKeys: logConfirmedKeys,
          nextQuestionKey: logNextQuestionKey,
          draftReady: logDraftReady,
          messageSource: logMessageSource,
          decisionTrace: logDecisionTrace,
        },
        parser: {
          time: logParserTime,
          price: logParserPrice,
        },
        llm: {
          ledger: llmCallLedger,
          callsCount: llmCallLedger.filter((entry) => entry.allowed).length,
        },
        draft: {
          publicActivityDraft: draftSummary,
          draftHash: reply.draftId ?? null,
        },
        output: {
          assistantMessageText,
          uiQuestionText,
          choiceQuestion: reply.choiceQuestion
            ? ({ ...(reply.choiceQuestion as unknown as Record<string, unknown>) } as Record<string, unknown>)
            : null,
        },
        quality: {
          failureTypes: failureAnalysis.failureTypes,
          signals: failureAnalysis.signals,
        },
      };
      try {
        await writeTurnLog(redactTurnLog(entry));
      } catch (err) {
        console.warn('[EventAssistant] turn_log_write_failed', err);
      }
    };
    const finalizeAndReturn = async (reply: AiAssistantReply) => {
      logMessageSource = reply.messageSource ?? logMessageSource;
      logNextQuestionKey = reply.nextQuestionKey ?? null;
      logDraftReady = Boolean(reply.draftReady);
      await emitTurnLog(reply);
      return reply;
    };
    logDebug('user_input_received', {
      messageId: payload.messageId ?? null,
      rawText: latestUserMessage,
      locale: baseLocale,
      timezone: baseTimezone,
      turnCount,
    });
    const parseInitialUserMessage = async (): Promise<InitialParseResult | null> => {
      try {
        const client = this.client;
        if (!client) return null;
        if (!canCallLlm('initial_parse', { promptPhase: 'parse', loopTriggered: false, helpIntent: explicitHelpIntent || payload.uiMode === 'explain', turnIndex })) {
          return null;
        }
        const parseRequest = buildInitialParsePrompt({
          conversation: conversation.map((msg) => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content ?? '',
          })),
          userText: latestUserMessage,
        });
        const completion = await client.chat.completions.create({
          model: this.model,
          temperature: 0,
          response_format: {
            type: 'json_schema',
            json_schema: parseRequest.schema,
          },
          messages: [
            { role: 'system', content: parseRequest.systemPrompt },
            { role: 'user', content: JSON.stringify(parseRequest.userPayload) },
          ],
        });
        const raw = this.extractMessageContent(completion);
        return raw ? (JSON.parse(raw) as InitialParseResult) : null;
      } catch (err) {
        console.warn('[AiService] initial_parse_failed', err);
        return null;
      }
    };
    const interruptSelectionMatch = latestUserMessage.match(/【選択】\s*interrupt\s*[:：]\s*([a-z_]+)/i);
    const interruptChoice = interruptSelectionMatch?.[1]?.toLowerCase() ?? null;
    const metaCommentRaw = !interruptChoice && isMetaComment(latestUserMessage);
    const isSelectionAction = /【選択】/.test(latestUserMessage);
    const detectedLanguage = this.detectLanguage(latestUserMessage, payload.baseLanguage);
    const confirmDraft = payload.action === 'confirm_draft';
    const continueEdit = payload.action === 'continue_edit';
    if (confirmDraft || continueEdit) {
      logDebug('commit_action', {
        action: payload.action,
        messageId: payload.messageId ?? null,
      });
    }
    const resumeCollecting = payload.action === 'resume_collecting';
    const explicitHelpIntent = !interruptChoice && isHelpUtterance(latestUserMessage);
    const emptyConfidence: Confidence = {
      title: 0,
      time: 0,
      location: 0,
      price: 0,
      capacity: 0,
      details: 0,
      visibility: 0,
      registrationForm: 0,
      requireApproval: 0,
      enableWaitlist: 0,
      requireCheckin: 0,
      refundPolicy: 0,
      riskNotice: 0,
    };
    if (explicitHelpIntent && !resumeCollecting) {
      const explainMessage =
        detectedLanguage.startsWith('zh')
          ? '这是一个帮助你创建活动的助手。我会确认日期、地点、费用等关键信息，方便生成活动草稿。你可以继续回答当前问题，或者稍后手动编辑表单。'
          : detectedLanguage === 'en'
          ? 'This assistant helps you create an event. I confirm key details like time, place, and fee to draft the event. You can continue answering or edit the form later.'
          : 'これはイベント作成を手伝うアシスタントです。日時・場所・参加費など必要な情報を確認して草案を作ります。続ける場合は今の質問に答えてください。';
      return {
        status: 'collecting',
        state: 'collecting',
        stage: 'coach',
        promptVersion: 'help-intent-v1',
        language: detectedLanguage,
        turnCount,
        thinkingSteps: ['ヘルプ意図を検知しました'],
        editorChecklist: [],
        writerSummary: undefined,
        message: explainMessage,
        ui: {
          message: explainMessage,
          mode: 'explain',
        },
        choiceQuestion: undefined,
        compareCandidates: [],
        inputMode: 'describe',
        nextQuestionKey: null,
        slots: {},
        confidence: emptyConfidence,
        draftReady: false,
        applyEnabled: false,
        draftId: undefined,
        intent: 'unknown',
        modeHint: 'chat',
        uiMode: 'explain',
        messageSource: 'backend.ui',
      };
    }
    const inputMode = detectInputMode(latestUserMessage);
    const lastUserIndex = (() => {
      for (let i = conversation.length - 1; i >= 0; i -= 1) {
        if (conversation[i].role === 'user') return i;
      }
      return -1;
    })();
    const isInvalidTitleValue = (value?: string | null) => {
      if (!value) return true;
      return isDelegateTitleAnswer(value);
    };
    const isFreeText = (value?: string | null) => /無料|free/i.test(value ?? '');
    const hasExplicitTimeRange = (value?: string | null) => {
      if (!value) return false;
      return /(\d{1,2})(?::\d{2})?\s*[-〜~]\s*(\d{1,2})(?::\d{2})?/.test(value);
    };
    const hasExplicitPrice = (value?: string | null) => {
      if (!value) return false;
      return /(¥|￥|\bUSD\b|\bEUR\b|\bJPY\b|\$|円|元)\s*\d+|\d+\s*(円|元|usd|eur)|一人\s*\d+|每人\s*\d+/i.test(value);
    };
    const preExtracted = extractSlots(conversation, payload);
    const preSlots = preExtracted.slots;
    const preTimeSourceText = [preSlots.time, latestUserMessage].filter(Boolean).join(' ');
    const preStructuredTime = buildStructuredSchedule(preTimeSourceText);
    const preHasTimeRange =
      Boolean(preStructuredTime?.startTime) ||
      Boolean(preSlots.time) ||
      hasExplicitTimeRange(preTimeSourceText);
    const prePriceSourceText = [preSlots.price, preSlots.details, latestUserMessage]
      .filter(Boolean)
      .join(' ');
    const preHasPrice =
      Boolean(preSlots.price) ||
      isFreeText(preSlots.price) ||
      isFreeText(preSlots.details) ||
      hasExplicitPrice(prePriceSourceText);
    const preHasTitle =
      Boolean(preSlots.title && !isInvalidTitleValue(preSlots.title)) || Boolean(preSlots.details);
    const preHasLocation = Boolean(preSlots.location);
    const preHasDetails = Boolean(preSlots.details);
    const preRequiredAll =
      preHasTitle && preHasTimeRange && preHasLocation && preHasDetails && preHasPrice;
    const preOptCount = ['capacity', 'registrationForm', 'visibility'].filter(
      (key) => Boolean(preSlots[key as keyof Slots]),
    ).length;
    const preDraftReady =
      inputMode !== 'compare' &&
      (confirmDraft || (preRequiredAll && preOptCount >= 2) || (preRequiredAll && preOptCount >= 1 && turnCount >= 3));
    const prePromptPhase: EventAssistantPromptPhase =
      inputMode === 'compare' ? 'compare' : confirmDraft ? 'operate' : preDraftReady ? 'ready' : 'collecting';
    const preHasAllLabels =
      /イベント名|タイトル/.test(latestUserMessage) &&
      /(日付|日時|時間)/.test(latestUserMessage) &&
      /場所/.test(latestUserMessage) &&
      /(参加費|料金)/.test(latestUserMessage) &&
      /(説明|内容|詳細|参加条件)/.test(latestUserMessage);
    const shouldParsePhase =
      turnIndex === 0 &&
      prePromptPhase === 'collecting' &&
      !(preDraftReady || preRequiredAll || preHasAllLabels);
    let routerResult: RouterResult | null = null;
    const shouldRouteIntent =
      shouldParsePhase &&
      !explicitHelpIntent &&
      !interruptChoice &&
      !isSelectionAction &&
      !confirmDraft &&
      !resumeCollecting &&
      payload.uiMode !== 'explain' &&
      !metaCommentRaw &&
      Boolean(latestUserMessage.trim());
    if (shouldRouteIntent) {
      try {
        const client = this.client;
        if (!client) {
          routerResult = null;
        } else {
          if (canCallLlm('router', { promptPhase: 'parse', loopTriggered: false, helpIntent: explicitHelpIntent || payload.uiMode === 'explain', turnIndex })) {
            const routerRequest = buildRouterPrompt({
              conversation: conversation.map((msg) => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content ?? '',
              })),
              userText: latestUserMessage,
            });
            const routerCompletion = await client.chat.completions.create({
              model: this.model,
              temperature: 0,
              response_format: {
                type: 'json_schema',
                json_schema: routerRequest.schema,
              },
              messages: [
                { role: 'system', content: routerRequest.systemPrompt },
                { role: 'user', content: JSON.stringify(routerRequest.userPayload) },
              ],
            });
            const routerRaw = this.extractMessageContent(routerCompletion);
            routerResult = routerRaw ? (JSON.parse(routerRaw) as RouterResult) : null;
          } else {
            routerResult = null;
          }
        }
      } catch (err) {
        console.warn('[AiService] router_llm_failed', err);
      }
    }
    const shouldInitialParse =
      shouldParsePhase &&
      turnCount <= 1 &&
      !interruptChoice &&
      !isSelectionAction &&
      !confirmDraft &&
      !resumeCollecting &&
      payload.uiMode !== 'explain' &&
      !metaCommentRaw &&
      Boolean(latestUserMessage.trim());
    let initialParse: InitialParseResult | null = null;
    if (shouldInitialParse) {
      initialParse = await parseInitialUserMessage();
    }
    if (initialParse) {
      console.info('[AiService] initial_parse', {
        intent: initialParse.intent,
        slots: Object.keys(initialParse.slots ?? {}),
        missing: initialParse.missing,
      });
    }
    const persistExplainMode = payload.uiMode === 'explain' && !resumeCollecting;
    const helpIntent = !resumeCollecting && (explicitHelpIntent || persistExplainMode);
    const metaComment = metaCommentRaw && !helpIntent && payload.uiMode !== 'explain';
    const routedLanguage = initialParse?.language ?? routerResult?.language ?? detectedLanguage;
    const lastAssistantMessage =
      [...conversation].reverse().find((msg) => msg.role === 'assistant' && msg.content)?.content ?? '';
    const isReviseSelectStep = /どこを直したい|どこを修正/i.test(lastAssistantMessage || '');
    const lastAskedSlot = isReviseSelectStep ? null : detectAskedSlot(lastAssistantMessage);
    logPreviousAskedKey = lastAskedSlot ? String(lastAskedSlot) : null;
    const reviseState: 'select_field' | 'edit_field' | null =
      isReviseSelectStep ? 'select_field' : continueEdit && lastAskedSlot ? 'edit_field' : null;
    const conversationForSlots =
      (metaComment || helpIntent || isReviseSelectStep) && lastUserIndex >= 0
        ? conversation.slice(0, lastUserIndex)
        : conversation;
    const extracted = extractSlots(conversationForSlots, payload);
    const slots = extracted.slots;
    const confidence = extracted.confidence;
    const intent = extracted.intent;
    const slotOrigins = extracted.origins;
    const slotConfirmations = extracted.confirmations;
    const slotDenials = extracted.denials;
    const hasUnsupportedCurrency = detectUnsupportedCurrencyInput(latestUserMessage);
    const effectiveInputMode: AssistantInputMode = continueEdit ? 'fill' : inputMode;
    const compareCandidatesForPrompt =
      effectiveInputMode === 'compare' ? extractCompareCandidates(latestUserMessage) : [];
    const normalizedInputMode: AssistantInputMode =
      effectiveInputMode === 'compare' && compareCandidatesForPrompt.length < 2
        ? 'describe'
        : effectiveInputMode;
    const prevConversation = lastUserIndex >= 0 ? conversation.slice(0, lastUserIndex) : conversation;
    const prevExtracted = extractSlots(prevConversation, payload);
    const prevSlots = prevExtracted.slots;
    const prevConfidence = prevExtracted.confidence;
    const hasSlotDelta = (Object.keys(slots) as (keyof Slots)[]).some((key) => {
      const nextValue = slots[key];
      if (!nextValue) return false;
      return nextValue !== prevSlots[key];
    });
    const applyInitialParse = (parsed: InitialParseResult | null) => {
      if (!parsed) return;
      const parsedSlots = parsed.slots ?? {};
      if (parsedSlots.time) {
        logDebug('time_extract', {
          parser: 'llm_initial_parse',
          slotTime: parsedSlots.time,
          confidence: parsed.confidence?.time ?? null,
          messageId: payload.messageId ?? null,
        });
      }
      (Object.keys(parsedSlots) as (keyof Slots)[]).forEach((key) => {
        const value = parsedSlots[key];
        if (!value) return;
        if (key === 'time' || key === 'price' || key === 'capacity') return;
        if (key === 'title') {
          const trimmed = value.trim();
          if (!trimmed || isDelegateTitleAnswer(trimmed)) return;
          if (trimmed === latestUserMessage.trim()) return;
        }
        const conf = typeof parsed.confidence?.[key] === 'number' ? parsed.confidence?.[key] : 0.7;
        if ((confidence[key] ?? 0) <= conf) {
          slots[key] = value.trim();
          confidence[key] = conf;
          slotOrigins[key] = 'llm';
        }
      });
      if (turnCount <= 1 && slots.details === latestUserMessage.trim() && !parsed.slots?.details) {
        delete slots.details;
        confidence.details = 0;
      }
      if (turnCount <= 1 && slots.title === latestUserMessage.trim() && !parsed.slots?.title) {
        delete slots.title;
        confidence.title = 0;
      }
    };
    applyInitialParse(initialParse);
    const initialUnknownNoSlots =
      initialParse?.intent === 'UNKNOWN' && Object.keys(initialParse.slots ?? {}).length === 0;
    if (initialUnknownNoSlots) {
      const clarifyMessage =
        routedLanguage.startsWith('zh')
          ? '我还没理解你要创建的活动内容。请告诉我活动的标题、时间、地点或参加费中的任意一项。'
          : routedLanguage === 'en'
          ? 'I couldn’t understand the event yet. Please share any of: title, time, location, or price.'
          : 'まだイベントの内容が分かりません。タイトル・日時・場所・参加費のいずれかを教えてください。';
      logPromptPhase = 'collect';
      return await finalizeAndReturn({
        status: 'collecting',
        state: 'collecting',
        stage: 'coach',
        promptVersion: 'initial-unknown-v1',
        language: routedLanguage,
        turnCount,
        message: clarifyMessage,
        ui: { message: clarifyMessage },
        thinkingSteps: [],
        choiceQuestion: undefined,
        compareCandidates: [],
        inputMode: normalizedInputMode,
        nextQuestionKey: null,
        confidence,
        draftReady: false,
        applyEnabled: false,
        intent: 'unknown',
        messageSource: 'backend.ui',
      });
    }
    const followupUnknownNoDelta =
      !initialParse &&
      !helpIntent &&
      !metaComment &&
      !lastAskedSlot &&
      !hasSlotDelta &&
      Boolean(latestUserMessage.trim());
    if (followupUnknownNoDelta) {
      const clarifyMessage =
        routedLanguage.startsWith('zh')
          ? 'まだ必要な情報が分かりません。标题/时间/地点/参加费のどれかを教えてください。'
          : routedLanguage === 'en'
          ? 'I still need at least one detail. Please share a title, time, location, or price.'
          : 'まだ必要な情報が分かりません。タイトル・日時・場所・参加費のいずれかを教えてください。';
      logPromptPhase = 'collect';
      return await finalizeAndReturn({
        status: 'collecting',
        state: 'collecting',
        stage: 'coach',
        promptVersion: 'followup-unknown-v1',
        language: routedLanguage,
        turnCount,
        message: clarifyMessage,
        ui: { message: clarifyMessage },
        thinkingSteps: [],
        choiceQuestion: undefined,
        compareCandidates: [],
        inputMode: normalizedInputMode,
        nextQuestionKey: null,
        confidence,
        draftReady: false,
        applyEnabled: false,
        intent: 'unknown',
        messageSource: 'backend.ui',
      });
    }
    type FieldStatus = 'missing' | 'candidate' | 'confirmed';
    const clearDeniedSlots = () => {
      (Object.keys(slotDenials) as (keyof Slots)[]).forEach((key) => {
        if (!slotDenials[key]) return;
        delete slots[key];
        confidence[key] = 0;
      });
    };
    clearDeniedSlots();
    const resolveFieldStatus = (key: keyof Slots): FieldStatus => {
      const value = slots[key];
      if (!value) return 'missing';
      if (key === 'title' && isInvalidTitleValue(value)) return 'missing';
      if (slotConfirmations[key]) return 'confirmed';
      const origin = slotOrigins[key] ?? 'inferred';
      if (origin === 'explicit' && (confidence[key] ?? 0) >= 0.6) return 'confirmed';
      return 'candidate';
    };
    const fieldStatus: Record<keyof Slots, FieldStatus> = {
      title: resolveFieldStatus('title'),
      time: resolveFieldStatus('time'),
      location: resolveFieldStatus('location'),
      price: resolveFieldStatus('price'),
      capacity: resolveFieldStatus('capacity'),
      details: resolveFieldStatus('details'),
      visibility: resolveFieldStatus('visibility'),
      registrationForm: resolveFieldStatus('registrationForm'),
      requireApproval: resolveFieldStatus('requireApproval'),
      enableWaitlist: resolveFieldStatus('enableWaitlist'),
      requireCheckin: resolveFieldStatus('requireCheckin'),
      refundPolicy: resolveFieldStatus('refundPolicy'),
      riskNotice: resolveFieldStatus('riskNotice'),
    };
    logCandidateKeys = (Object.keys(fieldStatus) as (keyof Slots)[])
      .filter((key) => fieldStatus[key] === 'candidate')
      .map((key) => String(key));
    logConfirmedKeys = (Object.keys(fieldStatus) as (keyof Slots)[])
      .filter((key) => fieldStatus[key] === 'confirmed')
      .map((key) => String(key));
    logMissingKeys = (Object.keys(fieldStatus) as (keyof Slots)[])
      .filter((key) => fieldStatus[key] === 'missing')
      .map((key) => String(key));

    const parseReviseField = (text: string): keyof Slots | null => {
      if (!text) return null;
      if (/タイトル|題名|名前|ネーミング/i.test(text)) return 'title';
      if (/日時|日程|時間/i.test(text)) return 'time';
      if (/場所|会場|ロケーション/i.test(text)) return 'location';
      if (/参加費|料金|価格|予算/i.test(text)) return 'price';
      if (/説明|内容|詳細|紹介/i.test(text)) return 'details';
      if (/公開|非公開|招待|限定/i.test(text)) return 'visibility';
      if (/定員|人数/i.test(text)) return 'capacity';
      if (/申込フォーム|申込項目|フォーム項目|質問項目/i.test(text)) return 'registrationForm';
      if (/参加承認|承認/i.test(text)) return 'requireApproval';
      if (/キャンセル待ち|待機リスト/i.test(text)) return 'enableWaitlist';
      if (/チェックイン|検票/i.test(text)) return 'requireCheckin';
      if (/返金|キャンセルポリシー/i.test(text)) return 'refundPolicy';
      if (/注意事項|免責|持ち物/i.test(text)) return 'riskNotice';
      return null;
    };
    const isDelegateIntent = (text: string) => {
      if (!text) return false;
      return /任せ|おまかせ|まかせ|お願い|頼む|你来|你帮|帮我|帮忙|你決め|你决定/i.test(text);
    };
    const classifyReviseIntent = (
      reviseState: 'select_field' | 'edit_field' | null,
      text: string,
      selectedKey: keyof Slots | null,
    ) => {
      if (isDelegateIntent(text)) return 'DELEGATE';
      if (reviseState === 'select_field') {
        return selectedKey ? 'SELECT_FIELD' : 'SET_VALUE';
      }
      if (reviseState === 'edit_field') return 'SET_VALUE';
      return 'SET_VALUE';
    };

    if (helpIntent) {
      const explainMessage =
        routedLanguage.startsWith('zh')
          ? '这是一个帮助你创建活动的助手。我会确认日期、地点、费用等关键信息，方便生成活动草稿。你可以继续回答当前问题，或者稍后手动编辑表单。'
          : routedLanguage === 'en'
          ? 'This assistant helps you create an event. I confirm key details like time, place, and fee to draft the event. You can continue answering or edit the form later.'
          : 'これはイベント作成を手伝うアシスタントです。日時・場所・参加費など必要な情報を確認して草案を作ります。続ける場合は今の質問に答えてください。';
      logPromptPhase = 'collect';
      return await finalizeAndReturn({
        status: 'collecting',
        state: 'collecting',
        stage: 'coach',
        promptVersion: 'help-intent-v1',
        language: routedLanguage,
        turnCount,
        thinkingSteps: ['ヘルプ意図を検知しました'],
        editorChecklist: [],
        writerSummary: undefined,
        message: explainMessage,
        ui: {
          message: explainMessage,
          mode: 'explain',
        },
        choiceQuestion: undefined,
        compareCandidates: [],
        inputMode: 'describe',
        nextQuestionKey: null,
        slots,
        confidence,
        draftReady: false,
        applyEnabled: false,
        draftId: undefined,
        intent: intent,
        modeHint: 'chat',
        uiMode: 'explain',
        messageSource: 'backend.ui',
      });
    }

    if (isReviseSelectStep) {
      const selectedKey = parseReviseField(latestUserMessage);
      const reviseIntent = classifyReviseIntent(reviseState, latestUserMessage, selectedKey);
      logDebug('revise_intent', { reviseState, reviseIntent, selectedKey });
      if (reviseIntent === 'DELEGATE') {
        logPromptPhase = 'revise_select';
        return await finalizeAndReturn({
          status: 'collecting',
          state: 'collecting',
          stage: 'coach',
          promptVersion: 'revise-select-v1',
          language: routedLanguage,
          turnCount,
          thinkingSteps: ['修正項目を選びます'],
          editorChecklist: [],
          writerSummary: undefined,
          message: '',
          ui: {
            message: '直したい項目を教えてください。（例：日時 / 場所 / 参加費 / 説明 / 申込フォーム）',
          },
          choiceQuestion: undefined,
          compareCandidates: [],
          inputMode: 'fill',
          nextQuestionKey: null,
          slots,
          confidence,
          draftReady: false,
          applyEnabled: false,
          draftId: undefined,
          intent: intent,
          modeHint: 'chat',
          messageSource: 'backend.ui',
        });
      }
      if (!selectedKey) {
        logPromptPhase = 'revise_select';
        return await finalizeAndReturn({
          status: 'collecting',
          state: 'collecting',
          stage: 'coach',
          promptVersion: 'revise-select-v1',
          language: routedLanguage,
          turnCount,
          thinkingSteps: ['修正項目を選びます'],
          editorChecklist: [],
          writerSummary: undefined,
        message: '',
        ui: {
            message: '直したい項目を教えてください。（例：日時 / 場所 / 参加費 / 説明 / 申込フォーム）',
        },
          choiceQuestion: undefined,
          compareCandidates: [],
          inputMode: 'fill',
          nextQuestionKey: null,
          slots,
          confidence,
          draftReady: false,
          applyEnabled: false,
          draftId: undefined,
          intent: intent,
          modeHint: 'chat',
          messageSource: 'backend.ui',
        });
      }
      logPromptPhase = 'revise_select';
      return await finalizeAndReturn({
        status: 'collecting',
        state: 'collecting',
        stage: 'coach',
        promptVersion: 'revise-select-v1',
        language: routedLanguage,
        turnCount,
        thinkingSteps: ['修正項目を受け取りました'],
        editorChecklist: [],
        writerSummary: undefined,
        message: '',
        ui: {
          question: { key: selectedKey, text: buildFallbackQuestionText(selectedKey) },
        },
        choiceQuestion: undefined,
        compareCandidates: [],
        inputMode: 'fill',
        nextQuestionKey: selectedKey,
        slots,
        confidence,
        draftReady: false,
        applyEnabled: false,
        draftId: undefined,
        intent: intent,
        modeHint: 'chat',
        messageSource: 'backend.ui',
      });
    }
    if (reviseState === 'edit_field' && isDelegateIntent(latestUserMessage)) {
      logDebug('revise_intent', { reviseState, reviseIntent: 'DELEGATE', selectedKey: null });
      logPromptPhase = 'revise_edit';
      return await finalizeAndReturn({
        status: 'collecting',
        state: 'collecting',
        stage: 'coach',
        promptVersion: 'revise-select-v1',
        language: routedLanguage,
        turnCount,
        thinkingSteps: ['修正項目を選びます'],
        editorChecklist: [],
        writerSummary: undefined,
        message: '',
        ui: {
          message: '直したい項目を教えてください。（例：日時 / 場所 / 参加費 / 説明 / 申込フォーム）',
        },
        choiceQuestion: undefined,
        compareCandidates: [],
        inputMode: 'fill',
        nextQuestionKey: null,
        slots,
        confidence,
        draftReady: false,
        applyEnabled: false,
        draftId: undefined,
        intent: intent,
        modeHint: 'chat',
        messageSource: 'backend.ui',
      });
    }
    const timeSourceText = [slots.time, latestUserMessage].filter(Boolean).join(' ');
    const structuredTime = buildStructuredSchedule(timeSourceText);
    const priceSourceText = [slots.price, slots.details, latestUserMessage].filter(Boolean).join(' ');
    logDebug('time_parse', {
      parser: 'rule',
      sourceText: timeSourceText,
      candidateStartAt: structuredTime?.startTime ?? null,
      candidateEndAt: structuredTime?.endTime ?? null,
      slotTime: slots.time ?? null,
      confidence: confidence.time ?? null,
      needsConfirmation: Boolean(slots.time) && (confidence.time ?? 0) < 0.6,
      messageId: payload.messageId ?? null,
    });
    const timeOk = Boolean(structuredTime?.startTime || slots.time || hasExplicitTimeRange(timeSourceText));
    logParserTime = {
      rawText: timeSourceText || null,
      candidateStartAt: structuredTime?.startTime ?? null,
      candidateEndAt: structuredTime?.endTime ?? null,
      confidence: confidence.time ?? null,
      ok: timeOk,
      reason: timeOk ? 'parsed' : timeSourceText.trim() ? 'no_range' : 'no_date',
    };
    const priceRaw = slots.price || priceSourceText || '';
    const priceAmountMatch = priceRaw.match(/(\d{1,5})/);
    const priceAmount = priceAmountMatch ? Number(priceAmountMatch[1]) : null;
    const priceType = /\/人|一人|每人/.test(priceRaw) ? 'per_person' : isFreeText(priceRaw) ? 'free' : 'flat';
    const priceOk = Boolean(priceAmount || isFreeText(priceRaw));
    logParserPrice = {
      rawText: priceRaw || null,
      candidateAmount: priceAmount && !Number.isNaN(priceAmount) ? priceAmount : null,
      currency: priceOk ? 'JPY' : null,
      type: priceOk ? priceType : null,
      confidence: confidence.price ?? null,
      ok: priceOk,
      reason: priceOk ? 'parsed' : priceRaw.trim() ? 'no_amount' : 'ambiguous',
    };
    const isConfirmed = (k: keyof Slots) => fieldStatus[k] === 'confirmed';
    const computeMissingKeysInferred = (): (keyof Slots)[] => {
      const missing: (keyof Slots)[] = [];
      if (fieldStatus.title === 'missing') missing.push('title');
      if (fieldStatus.time === 'missing') missing.push('time');
      if (fieldStatus.location === 'missing') missing.push('location');
      if (fieldStatus.details === 'missing') missing.push('details');
      if (fieldStatus.price === 'missing') missing.push('price');
      return missing;
    };
    const requiredAll = requiredSlots.every(isConfirmed);
    const optCount = primaryOptionalSlots.filter(isConfirmed).length;
    const fastPath = requiredAll && optCount >= 2;
    const slowPath = requiredAll && optCount >= 1 && turnCount >= 3;
    const isCompareMode = normalizedInputMode === 'compare';
    const baseDraftReady = !isCompareMode && (confirmDraft || fastPath || slowPath);

    // explain mode is handled before slot updates
    const unknownParseNoSlots =
      initialParse?.intent === 'UNKNOWN' && Object.keys(initialParse.slots ?? {}).length === 0;
    if (
      unknownParseNoSlots &&
      !helpIntent &&
      !metaComment &&
      normalizedInputMode !== 'compare' &&
      latestUserMessage.trim()
    ) {
      const clarifyMessage = buildUnrelatedAnswerMessageByLanguage(lastAskedSlot);
      logPromptPhase = 'collect';
      return await finalizeAndReturn({
        status: 'collecting',
        state: 'collecting',
        stage: 'coach',
        promptVersion: 'collecting-unknown-v1',
        language: routedLanguage,
        turnCount,
        message: clarifyMessage,
        ui: { message: clarifyMessage },
        thinkingSteps: [],
        choiceQuestion: undefined,
        compareCandidates: [],
        inputMode: normalizedInputMode,
        nextQuestionKey: null,
        confidence,
        draftReady: false,
        applyEnabled: false,
        intent: 'unknown',
        messageSource: 'backend.ui',
      });
    }
    const askedSet = new Set<keyof Slots>();
    conversation
      .filter((msg) => msg.role === 'assistant')
      .forEach((msg) => {
        const text = (msg.content || '').toLowerCase();
        if (/日時|いつ|日程/.test(text)) askedSet.add('time');
        if (/場所|どこ|会場|オンライン/.test(text)) askedSet.add('location');
        if (/参加費|料金|有料|無料|価格|予算/.test(text)) askedSet.add('price');
        if (/公開|非公開|招待|招待制|限定|邀请/.test(text)) askedSet.add('visibility');
        if (/定員|人数/.test(text)) askedSet.add('capacity');
        if (/内容|詳細|説明|雰囲気/.test(text)) askedSet.add('details');
        if (/申込フォーム|申込項目|質問項目|フォーム項目/.test(text)) askedSet.add('registrationForm');
        if (/参加承認|承認/.test(text)) askedSet.add('requireApproval');
        if (/キャンセル待ち|待機リスト/.test(text)) askedSet.add('enableWaitlist');
        if (/チェックイン|検票|受付/.test(text)) askedSet.add('requireCheckin');
        if (/返金ポリシー|返金/.test(text)) askedSet.add('refundPolicy');
        if (/注意事項|免責|持ち物/.test(text)) askedSet.add('riskNotice');
      });
    const lastUserAnswer = latestUserMessage.trim();
    const delegateDefaults = buildDelegateDefaults(routedLanguage);
    let delegateApplied = false;
    let autoGeneratedTitle: string | null = null;
    let unrelatedAnswerKey: keyof Slots | null = null;
    if (lastAskedSlot && lastUserAnswer && !isReviseSelectStep) {
      const selectionPattern = /【選択】\s*([a-zA-Z_]+)\s*[:：]\s*(.+)/;
      const isSelectionAnswer = selectionPattern.test(lastUserAnswer);
      const isDelegateInput = isDelegateAnswer(lastUserAnswer) || isDelegateTitleAnswer(lastUserAnswer);
      const isEditFieldDelegate =
        Boolean(continueEdit && reviseState === 'edit_field' && isDelegateAnswer(lastUserAnswer));
      const isRelevantAnswer =
        isDelegateInput || isLikelyAnswerForSlot(lastAskedSlot, lastUserAnswer);
      if (isEditFieldDelegate) {
        unrelatedAnswerKey = lastAskedSlot;
      }
      if (!isSelectionAnswer && !isRelevantAnswer) {
        unrelatedAnswerKey = lastAskedSlot;
      }
      if (!isSelectionAnswer && !unrelatedAnswerKey && !isEditFieldDelegate) {
        const recoveredPrice = normalizePriceAnswer(lastUserAnswer);
        if (recoveredPrice && lastAskedSlot !== 'price') {
          slots.price = recoveredPrice;
          confidence.price = Math.max(confidence.price ?? 0, 0.85);
          slotOrigins.price = 'explicit';
        } else if (lastAskedSlot === 'title' && isDelegateTitleAnswer(lastUserAnswer)) {
          delegateApplied = true;
          try {
            const timeSourceText = slots.time ?? '';
            const structuredSchedule = buildStructuredSchedule(timeSourceText);
            const draftBase: AiAssistantPublicDraft = {
              title: undefined,
              shortDescription: '',
              detailedDescription: '',
              schedule:
                slots.time || slots.location
                  ? {
                      date: slots.time || undefined,
                      location: slots.location || undefined,
                      startTime: structuredSchedule?.startTime,
                      endTime: structuredSchedule?.endTime,
                    }
                  : undefined,
              price: slots.price || (isFreeText(slots.details) ? '無料' : undefined),
              capacity: slots.capacity || undefined,
              signupNotes: slots.details || undefined,
            };
            const suggestions = canCallLlm('title_suggestions', {
              promptPhase: 'collect',
              loopTriggered: false,
              helpIntent,
              turnIndex,
            })
              ? (await this.generateTitleSuggestions(draftBase, routedLanguage)) ||
                buildTitleSuggestions(slots)
              : buildTitleSuggestions(slots);
            const candidate = suggestions?.[0]?.trim() || '';
            if (candidate && isSafeTitleSuggestion(candidate, latestUserMessage)) {
              slots.title = candidate;
              confidence.title = Math.max(confidence.title ?? 0, 0.8);
              slotOrigins.title = 'llm';
              autoGeneratedTitle = candidate;
            }
          } catch (err) {
            const fallback = buildTitleSuggestions(slots)[0];
            if (fallback) {
              slots.title = fallback;
              confidence.title = Math.max(confidence.title ?? 0, 0.7);
              slotOrigins.title = 'llm';
              autoGeneratedTitle = fallback;
            }
          }
        } else if (isDelegateAnswer(lastUserAnswer)) {
          if (lastAskedSlot === 'price') {
            slots.price = delegateDefaults.price;
            confidence.price = Math.max(confidence.price ?? 0, 0.7);
            slotOrigins.price = 'inferred';
            delegateApplied = true;
          } else if (lastAskedSlot === 'time') {
            slots.time = delegateDefaults.time;
            confidence.time = Math.max(confidence.time ?? 0, 0.65);
            slotOrigins.time = 'inferred';
            delegateApplied = true;
          } else if (lastAskedSlot === 'location') {
            slots.location = delegateDefaults.location;
            confidence.location = Math.max(confidence.location ?? 0, 0.65);
            slotOrigins.location = 'inferred';
            delegateApplied = true;
          } else if (lastAskedSlot === 'visibility') {
            slots.visibility = delegateDefaults.visibility;
            confidence.visibility = Math.max(confidence.visibility ?? 0, 0.65);
            slotOrigins.visibility = 'inferred';
            delegateApplied = true;
          } else if (lastAskedSlot === 'capacity') {
            slots.capacity = delegateDefaults.capacity;
            confidence.capacity = Math.max(confidence.capacity ?? 0, 0.6);
            slotOrigins.capacity = 'inferred';
            delegateApplied = true;
          } else if (lastAskedSlot === 'details') {
            slots.details = delegateDefaults.details;
            confidence.details = Math.max(confidence.details ?? 0, 0.6);
            slotOrigins.details = 'inferred';
            delegateApplied = true;
          } else if (lastAskedSlot === 'registrationForm') {
            slots.registrationForm = delegateDefaults.registrationForm;
            confidence.registrationForm = Math.max(confidence.registrationForm ?? 0, 0.6);
            slotOrigins.registrationForm = 'inferred';
            delegateApplied = true;
          }
        } else if (lastAskedSlot === 'price') {
          const normalized = normalizePriceAnswer(lastUserAnswer);
          if (normalized) {
            slots.price = normalized;
            confidence.price = Math.max(confidence.price ?? 0, 0.85);
            slotOrigins.price = 'explicit';
          } else if (isLikelyPriceFreeText(lastUserAnswer)) {
            slots.price = lastUserAnswer;
            confidence.price = Math.max(confidence.price ?? 0, 0.65);
            slotOrigins.price = 'explicit';
          }
        } else if (lastAskedSlot === 'registrationForm') {
          const normalized = normalizeRegistrationFormAnswer(lastUserAnswer);
          if (normalized) {
            slots.registrationForm = normalized;
            confidence.registrationForm = Math.max(confidence.registrationForm ?? 0, 0.75);
            slotOrigins.registrationForm = 'explicit';
          }
        } else if (lastAskedSlot === 'requireApproval') {
          const normalized = normalizeToggleAnswer(lastUserAnswer);
          if (normalized) {
            slots.requireApproval = normalized;
            confidence.requireApproval = Math.max(confidence.requireApproval ?? 0, 0.7);
            slotOrigins.requireApproval = 'explicit';
          }
        } else if (lastAskedSlot === 'enableWaitlist') {
          const normalized = normalizeToggleAnswer(lastUserAnswer);
          if (normalized) {
            slots.enableWaitlist = normalized;
            confidence.enableWaitlist = Math.max(confidence.enableWaitlist ?? 0, 0.7);
            slotOrigins.enableWaitlist = 'explicit';
          }
        } else if (lastAskedSlot === 'requireCheckin') {
          const normalized = normalizeToggleAnswer(lastUserAnswer);
          if (normalized) {
            slots.requireCheckin = normalized;
            confidence.requireCheckin = Math.max(confidence.requireCheckin ?? 0, 0.7);
            slotOrigins.requireCheckin = 'explicit';
          }
        } else if (lastAskedSlot === 'refundPolicy') {
          if (lastUserAnswer) {
            slots.refundPolicy = lastUserAnswer;
            confidence.refundPolicy = Math.max(confidence.refundPolicy ?? 0, 0.7);
            slotOrigins.refundPolicy = 'explicit';
          }
        } else if (lastAskedSlot === 'riskNotice') {
          if (lastUserAnswer) {
            slots.riskNotice = lastUserAnswer;
            confidence.riskNotice = Math.max(confidence.riskNotice ?? 0, 0.7);
            slotOrigins.riskNotice = 'explicit';
          }
        } else if (lastAskedSlot === 'visibility') {
          const normalized = normalizeVisibilityAnswer(lastUserAnswer);
          if (normalized) {
            slots.visibility = normalized;
            confidence.visibility = Math.max(confidence.visibility ?? 0, 0.8);
            slotOrigins.visibility = 'explicit';
          }
        } else if (lastAskedSlot === 'location') {
          const normalized = normalizeLocationAnswer(lastUserAnswer);
          if (normalized) {
            slots.location = normalized;
            confidence.location = Math.max(confidence.location ?? 0, 0.75);
            slotOrigins.location = 'explicit';
          }
        } else if (lastAskedSlot === 'time') {
          const normalized = normalizeTimeAnswer(lastUserAnswer);
          if (normalized) {
            slots.time = normalized;
            confidence.time = Math.max(confidence.time ?? 0, 0.75);
            slotOrigins.time = 'explicit';
          }
        } else if (
          FREE_TEXT_SLOTS.has(lastAskedSlot) &&
          !slots[lastAskedSlot] &&
          !delegateApplied &&
          !isDelegateTitleAnswer(lastUserAnswer)
        ) {
          slots[lastAskedSlot] = lastUserAnswer;
          confidence[lastAskedSlot] = Math.max(confidence[lastAskedSlot] ?? 0, 0.7);
          slotOrigins[lastAskedSlot] = 'explicit';
        }
      }
    }

    if (interruptChoice === 'skip' && lastAskedSlot) {
      slots[lastAskedSlot] = slots[lastAskedSlot] || '未定';
      confidence[lastAskedSlot] = Math.max(confidence[lastAskedSlot] ?? 0, 0.6);
    }

    const recentTurns: Array<{ key: string; answer: string }> = [];
    let pendingKey: string | null = null;
    conversation.slice(-12).forEach((msg) => {
      if (msg.role === 'assistant') {
        const key = detectAskedSlot(msg.content || '');
        if (key) pendingKey = key;
      } else if (msg.role === 'user' && pendingKey) {
        recentTurns.push({ key: pendingKey, answer: msg.content });
        pendingKey = null;
      }
    });

    const pickNextQuestion = (missing: (keyof Slots)[]) => {
      const priority: (keyof Slots)[] = [
        'time',
        'location',
        'title',
        'price',
        'details',
        'registrationForm',
        'visibility',
        'capacity',
        'requireApproval',
        'enableWaitlist',
        'requireCheckin',
        'refundPolicy',
        'riskNotice',
      ];
      for (const key of priority) {
        if (askedSet.has(key)) continue;
        if (missing.includes(key)) return key;
      }
      for (const key of priority) {
        if (missing.includes(key)) return key;
      }
      return null;
    };
    const missingRequired = requiredSlots.filter((k) => fieldStatus[k] === 'missing');
    const missingOptional = primaryOptionalSlots.concat(secondaryOptionalSlots).filter((k) => fieldStatus[k] === 'missing');
    const missingMvpKeys = baseDraftReady ? computeMissingKeysInferred() : [];
    let draftReady = !continueEdit && baseDraftReady && missingMvpKeys.length === 0;
    let missingAll = missingMvpKeys.length ? missingMvpKeys : [...missingRequired];
    const missingAllBeforeNormalizer = [...missingAll];
    if (missingAll.length > 1) {
      missingAll = Array.from(new Set(missingAll));
    }
    if (draftReady || confirmDraft) {
      missingAll = [];
    }
    logMissingKeys = missingAll.map((key) => String(key));
    const confirmPriority: (keyof Slots)[] = ['time', 'price', 'location', 'title', 'details', 'capacity'];
    const candidateKeys = confirmPriority.filter((key) => fieldStatus[key] === 'candidate');
    let pendingConfirmKey: keyof Slots | null = candidateKeys[0] ?? null;
    if (continueEdit) {
      pendingConfirmKey = null;
    }
    if (normalizedInputMode === 'compare') {
      pendingConfirmKey = null;
    }
    if (pendingConfirmKey && missingAll.length) {
      pendingConfirmKey = null;
    }
    // initialMissingOverride intentionally removed: single-source missing keys
    let confirmationChoiceQuestion: AiAssistantChoiceQuestion | null = null;
    if (pendingConfirmKey && slots[pendingConfirmKey]) {
      const yesLabel = routedLanguage.startsWith('zh') ? '是的' : 'はい';
      const noLabel = routedLanguage.startsWith('zh') ? '不是' : 'いいえ';
      confirmationChoiceQuestion = {
        key: `confirm_${pendingConfirmKey}` as unknown as keyof Slots,
        prompt: sanitize(buildConfirmPrompt(pendingConfirmKey, String(slots[pendingConfirmKey] ?? ''))),
        options: [
          { label: sanitize(yesLabel), value: 'yes', recommended: true },
          { label: sanitize(noLabel), value: 'no' },
        ],
      };
    }
    if (missingAll.length && !draftReady && !confirmDraft) {
      const buildMissingReason = (key: keyof Slots) => {
        if (key === 'title') {
          if (slots.title && isInvalidTitleValue(slots.title)) return '被拒绝写入';
          if (slots.title && (confidence.title ?? 0) < 0.6) return '需要确认';
          return '未解析';
        }
        if (key === 'time') {
          if (timeSourceText.trim() && !structuredTime?.startTime && !hasExplicitTimeRange(timeSourceText)) {
            return '解析失败';
          }
          if (slots.time && (confidence.time ?? 0) < 0.6) return '需要确认';
          return '未解析';
        }
        if (key === 'price') {
          if (priceSourceText.trim() && !slots.price && !isFreeText(priceSourceText) && !hasExplicitPrice(priceSourceText)) {
            return '解析失败';
          }
          if (slots.price && (confidence.price ?? 0) < 0.6) return '需要确认';
          return '未解析';
        }
        if (slots[key] && (confidence[key] ?? 0) < 0.6) return '需要确认';
        return '未解析';
      };
      const missingReasons = Object.fromEntries(missingAll.map((key) => [key, buildMissingReason(key)]));
      logDebug('missing_fields', {
        missingFields: missingAll,
        reasons: missingReasons,
        messageId: payload.messageId ?? null,
      });
    }
    const forcedNextQuestionKey = continueEdit ? 'details' : hasUnsupportedCurrency ? 'price' : null;
    let nextQuestionKeyLocked = Boolean(forcedNextQuestionKey);
    let nextQuestionKeyCandidate =
      forcedNextQuestionKey ?? (draftReady || confirmationChoiceQuestion ? null : pickNextQuestion(missingAll));
    const getAskCount = (key: keyof Slots | null) =>
      key
        ? conversation.filter(
            (msg) => msg.role === 'assistant' && detectAskedSlot(msg.content || '') === key,
          ).length
        : 0;
    if (
      nextQuestionKeyCandidate &&
      lastAskedSlot &&
      nextQuestionKeyCandidate === lastAskedSlot &&
      missingAll.some((key) => key !== lastAskedSlot)
    ) {
      const remaining = missingAll.filter((key) => key !== lastAskedSlot);
      const fallback = remaining.length ? pickNextQuestion(remaining) : null;
      if (fallback) {
        nextQuestionKeyCandidate = fallback;
        nextQuestionKeyLocked = true;
      }
    }
    let askCount = getAskCount(nextQuestionKeyCandidate);
    if (
      askCount >= 2 &&
      nextQuestionKeyCandidate &&
      lastAskedSlot &&
      nextQuestionKeyCandidate === lastAskedSlot
    ) {
      const remaining = missingAll.filter((key) => key !== lastAskedSlot);
      const fallback = remaining.length ? pickNextQuestion(remaining) : null;
      if (fallback) {
        nextQuestionKeyCandidate = fallback;
        nextQuestionKeyLocked = true;
        askCount = getAskCount(nextQuestionKeyCandidate);
      }
    }
    if (!nextQuestionKeyLocked && nextQuestionKeyCandidate) {
      nextQuestionKeyLocked = true;
    }
    const loopTriggered = Boolean(nextQuestionKeyCandidate && askCount >= 2);
    logLoopTriggered = loopTriggered;
    if (loopTriggered && nextQuestionKeyCandidate && turnCount >= 2) {
      try {
        const client = this.client;
        if (!client) {
          throw new Error('OpenAI client is not configured');
        }
        if (!canCallLlm('normalizer', { promptPhase: 'collect', loopTriggered: true, helpIntent, turnIndex })) {
          throw new Error('LLM gated');
        }
        normalizerUsed = true;
        const normalizerRequest = buildSlotNormalizerPrompt({
          rawUserText: latestUserMessage,
          currentSlots: slots,
          currentNextQuestionKey: nextQuestionKeyCandidate,
          recentTurns,
        });
        const normalizerCompletion = await client.chat.completions.create({
          model: this.model,
          temperature: 0,
          response_format: {
            type: 'json_schema',
            json_schema: normalizerRequest.schema,
          },
          messages: [
            { role: 'system', content: normalizerRequest.systemPrompt },
            { role: 'user', content: JSON.stringify(normalizerRequest.userPayload) },
          ],
        });
        const normalizerRaw = this.extractMessageContent(normalizerCompletion);
        const normalizerResult = normalizerRaw
          ? (JSON.parse(normalizerRaw) as SlotNormalizerResult)
          : null;
        if (normalizerResult) {
          console.info('[AiService] loop_breaker_triggered', {
            key: nextQuestionKeyCandidate,
            askCount,
            intent: normalizerResult.intent,
            updates: normalizerResult.updates,
            ambiguities: normalizerResult.ambiguities,
          });
          if (normalizerResult.intent && normalizerResult.intent !== 'answer') {
            const missingKeys = computeMissingKeysInferred();
            if (missingKeys.length === 1 && missingKeys[0] === 'price') {
              const questionText = buildFallbackQuestionText('price');
              logPromptPhase = 'collect';
              return await finalizeAndReturn({
                status: 'collecting',
                state: 'collecting',
                stage: 'coach',
                promptVersion: 'interrupt-direct-price-v1',
                language: detectedLanguage,
                turnCount,
                thinkingSteps: ['参加費の確認に戻ります'],
                editorChecklist: [],
                writerSummary: undefined,
                message: '',
                ui: {
                  question: { key: 'price', text: questionText },
                },
                choiceQuestion: undefined,
                compareCandidates: [],
                inputMode: normalizedInputMode,
                nextQuestionKey: null,
                slots,
                confidence,
                draftReady: false,
                applyEnabled: false,
                draftId: undefined,
                intent: intent,
                modeHint: 'chat',
                messageSource: 'backend.normalizer',
              });
            }
            const missingLabels = missingKeys
              .map((key) => {
              switch (key) {
                case 'price':
                  return '参加費';
                case 'time':
                  return '日時';
                case 'location':
                  return '場所';
                case 'details':
                  return '内容';
                case 'title':
                  return 'タイトル';
                case 'visibility':
                  return '公開範囲';
                case 'registrationForm':
                  return '申込フォーム';
                case 'requireApproval':
                  return '参加承認';
                case 'enableWaitlist':
                  return 'キャンセル待ち';
                case 'requireCheckin':
                  return 'チェックイン';
                case 'refundPolicy':
                  return '返金ポリシー';
                case 'riskNotice':
                  return '注意事項';
                default:
                  return null;
              }
              })
              .filter(Boolean)
              .join('・');
            const statusText = missingLabels ? `今は「${missingLabels}」が未確定です。` : '必要な情報はそろっています。';
            logPromptPhase = 'collect';
            return await finalizeAndReturn({
              status: 'collecting',
              state: 'collecting',
              stage: 'coach',
              promptVersion: 'interrupt-v1',
              language: detectedLanguage,
              turnCount,
              thinkingSteps: ['ユーザーの意見を受け止めました'],
              editorChecklist: [],
              writerSummary: undefined,
              message: statusText,
              ui: {
                message: `ご指摘ありがとう。${statusText}続け方を選んでください。`,
              },
              choiceQuestion: {
                key: 'interrupt' as keyof Slots,
                prompt: 'どう進めますか？',
                options: [
                  { label: '続けて質問に答える', value: 'continue', recommended: true },
                  { label: 'この質問はスキップ', value: 'skip' },
                  { label: 'いま下書きを見る', value: 'preview' },
                  { label: 'フォームを手動で編集', value: 'manual' },
                ],
              },
              compareCandidates: [],
              inputMode: normalizedInputMode,
              nextQuestionKey: null,
              slots,
              confidence,
              draftReady: false,
              applyEnabled: false,
              draftId: undefined,
              intent: intent,
              modeHint: 'chat',
              messageSource: 'backend.normalizer',
            });
          }
          const updated = normalizerResult.updates?.[nextQuestionKeyCandidate];
          if (updated?.normalizedValue || updated?.value) {
            const value = updated.normalizedValue || updated.value;
            slots[nextQuestionKeyCandidate] = value ?? slots[nextQuestionKeyCandidate];
            confidence[nextQuestionKeyCandidate] = Math.max(confidence[nextQuestionKeyCandidate] ?? 0, 0.85);
          }
          if (normalizerResult.shouldCloseSlot) {
            confidence[nextQuestionKeyCandidate] = Math.max(confidence[nextQuestionKeyCandidate] ?? 0, 0.85);
          }
          if (normalizerResult.ambiguities?.length) {
            const ambiguity = normalizerResult.ambiguities.find(
              (item) => item.slotKey === nextQuestionKeyCandidate,
            );
            if (ambiguity?.candidates?.length) {
              logPromptPhase = 'collect';
              return await finalizeAndReturn({
                status: 'collecting',
                state: 'collecting',
                stage: 'coach',
                promptVersion: 'loop-breaker-v1',
                language: detectedLanguage,
                turnCount,
                thinkingSteps: ['確認が必要です'],
                editorChecklist: [],
                writerSummary: undefined,
                message: '',
                ui: {
                  message: ambiguity.questionSuggestion || 'どちらが近いですか？',
                },
                choiceQuestion: {
                  key: nextQuestionKeyCandidate,
                  prompt: ambiguity.questionSuggestion || 'どちらが近いですか？',
                  options: ambiguity.candidates.slice(0, 4).map((candidate, idx) => ({
                    label: candidate,
                    value: candidate,
                    recommended: idx === 0,
                  })),
                },
                compareCandidates: [],
                inputMode: normalizedInputMode,
                nextQuestionKey: null,
                slots,
                confidence,
                draftReady: false,
                applyEnabled: false,
                draftId: undefined,
                intent: intent,
                modeHint: 'chat',
                messageSource: 'backend.normalizer',
              });
            }
          }
          missingMvpKeys.length = 0;
          missingMvpKeys.push(...(baseDraftReady ? computeMissingKeysInferred() : []));
          draftReady = !continueEdit && baseDraftReady && missingMvpKeys.length === 0;
          missingAll = missingMvpKeys.length ? missingMvpKeys : [...missingRequired, ...missingOptional];
        }
      } catch (err) {
        console.warn('[AiService] slot_normalizer_failed', err);
      }
    }
    const missingAllAfterNormalizer = [...missingAll];
    if (draftReady || confirmDraft) {
      unrelatedAnswerKey = null;
    }
    const decisionChoiceCandidate =
      !draftReady && !isCompareMode && !continueEdit
        ? buildDecisionChoiceQuestion(
            nextQuestionKeyCandidate,
            slots,
            confidence,
            prevSlots,
            prevConfidence,
            latestUserMessage,
            lastAskedSlot,
          )
        : null;
    const assumptions = buildAssumptionsFromHeuristics(slots, confidence, latestUserMessage);
    if (metaComment) {
      const missingKeys = computeMissingKeysInferred();
      if (missingKeys.length === 1 && missingKeys[0] === 'price') {
        const questionText = buildFallbackQuestionText('price');
        logPromptPhase = 'collect';
        return await finalizeAndReturn({
          status: 'collecting',
          state: 'collecting',
          stage: 'coach',
          promptVersion: 'interrupt-direct-price-v1',
          language: detectedLanguage,
          turnCount,
          thinkingSteps: ['参加費の確認に戻ります'],
          editorChecklist: [],
          writerSummary: undefined,
          message: '',
          ui: {
            question: { key: 'price', text: questionText },
          },
          choiceQuestion: undefined,
          compareCandidates: [],
          inputMode: 'describe',
          nextQuestionKey: 'price',
          slots,
          confidence,
          draftReady: false,
          applyEnabled: false,
          draftId: undefined,
          intent: intent,
          modeHint: 'chat',
          messageSource: 'backend.interrupt',
        });
      }
      const missingLabels = missingKeys
        .map((key) => {
          switch (key) {
            case 'price':
              return '参加費';
            case 'time':
              return '日時';
            case 'location':
              return '場所';
            case 'details':
              return '内容';
            case 'title':
              return 'タイトル';
            case 'registrationForm':
              return '申込フォーム';
            case 'requireApproval':
              return '参加承認';
            case 'enableWaitlist':
              return 'キャンセル待ち';
            case 'requireCheckin':
              return 'チェックイン';
            case 'refundPolicy':
              return '返金ポリシー';
            case 'riskNotice':
              return '注意事項';
            default:
              return null;
          }
        })
        .filter(Boolean)
        .join('・');
      const statusText = missingLabels ? `今は「${missingLabels}」が未確定です。` : '必要な情報はそろっています。';
      logPromptPhase = 'collect';
      return await finalizeAndReturn({
        status: 'collecting',
        state: 'collecting',
        stage: 'coach',
        promptVersion: 'interrupt-v1',
        language: detectedLanguage,
        turnCount,
        thinkingSteps: ['ユーザーの意見を受け止めました'],
        editorChecklist: [],
        writerSummary: undefined,
        message: statusText,
        ui: {
          message: `ご指摘ありがとう。${statusText}続け方を選んでください。`,
        },
        choiceQuestion: {
          key: 'interrupt' as keyof Slots,
          prompt: 'どう進めますか？',
          options: [
            { label: '続けて質問に答える', value: 'continue', recommended: true },
            { label: 'この質問はスキップ', value: 'skip' },
            { label: 'いま下書きを見る', value: 'preview' },
            { label: 'フォームを手動で編集', value: 'manual' },
          ],
        },
        compareCandidates: [],
        inputMode: 'describe',
        nextQuestionKey: null,
        slots,
        confidence,
        draftReady: false,
        applyEnabled: false,
        draftId: undefined,
        intent: intent,
        modeHint: 'chat',
        messageSource: 'backend.interrupt',
      });
    }
    const applyNormalizerUpdates = (result: SlotNormalizerResult | null) => {
      if (!result) return;
      Object.entries(result.updates || {}).forEach(([key, update]) => {
        if (!update) return;
        const slotKey = key as keyof Slots;
        const normalizedValue = update.normalizedValue || update.value;
        if (normalizedValue) {
          slots[slotKey] = normalizedValue;
        }
        if (typeof update.confidenceDelta === 'number') {
          confidence[slotKey] = Math.min(1, Math.max(confidence[slotKey] ?? 0, update.confidenceDelta));
        }
      });
      if (result.shouldCloseSlot && nextQuestionKeyCandidate) {
        confidence[nextQuestionKeyCandidate] = Math.max(confidence[nextQuestionKeyCandidate] ?? 0, 0.85);
      }
    };

    const shouldRunNormalizer = false;
    if (shouldRunNormalizer) {
      try {
        const client = this.client;
        if (!client) {
          throw new Error('OpenAI client is not configured');
        }
        if (!canCallLlm('normalizer', { promptPhase: 'collect', loopTriggered: true, helpIntent: false, turnIndex })) {
          throw new Error('LLM budget exceeded');
        }
        const normalizerRequest = buildSlotNormalizerPrompt({
          rawUserText: latestUserMessage,
          currentSlots: slots,
          currentNextQuestionKey: nextQuestionKeyCandidate ?? null,
          recentTurns,
        });
        const normalizerCompletion = await client.chat.completions.create({
          model: this.model,
          temperature: 0,
          response_format: {
            type: 'json_schema',
            json_schema: normalizerRequest.schema,
          },
          messages: [
            { role: 'system', content: normalizerRequest.systemPrompt },
            { role: 'user', content: JSON.stringify(normalizerRequest.userPayload) },
          ],
        });
        const normalizerRaw = this.extractMessageContent(normalizerCompletion);
        const normalizerResult = normalizerRaw
          ? (JSON.parse(normalizerRaw) as SlotNormalizerResult)
          : null;
        if (normalizerResult?.intent && normalizerResult.intent !== 'answer') {
          const missingKeys = computeMissingKeysInferred();
          const missingLabels = missingKeys
            .map((key) => {
              switch (key) {
                case 'price':
                  return '参加費';
                case 'time':
                  return '日時';
                case 'location':
                  return '場所';
                case 'details':
                  return '内容';
                case 'title':
                  return 'タイトル';
                case 'visibility':
                  return '公開範囲';
                case 'registrationForm':
                  return '申込フォーム';
                case 'requireApproval':
                  return '参加承認';
                case 'enableWaitlist':
                  return 'キャンセル待ち';
                case 'requireCheckin':
                  return 'チェックイン';
                case 'refundPolicy':
                  return '返金ポリシー';
                case 'riskNotice':
                  return '注意事項';
                default:
                  return null;
              }
            })
            .filter(Boolean)
            .join('・');
          const statusText = missingLabels ? `今は「${missingLabels}」が未確定です。` : '必要な情報はそろっています。';
          logPromptPhase = 'collect';
          return await finalizeAndReturn({
            status: 'collecting',
            state: 'collecting',
            stage: 'coach',
            promptVersion: 'interrupt-v1',
            language: detectedLanguage,
            turnCount,
            thinkingSteps: ['ユーザーの意見を受け止めました'],
            editorChecklist: [],
            writerSummary: undefined,
            message: statusText,
            ui: {
              message: `ご指摘ありがとう。${statusText}続け方を選んでください。`,
            },
            choiceQuestion: {
              key: 'interrupt' as keyof Slots,
              prompt: 'どう進めますか？',
              options: [
                { label: '続けて質問に答える', value: 'continue', recommended: true },
                { label: 'この質問はスキップ', value: 'skip' },
                { label: 'いま下書きを見る', value: 'preview' },
                { label: 'フォームを手動で編集', value: 'manual' },
              ],
            },
            compareCandidates: [],
            inputMode: normalizedInputMode,
            nextQuestionKey: null,
            slots,
            confidence,
            draftReady: false,
            applyEnabled: false,
            draftId: undefined,
            intent: intent,
            modeHint: 'chat',
            messageSource: 'backend.normalizer',
          });
        }
        applyNormalizerUpdates(normalizerResult);
      } catch (err) {
        console.warn('[AiService] slot_normalizer_failed', err);
      }
    }

    const promptPhase: EventAssistantPromptPhase = continueEdit
      ? 'decision'
      : determinePromptPhase({
          inputMode: normalizedInputMode,
          confirmDraft,
          draftReady,
          hasDecisionChoice: Boolean(decisionChoiceCandidate),
        });
    logPromptPhase = continueEdit
      ? isReviseSelectStep
        ? 'revise_select'
        : 'revise_edit'
      : promptPhase === 'collecting'
      ? 'collect'
      : promptPhase === 'ready'
      ? 'ready'
      : promptPhase === 'operate'
      ? 'operate'
      : promptPhase === 'decision' || promptPhase === 'compare'
      ? 'collect'
      : 'parse';
    const promptConfig = getEventAssistantPromptConfig(promptPhase);
    const shouldUseMainLlm = promptPhase === 'ready' || promptPhase === 'operate';
    const promptParams: Record<string, string> = {
      latest_message: latestUserMessage || '',
      phase: promptPhase,
      next_question_key: nextQuestionKeyCandidate ?? '',
      input_mode: normalizedInputMode,
      min_question_turns: String(promptConfig.minQuestionTurns),
      option_phase_turns: String(promptConfig.optionPhaseTurns),
      ready_turns: String(promptConfig.readyTurns),
    };
    const resolvedPrompt = await this.resolveEventAssistantPrompt(promptPhase, promptParams);
    const instruction = resolvedPrompt.instruction;

    try {
      const outputSchema = getEventAssistantOutputSchema(promptPhase);
      let parsed: AiAssistantReplyPayload;
      if (!shouldUseMainLlm) {
        const fallbackKey = nextQuestionKeyCandidate ?? 'title';
        const fallbackQuestionText = buildFallbackQuestionText(fallbackKey);
        const compareChoiceQuestion = isCompareMode
          ? buildCompareChoiceQuestion(compareCandidatesForPrompt)
          : null;
        const decisionChoice = decisionChoiceCandidate ?? null;
        parsed = {
          state: 'collecting',
          language: detectedLanguage,
          thinkingSteps: ['ヒアリングを続けます'],
          coachPrompt: '必要な情報を確認しています',
          ui:
            promptPhase === 'decision'
              ? { message: '近いものがあれば選んでください。' }
              : promptPhase === 'compare'
              ? { message: 'どちらが近いですか？' }
              : {
                  question: {
                    key: fallbackKey,
                    text: fallbackQuestionText,
                  },
                },
          choiceQuestion: compareChoiceQuestion ?? decisionChoice ?? undefined,
          compareCandidates: compareCandidatesForPrompt,
          inputMode: normalizedInputMode,
          nextQuestionKey:
            promptPhase === 'collecting' ? nextQuestionKeyCandidate : null,
        };
      } else {
        const client = this.client;
        if (!client) {
          throw new HttpException('OpenAI API key is not configured', HttpStatus.BAD_REQUEST);
        }
        const mainPromptPhase =
          promptPhase === 'operate'
            ? 'operate'
            : promptPhase === 'ready'
              ? 'ready'
              : 'collect';
        if (!canCallLlm('main_llm', { promptPhase: mainPromptPhase, loopTriggered, helpIntent, turnIndex })) {
          const fallbackKey = nextQuestionKeyCandidate ?? 'title';
          const fallbackQuestionText = buildFallbackQuestionText(fallbackKey);
          const compareChoiceQuestion = isCompareMode
            ? buildCompareChoiceQuestion(compareCandidatesForPrompt)
            : null;
          const decisionChoice = decisionChoiceCandidate ?? null;
          parsed = {
            state: 'collecting',
            language: detectedLanguage,
            thinkingSteps: ['ヒアリングを続けます'],
            coachPrompt: '必要な情報を確認しています',
            ui: {
              question: {
                key: fallbackKey,
                text: fallbackQuestionText,
              },
            },
            choiceQuestion: compareChoiceQuestion ?? decisionChoice ?? undefined,
            compareCandidates: compareCandidatesForPrompt,
            inputMode: normalizedInputMode,
            nextQuestionKey: nextQuestionKeyCandidate,
          };
        } else {
          mainLlmUsed = true;
          const completion = await client.chat.completions.create({
          model: this.model,
          temperature: 0.45,
          response_format: {
            type: 'json_schema',
            json_schema: outputSchema,
          },
          messages: [
            {
              role: 'system',
              content: resolvedPrompt.systemPrompt,
            },
            {
              role: 'user',
              content: JSON.stringify({
                profile: {
                  baseLanguage: payload.baseLanguage,
                  topic: payload.topic,
                  audience: payload.audience,
                  style: payload.style,
                },
                phase: promptPhase,
                conversation,
                turnCount,
                latestUserMessage,
                inputMode: normalizedInputMode,
                draftReady,
                nextQuestionKey: nextQuestionKeyCandidate,
                compareCandidates: compareCandidatesForPrompt,
                slots,
                confidence,
                assumptions,
                targetLanguage: detectedLanguage,
                instruction,
              }),
            },
          ],
          });

          const raw = this.extractMessageContent(completion);
          try {
            parsed = raw ? (JSON.parse(raw) as AiAssistantReplyPayload) : ({} as AiAssistantReplyPayload);
          } catch (err) {
            // Fallback to safe collecting state instead of 500
            const fallbackKey = nextQuestionKeyCandidate ?? 'title';
            parsed = {
              state: 'collecting',
              language: detectedLanguage,
              thinkingSteps: ['ヒアリングを続けます'],
              coachPrompt: 'イベントの概要を教えてください',
              ui: {
                question: {
                  key: fallbackKey,
                  text: 'イベントについて簡単に教えてください。',
                },
              },
            };
          }
        }
      }
      const { cleaned: phaseCleaned, removed: phaseRemoved } = enforcePhaseOutput(
        parsed as unknown as Record<string, unknown>,
        promptPhase,
        promptConfig,
      );
      if (phaseRemoved.length) {
        console.warn('[AiService] phase output guard removed fields', {
          phase: promptPhase,
          removed: phaseRemoved,
        });
      }
      parsed = phaseCleaned as unknown as AiAssistantReplyPayload;
      const schemaValidation = validateAssistantOutput(promptPhase, parsed);
      if (!schemaValidation.valid) {
        console.warn('[AiService] schema_validation_failed', {
          phase: promptPhase,
          errors: schemaValidation.errors,
        });
        parsed = {} as AiAssistantReplyPayload;
      }
      let state: AssistantReplyState = draftReady ? 'ready' : 'collecting';
      const rawOptions = Array.isArray(parsed.options) ? parsed.options : [];
      const optionDetails: AiAssistantOption[] = rawOptions
        .map((item) => {
          if (!item) return null;
          if (typeof item === 'string') {
            const title = item.trim();
            return title ? { title } : null;
          }
          const title = typeof item.title === 'string' ? item.title.trim() : '';
          if (!title) return null;
          return {
            title,
            description: typeof item.description === 'string' ? item.description : undefined,
            pros: typeof item.pros === 'string' ? item.pros : undefined,
            cons: typeof item.cons === 'string' ? item.cons : undefined,
          };
        })
        .filter((opt): opt is AiAssistantOption => Boolean(opt));
      const optionTexts = optionDetails
        .map((item) => {
          const title = item.title?.trim() ?? '';
          const desc = item.description?.trim() ?? '';
          if (title && desc) return `${title}：${desc}`;
          return title || desc;
        })
        .filter((text) => Boolean(text && text.trim()));
      const effectiveIntent: AssistantIntent = confirmDraft ? 'create' : intent;
      const applyEnabled = !isCompareMode && draftReady && effectiveIntent === 'create';
      const shouldNullNextQuestionKey = Boolean(isCompareMode || draftReady || unrelatedAnswerKey);
      const nextQuestionKey: keyof Slots | null = shouldNullNextQuestionKey ? null : nextQuestionKeyCandidate;
      let compareCandidates: AiAssistantCompareCandidate[] = [];
      if (isCompareMode) {
        compareCandidates = compareCandidatesForPrompt;
        parsed.compareCandidates = compareCandidates;
        state = 'collecting';
      } else if (!draftReady) {
        const wantsTitleSuggestions =
          nextQuestionKey === 'title' &&
          /タイトル|名前|ネーミング|題名|名前案|タイトル案|名前を考えて/i.test(latestUserMessage);
        if (wantsTitleSuggestions) {
          parsed.titleSuggestions = buildTitleSuggestions(slots);
        }
        const miniPreview = buildMiniPreview(
          slots,
          confidence,
          assumptions,
          `${latestUserMessage} ${slots.details ?? ''}`,
        );
        if (miniPreview) {
          parsed.miniPreview = miniPreview;
        }
        state = 'collecting';
      } else {
        state = 'ready';
        if (confirmDraft) {
          parsed.questions = [];
          parsed.choiceQuestion = undefined;
          parsed.compareCandidates = [];
          parsed.message = 'イベント案を作成しました。フォームで確認できます。';
        }
      }
      parsed.state = state;
      const stageTag: AssistantStage = state === 'ready' ? 'writer' : 'coach';
      if (state === 'ready') {
        if (!parsed.publicActivityDraft) {
          parsed.publicActivityDraft = {};
        }
        if (!parsed.internalExecutionPlan) {
          parsed.internalExecutionPlan = {};
        }
      }
      const guardedMessage = sanitizeAssistantQuestion(
        parsed.message,
        nextQuestionKey,
        slots,
        confidence,
        normalizedInputMode,
        Boolean(parsed.choiceQuestion),
      );
      parsed.message = sanitize(guardedMessage);
      const responseNextQuestionKey = nextQuestionKey;
      const uiQuestionKey = responseNextQuestionKey ?? null;
      if (!uiQuestionKey && parsed.ui?.question?.text) {
        console.warn('[AiService] ui.question ignored because nextQuestionKey is null', {
          phase: promptPhase,
          question: parsed.ui?.question?.text,
        });
      }
      const isDecisionPhase = promptPhase === 'decision';
      const uiOptionsRaw = Array.isArray(parsed.ui?.options) ? parsed.ui.options : [];
      let cleanUiOptions = !isDecisionPhase && !isCompareMode
        ? uiOptionsRaw
            .map((o) => ({
              label: sanitize(o.label),
              value: sanitize(o.value),
              recommended: Boolean(o.recommended),
            }))
            .filter((o) => o.label && o.value)
        : [];
      let cleanUiQuestionText = isDecisionPhase ? '' : sanitize(parsed.ui?.question?.text);
      let cleanUiMessage = sanitize(parsed.ui?.message);
      if (unrelatedAnswerKey) {
        cleanUiMessage = buildUnrelatedAnswerMessage(unrelatedAnswerKey);
      }
      if (confirmationChoiceQuestion) {
        cleanUiMessage = '';
        cleanUiOptions = [];
        cleanUiQuestionText = '';
      }
      const cleanDecisionChoice = decisionChoiceCandidate
        ? {
            key: decisionChoiceCandidate.key,
            prompt: sanitize(decisionChoiceCandidate.prompt),
            options: decisionChoiceCandidate.options
              .map((o) => ({
                label: sanitize(o.label),
                value: sanitize(o.value),
                recommended: Boolean(o.recommended),
              }))
              .filter((o) => o.label && o.value),
          }
        : null;
      if (hasUnsupportedCurrency) {
        cleanUiMessage = '金額は円で入力してください。例：1000円 / 無料';
      }
      const autoTitleNotice = autoGeneratedTitle
        ? `タイトルは「${autoGeneratedTitle}」にしました。あとで変更できます。`
        : '';
      const forcedQuestionText = continueEdit
        ? 'どこを直したいですか？（日時/場所/参加費/説明/定員/申込フォームなど）'
        : '';
      if (cleanUiQuestionText) {
        const askedSlot = detectAskedSlot(cleanUiQuestionText);
        if (askedSlot && uiQuestionKey && askedSlot !== uiQuestionKey) {
          cleanUiQuestionText = '';
        }
      }
      let finalQuestionText = forcedQuestionText || cleanDecisionChoice?.prompt || cleanUiQuestionText;
      if (!finalQuestionText && responseNextQuestionKey) {
        finalQuestionText = buildFallbackQuestionText(responseNextQuestionKey);
      }
      if (autoTitleNotice && finalQuestionText && responseNextQuestionKey && responseNextQuestionKey !== 'title') {
        finalQuestionText = `${autoTitleNotice}\n${finalQuestionText}`;
      }
      const cleanUiQuestion =
        finalQuestionText && uiQuestionKey ? { key: uiQuestionKey, text: finalQuestionText } : undefined;
      const cleanUi: AiAssistantUiPayload | undefined =
        cleanUiMessage || cleanUiQuestion || cleanUiOptions.length
          ? {
              message: cleanUiMessage || undefined,
              question: cleanUiQuestion,
              options: cleanUiOptions.length ? cleanUiOptions : undefined,
            }
          : undefined;
      const fallbackMessage = cleanUiMessage || cleanUiQuestionText || '';
      // sanitize fields
      const cleanQuestions = Array.isArray(parsed.questions)
        ? parsed.questions.map((q) => sanitize(q)).filter(Boolean)
        : [];
      const cleanOptions = optionDetails.map((o) => ({
        ...o,
        title: sanitize(o.title),
        description: sanitize(o.description),
        pros: sanitize(o.pros),
        cons: sanitize(o.cons),
      }));
      const cleanMiniPreview = parsed.miniPreview
        ? {
            bullets: Array.isArray(parsed.miniPreview.bullets)
              ? parsed.miniPreview.bullets.map((b) => sanitize(b)).filter(Boolean)
            : [],
            note: sanitize(parsed.miniPreview.note),
          }
        : undefined;
      const cleanCompareCandidates = Array.isArray(compareCandidates)
        ? compareCandidates
            .map((candidate) => ({
              id: sanitize(candidate.id),
              summary: sanitize(candidate.summary),
              time: sanitize(candidate.time),
              price: sanitize(candidate.price),
              notes: sanitize(candidate.notes),
            }))
            .filter((candidate) => candidate.id && candidate.summary)
        : [];
      const choiceKey = isCompareMode ? 'details' : uiQuestionKey;
      const choicePrompt = cleanUiQuestionText || cleanUiMessage || '';
      const compareChoiceQuestion = isCompareMode ? buildCompareChoiceQuestion(cleanCompareCandidates) : null;
      const cleanChoiceQuestion =
        compareChoiceQuestion ??
        cleanDecisionChoice ??
        (choiceKey && cleanUiOptions.length && choicePrompt
          ? {
              key: choiceKey,
              prompt: choicePrompt,
              options: cleanUiOptions,
            }
          : undefined);
      const cleanTitleSuggestions = Array.isArray(parsed.titleSuggestions)
        ? parsed.titleSuggestions.map((t) => sanitize(t)).filter(Boolean)
        : [];
      const cleanWriterSummary: AiAssistantReplyPayload['writerSummary'] =
        typeof parsed.writerSummary === 'string'
          ? sanitize(parsed.writerSummary)
          : parsed.writerSummary;
      if (parsed.publicActivityDraft) {
        parsed.publicActivityDraft.title = sanitize(parsed.publicActivityDraft.title);
        parsed.publicActivityDraft.shortDescription = sanitize(parsed.publicActivityDraft.shortDescription);
        parsed.publicActivityDraft.detailedDescription = sanitize(parsed.publicActivityDraft.detailedDescription);
        parsed.publicActivityDraft.ageRange = sanitize(parsed.publicActivityDraft.ageRange);
        if (Array.isArray(parsed.publicActivityDraft.highlights)) {
          parsed.publicActivityDraft.highlights = parsed.publicActivityDraft.highlights
            .map((h) => sanitize(h))
            .filter(Boolean);
        }
        if (parsed.publicActivityDraft.schedule) {
          parsed.publicActivityDraft.schedule.date = sanitize(parsed.publicActivityDraft.schedule.date);
          parsed.publicActivityDraft.schedule.duration = sanitize(parsed.publicActivityDraft.schedule.duration);
          parsed.publicActivityDraft.schedule.location = sanitize(parsed.publicActivityDraft.schedule.location);
          parsed.publicActivityDraft.schedule.startTime = sanitize(parsed.publicActivityDraft.schedule.startTime);
          parsed.publicActivityDraft.schedule.endTime = sanitize(parsed.publicActivityDraft.schedule.endTime);
        }
        parsed.publicActivityDraft.signupNotes = sanitize(parsed.publicActivityDraft.signupNotes);
        if (Array.isArray(parsed.publicActivityDraft.registrationForm)) {
          parsed.publicActivityDraft.registrationForm = parsed.publicActivityDraft.registrationForm
            .map((field) => ({
              label: sanitize(field.label),
              type: sanitize(field.type),
              required: Boolean(field.required),
            }))
            .filter((field) => field.label && field.type);
        }
        parsed.publicActivityDraft.visibility = sanitize(parsed.publicActivityDraft.visibility);
        parsed.publicActivityDraft.refundPolicy = sanitize(parsed.publicActivityDraft.refundPolicy);
        parsed.publicActivityDraft.riskNotice = sanitize(parsed.publicActivityDraft.riskNotice);
        parsed.publicActivityDraft.expertComment = sanitize(parsed.publicActivityDraft.expertComment);
      }
      if (parsed.internalExecutionPlan) {
        parsed.internalExecutionPlan.objective = sanitize(parsed.internalExecutionPlan.objective);
        parsed.internalExecutionPlan.coreExperienceDesign = sanitize(parsed.internalExecutionPlan.coreExperienceDesign);
        if (Array.isArray(parsed.internalExecutionPlan.runOfShow)) {
          parsed.internalExecutionPlan.runOfShow = parsed.internalExecutionPlan.runOfShow.map((i) => sanitize(i)).filter(Boolean);
        }
        if (Array.isArray(parsed.internalExecutionPlan.materials)) {
          parsed.internalExecutionPlan.materials = parsed.internalExecutionPlan.materials.map((i) => sanitize(i)).filter(Boolean);
        }
        if (Array.isArray(parsed.internalExecutionPlan.staffing)) {
          parsed.internalExecutionPlan.staffing = parsed.internalExecutionPlan.staffing.map((i) => sanitize(i)).filter(Boolean);
        }
        if (Array.isArray(parsed.internalExecutionPlan.risksAndMitigation)) {
          parsed.internalExecutionPlan.risksAndMitigation = parsed.internalExecutionPlan.risksAndMitigation
            .map((i) => sanitize(i))
            .filter(Boolean);
        }
        if (Array.isArray(parsed.internalExecutionPlan.prepChecklist)) {
          parsed.internalExecutionPlan.prepChecklist = parsed.internalExecutionPlan.prepChecklist.map((i) => sanitize(i)).filter(Boolean);
        }
      }
      parsed.coachPrompt = sanitize(parsed.coachPrompt);
      parsed.questions = cleanQuestions;
      parsed.miniPreview = cleanMiniPreview;
      parsed.choiceQuestion = confirmationChoiceQuestion ?? cleanChoiceQuestion;
      parsed.compareCandidates = cleanCompareCandidates;
      parsed.titleSuggestions = cleanTitleSuggestions;
      parsed.ui = cleanUi;
      parsed.inputMode = normalizedInputMode;
      parsed.nextQuestionKey = responseNextQuestionKey;
      parsed.editorChecklist = Array.isArray(parsed.editorChecklist)
        ? parsed.editorChecklist.map((item) => sanitize(item)).filter(Boolean)
        : [];
      parsed.thinkingSteps = Array.isArray(parsed.thinkingSteps)
        ? parsed.thinkingSteps.map((item) => sanitize(item)).filter(Boolean)
        : [];
      const draftBaseSlots = slots;
      const buildExpertCommentFromSlots = (source: Slots): string => {
        const notes: string[] = [];
        if (source.time && source.location) {
          notes.push('日時と場所が揃っているので、告知までがスムーズです。');
        } else if (!source.time || !source.location) {
          notes.push('日時や場所が未確定の場合は、決まり次第追記すると安心感が増します。');
        }
        if (source.price) {
          notes.push('参加費の目安があると検討しやすくなります。');
        }
        return notes.filter(Boolean).join(' ');
      };
      const buildDraftFromSlots = (source: Slots, timeSourceText: string): AiAssistantPublicDraft => {
        const title = source.title || '';
        const structuredSchedule = buildStructuredSchedule(timeSourceText);
        const schedule =
          source.time || source.location
            ? {
                date: source.time || undefined,
                duration: undefined,
                location: source.location || undefined,
                startTime: structuredSchedule?.startTime ?? undefined,
                endTime: structuredSchedule?.endTime ?? undefined,
              }
            : undefined;
        const toBool = (value?: string) => {
          if (!value) return undefined;
          if (/有効|あり|必要|承認あり/.test(value)) return true;
          if (/無効|なし|不要|不必要|承認なし/.test(value)) return false;
          return undefined;
        };
        const parseRegistrationForm = (text?: string): Array<{ label: string; type: string; required?: boolean }> => {
          if (!text) return [];
          if (/不要|なし|未定/.test(text)) return [];
          const parts = text
            .split(/[,、/\\n]+/)
            .map((item) => item.trim())
            .filter(Boolean);
          const normalizeLabel = (raw: string) => raw.replace(/^\d+\.\s*/, '').trim();
          const fields: Array<{ label: string; type: string; required?: boolean }> = [];
          parts.forEach((raw) => {
            const label = normalizeLabel(raw);
            if (!label) return;
            let type = 'text';
            if (/メール|メールアドレス/i.test(label)) type = 'email';
            else if (/電話|携帯/i.test(label)) type = 'phone';
            else if (/日付|日時/i.test(label)) type = 'date';
            else if (/チケット|プラン|コース/i.test(label)) type = 'select';
            fields.push({ label, type });
          });
          return fields;
        };
        const description = source.details || '';
        const normalizedPrice = normalizePriceAnswer(source.price || '');
        const price = normalizedPrice || source.price || (isFreeText(source.details) ? '無料' : undefined);
        const parsedCapacity = source.capacity ? Number(source.capacity.replace(/[^\d]/g, '')) : null;
        return {
          title: title || undefined,
          shortDescription: description || undefined,
          detailedDescription: description || undefined,
          ageRange: undefined,
          highlights: [],
          schedule,
          price,
          capacity: Number.isNaN(parsedCapacity ?? NaN) ? source.capacity || undefined : parsedCapacity,
          signupNotes: source.details || undefined,
          registrationForm: parseRegistrationForm(source.registrationForm),
          visibility: source.visibility || undefined,
          requireApproval: toBool(source.requireApproval),
          enableWaitlist: toBool(source.enableWaitlist),
          requireCheckin: toBool(source.requireCheckin),
          refundPolicy: source.refundPolicy || undefined,
          riskNotice: source.riskNotice || undefined,
          expertComment: buildExpertCommentFromSlots(source),
        };
      };
      const ensureDraftMvpShape = (
        draft: AiAssistantPublicDraft,
        fallback: AiAssistantPublicDraft,
      ): AiAssistantPublicDraft => {
        const next: AiAssistantPublicDraft = { ...draft };
        if (!('title' in next)) next.title = fallback.title ?? undefined;
        if (!('shortDescription' in next)) next.shortDescription = fallback.shortDescription ?? undefined;
        if (!('detailedDescription' in next)) next.detailedDescription = fallback.detailedDescription ?? undefined;
        if (!('price' in next)) next.price = fallback.price ?? undefined;
        if (!('capacity' in next)) next.capacity = fallback.capacity ?? undefined;
        if (!('signupNotes' in next)) next.signupNotes = fallback.signupNotes ?? undefined;
        if (!('registrationForm' in next)) next.registrationForm = fallback.registrationForm ?? [];
        if (!('visibility' in next)) next.visibility = fallback.visibility ?? undefined;
        if (!('requireApproval' in next)) next.requireApproval = fallback.requireApproval ?? undefined;
        if (!('enableWaitlist' in next)) next.enableWaitlist = fallback.enableWaitlist ?? undefined;
        if (!('requireCheckin' in next)) next.requireCheckin = fallback.requireCheckin ?? undefined;
        if (!('refundPolicy' in next)) next.refundPolicy = fallback.refundPolicy ?? undefined;
        if (!('riskNotice' in next)) next.riskNotice = fallback.riskNotice ?? undefined;
        if (!('schedule' in next) || !next.schedule) {
          next.schedule = fallback.schedule ?? { date: undefined, startTime: undefined, endTime: undefined, location: undefined };
        } else {
          const schedule = next.schedule;
          if (!('date' in schedule)) schedule.date = fallback.schedule?.date ?? undefined;
          if (!('startTime' in schedule)) schedule.startTime = fallback.schedule?.startTime ?? undefined;
          if (!('endTime' in schedule)) schedule.endTime = fallback.schedule?.endTime ?? undefined;
          if (!('location' in schedule)) schedule.location = fallback.schedule?.location ?? undefined;
        }
        return next;
      };
      if (state === 'ready' && parsed.publicActivityDraft) {
        const timeSourceText = [draftBaseSlots.time, latestUserMessage].filter(Boolean).join(' ');
        const fallbackDraft = buildDraftFromSlots(draftBaseSlots, timeSourceText);
        parsed.publicActivityDraft = {
          ...parsed.publicActivityDraft,
          title: parsed.publicActivityDraft.title ?? fallbackDraft.title,
          shortDescription: parsed.publicActivityDraft.shortDescription ?? fallbackDraft.shortDescription,
          detailedDescription: parsed.publicActivityDraft.detailedDescription ?? fallbackDraft.detailedDescription,
          schedule: fallbackDraft.schedule,
          price: fallbackDraft.price,
          capacity: fallbackDraft.capacity,
          signupNotes: fallbackDraft.signupNotes,
          registrationForm: fallbackDraft.registrationForm,
          visibility: fallbackDraft.visibility,
          requireApproval: fallbackDraft.requireApproval,
          enableWaitlist: fallbackDraft.enableWaitlist,
          requireCheckin: fallbackDraft.requireCheckin,
          refundPolicy: fallbackDraft.refundPolicy,
          riskNotice: fallbackDraft.riskNotice,
          expertComment: parsed.publicActivityDraft.expertComment ?? fallbackDraft.expertComment,
        };
        parsed.publicActivityDraft = ensureDraftMvpShape(parsed.publicActivityDraft, fallbackDraft);
      }
      const shouldSuggestTitles =
        !confirmDraft && draftReady && (!slots.title || (confidence.title ?? 0) < 0.6);
      if (shouldSuggestTitles) {
        try {
          parsed.titleSuggestions = canCallLlm('title_suggestions', {
            promptPhase: 'ready',
            loopTriggered: false,
            helpIntent,
            turnIndex,
          })
            ? await this.generateTitleSuggestions(
                parsed.publicActivityDraft as AiAssistantPublicDraft,
                detectedLanguage || payload.baseLanguage || 'ja',
              )
            : buildTitleSuggestions(draftBaseSlots);
        } catch (err) {
          parsed.titleSuggestions = buildTitleSuggestions(draftBaseSlots);
        }
        const candidateTitle = parsed.titleSuggestions?.[0]?.trim() || '';
        if (candidateTitle && isSafeTitleSuggestion(candidateTitle, latestUserMessage)) {
          parsed.publicActivityDraft = {
            ...(parsed.publicActivityDraft ?? {}),
            title: candidateTitle,
          };
        }
      }
      const draftId =
        draftReady && Object.keys(draftBaseSlots).length
          ? hashStable({ slots: normalizeSlotsForHash(draftBaseSlots), policyVersion: this.POLICY_VERSION })
          : undefined;

      const cleanOptionTexts = optionTexts
        .map((text) => sanitize(text))
        .filter((text): text is string => Boolean(text));
      const messageSource: AiAssistantReplyPayload['messageSource'] = 'backend.ui';
      logDecisionTrace = {
        forcedNextQuestionKey,
        missingAllBeforeNormalizer,
        missingAllAfterNormalizer,
        loopTriggered,
        nextQuestionKeyCandidate,
        finalNextQuestionKey: responseNextQuestionKey,
        nextQuestionKeyLocked,
      };
      if (debugEnabled) {
        logDebug('next_question_key_trace', {
          forcedNextQuestionKey,
          missingAllBeforeNormalizer,
          missingAllAfterNormalizer,
          loopTriggered,
          nextQuestionKeyCandidate,
          finalNextQuestionKey: responseNextQuestionKey,
          nextQuestionKeyLocked,
        });
      }
      return await finalizeAndReturn({
        ...parsed,
        status: state,
        stage: stageTag,
        promptVersion: resolvedPrompt.version,
        language: detectedLanguage,
        turnCount,
        thinkingSteps: Array.isArray(parsed.thinkingSteps) ? parsed.thinkingSteps : [],
        editorChecklist: Array.isArray(parsed.editorChecklist) ? parsed.editorChecklist : [],
        optionDetails: cleanOptions,
        options: optionTexts,
        optionTexts: cleanOptionTexts,
        writerSummary: cleanWriterSummary,
        message: fallbackMessage ?? '',
        miniPreview: cleanMiniPreview,
        choiceQuestion: confirmationChoiceQuestion ?? cleanChoiceQuestion,
        compareCandidates: cleanCompareCandidates,
        titleSuggestions: cleanTitleSuggestions,
        autoTitle: autoGeneratedTitle ?? undefined,
        inputMode: normalizedInputMode,
        nextQuestionKey,
        questionMeta: buildQuestionMeta(nextQuestionKey),
        slots,
        confidence,
        draftReady,
        applyEnabled,
        draftId,
        intent: effectiveIntent,
        modeHint: confirmDraft ? 'operate' : 'chat',
        messageSource,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AiService] generateAssistantReply error:', error);
      const safe: AiAssistantReply = {
        state: 'collecting',
        status: 'collecting',
        stage: 'coach',
        language: payload.baseLanguage || 'ja',
        thinkingSteps: ['AI接続が不安定です', '必要な情報をもう1つ教えてください'],
        coachPrompt: 'タイトル/日時/場所/参加費/内容のいずれか1つだけ教えてください。',
        editorChecklist: [],
        writerSummary: '',
        ui: {
          question: {
            key: 'title',
            text: 'タイトル/日時/場所/参加費/内容のいずれか1つだけ教えてください。',
          },
        },
        optionTexts: [],
        promptVersion: resolvedPrompt.version,
        turnCount,
        slots: {},
        confidence: {
          title: 0,
          time: 0,
          location: 0,
          price: 0,
          capacity: 0,
          details: 0,
          visibility: 0,
          registrationForm: 0,
          requireApproval: 0,
          enableWaitlist: 0,
          requireCheckin: 0,
          refundPolicy: 0,
          riskNotice: 0,
        },
        draftReady: false,
        applyEnabled: false,
        intent: 'unknown',
        inputMode: 'describe',
        nextQuestionKey: null,
        modeHint: 'chat',
        messageSource: 'backend.ui',
      };
      logPromptPhase = 'collect';
      return await finalizeAndReturn(safe);
    }
  }

  async translateText(payload: TranslateTextDto): Promise<TranslateTextResult> {
    const client = this.client;
    if (!client) {
      throw new HttpException('OpenAI API key is not configured', HttpStatus.BAD_REQUEST);
    }

    const sourceLang = payload.sourceLang?.trim();
    const targetLangs = Array.isArray(payload.targetLangs)
      ? payload.targetLangs.map((lang) => String(lang).trim()).filter(Boolean)
      : [];
    const items = Array.isArray(payload.items)
      ? payload.items
          .filter((item) => Boolean(item) && typeof item.key === 'string' && typeof item.text === 'string')
          .map((item) => ({
            key: item.key,
            text: item.text,
            preserveFormat: item.preserveFormat ?? 'plain',
          }))
      : [];

    if (!sourceLang) {
      throw new HttpException('sourceLang is required', HttpStatus.BAD_REQUEST);
    }
    if (!targetLangs.length) {
      throw new HttpException('targetLangs is required', HttpStatus.BAD_REQUEST);
    }
    if (!items.length) {
      throw new HttpException('items is required', HttpStatus.BAD_REQUEST);
    }
    if (items.length > 20) {
      throw new HttpException('Too many items in one request (max 20)', HttpStatus.BAD_REQUEST);
    }

    const jsonSchema = {
      name: 'MoreAppTranslations',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          translations: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                key: { type: 'string' },
                source: { type: 'string' },
                translated: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                },
              },
              required: ['key', 'source', 'translated'],
            },
          },
        },
        required: ['translations'],
      },
    };

    const systemPrompt =
      'You are a professional translator for product UI and event content. ' +
      'Translate only the text while keeping placeholders, HTML/Markdown structure, and variables unchanged. ' +
      'Do not invent new information. Keep tone natural and concise for mobile UI. ' +
      'If the text is too short or not translatable, return it as-is.';

    const cachedTranslations: TranslateTextResult['translations'] = [];
    const missingItems: TranslateTextDto['items'] = [];
    for (const item of items) {
      const translated: Record<string, string> = {};
      for (const target of targetLangs) {
        const cacheKey = this.buildTranslationCacheKey(sourceLang, target, item.text);
        const cached = this.translationCache.get(cacheKey)?.[target];
        if (cached) {
          translated[target] = cached;
        }
      }
      if (Object.keys(translated).length === targetLangs.length) {
        cachedTranslations.push({ key: item.key, source: item.text, translated });
      } else {
        missingItems.push(item);
      }
    }

    try {
      if (!missingItems.length) {
        return { translations: cachedTranslations };
      }

      const parseJson = <T>(raw: string): T => {
        try {
          return JSON.parse(raw) as T;
        } catch (err) {
          const trimmed = raw.trim();
          const start = trimmed.indexOf('{');
          const end = trimmed.lastIndexOf('}');
          if (start !== -1 && end !== -1 && end > start) {
            return JSON.parse(trimmed.slice(start, end + 1)) as T;
          }
          throw err;
        }
      };

      const mergeTranslations = (
        base: TranslateTextResult['translations'],
        incoming: TranslateTextResult['translations'] = [],
      ) => {
        for (const item of incoming) {
          const cached = base.find((m) => m.key === item.key);
          if (cached) {
            cached.translated = { ...cached.translated, ...(item.translated ?? {}) };
          } else {
            base.push(item);
          }
        }
      };

      const writeThroughCache = (translations: TranslateTextResult['translations'] = []) => {
        for (const item of translations) {
          for (const target of Object.keys(item.translated ?? {})) {
            const translatedText = item.translated?.[target];
            if (!translatedText) continue;
            const cacheKey = this.buildTranslationCacheKey(sourceLang, target, item.source);
            const existing = this.translationCache.get(cacheKey) ?? {};
            existing[target] = translatedText;
            this.translationCache.set(cacheKey, existing);
          }
        }
      };

      const requestTranslations = async (targets: string[], chunkItems: TranslateTextDto['items']) => {
        const completion = await client.chat.completions.create({
          model: this.model,
          temperature: 0.2,
          response_format: { type: 'json_schema', json_schema: jsonSchema },
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: JSON.stringify({
                source_language: sourceLang,
                target_languages: targets,
                preserve_format: Array.from(new Set(chunkItems.map((item) => item.preserveFormat ?? 'plain'))),
                instructions:
                  'Keep placeholders such as {name}, {{count}}, <br>, markdown links intact. ' +
                  'Do not translate brand names, URLs, or variables. ' +
                  'Return a JSON array with translations for each target language.',
                items: chunkItems.map((item) => ({
                  key: item.key,
                  text: item.text,
                  format: item.preserveFormat ?? 'plain',
                })),
              }),
            },
          ],
        });

        const raw = this.extractMessageContent(completion);
        if (!raw) {
          throw new Error('Empty response from AI');
        }
        return parseJson<TranslateTextResult>(raw);
      };

      const merged: TranslateTextResult['translations'] = [...cachedTranslations];
      const maxTargetsPerRequest = 3;

      for (let i = 0; i < targetLangs.length; i += maxTargetsPerRequest) {
        const targets = targetLangs.slice(i, i + maxTargetsPerRequest);
        const chunkItems = missingItems.filter((item) =>
          targets.some((target) => {
            const cacheKey = this.buildTranslationCacheKey(sourceLang, target, item.text);
            return !this.translationCache.get(cacheKey)?.[target];
          }),
        );
        if (!chunkItems.length) continue;
        const parsed = await requestTranslations(targets, chunkItems);
        writeThroughCache(parsed.translations);
        mergeTranslations(merged, parsed.translations);
      }

      return { translations: merged };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to translate text', HttpStatus.INTERNAL_SERVER_ERROR, {
        cause: error,
      });
    }
  }

  async completeWithPrompt(payload: {
    prompt: { system: string };
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    model?: string;
    temperature?: number;
    promptId?: string;
    userId?: string;
    tenantId?: string;
  }) {
    const client = this.client;
    if (!client) {
      throw new HttpException('OpenAI API key is not configured', HttpStatus.BAD_REQUEST);
    }
    const messages = this.sanitizeMessages([
      { role: 'system' as const, content: payload.prompt.system },
      ...payload.messages,
    ]);
    const startedAt = Date.now();
    try {
      const completion = await client.chat.completions.create({
        model: payload.model || this.model,
        temperature: payload.temperature ?? 0.3,
        messages,
      });
      const content = this.extractMessageContent(completion);
      const usage = completion.usage
        ? {
            completion_tokens: completion.usage.completion_tokens,
            prompt_tokens: completion.usage.prompt_tokens,
            total_tokens: completion.usage.total_tokens,
          }
        : undefined;
      await this.logCompletion({
        promptId: payload.promptId,
        model: payload.model || this.model,
        durationMs: Date.now() - startedAt,
        messages,
        userId: payload.userId,
        tenantId: payload.tenantId,
        usage,
      });
      return { content, raw: completion };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to complete with prompt', HttpStatus.INTERNAL_SERVER_ERROR, {
        cause: error,
      });
    }
  }

  async getAiUsageSummary(): Promise<AiUsageSummaryResponse> {
    const eventMetrics = await this.computeEventAssistantMetrics();
    const modules: AiModuleUsageSummary[] = [
      {
        id: 'event-assistant',
        name: '活动助手（Console）',
        description: 'Console 端创建活动的对话式助手，执行 Coach / Editor / Writer 三阶段',
        status: 'active',
        metrics: eventMetrics,
      },
      {
        id: 'community-assistant',
        name: '社区策略助手',
        description: '社群定位、内容与增长实验的 AI 伙伴',
        status: 'coming-soon',
      },
      {
        id: 'translator',
        name: '翻译 · 多语言指南',
        description: '跨语言内容校对与生活语境提示',
        status: 'coming-soon',
      },
    ];

    return {
      generatedAt: new Date(),
      modules,
    };
  }

  async getAiUsageDetail(moduleId: string): Promise<AiUsageDetailResponse> {
    if (moduleId !== 'event-assistant') {
      throw new NotFoundException('Module not found');
    }
    return this.buildEventAssistantUsageDetail();
  }

  private async computeEventAssistantMetrics(): Promise<AiModuleUsageMetrics> {
    const now = Date.now();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [totalLogs, last24hCount, last7dCount, communityDistinct, userDistinct, latestLog] =
      await Promise.all([
        this.prisma.aiEventDraftLog.count(),
        this.prisma.aiEventDraftLog.count({ where: { createdAt: { gte: last24h } } }),
        this.prisma.aiEventDraftLog.count({ where: { createdAt: { gte: last7d } } }),
        this.prisma.aiEventDraftLog.findMany({ distinct: ['communityId'], select: { communityId: true } }),
        this.prisma.aiEventDraftLog.findMany({ distinct: ['userId'], select: { userId: true } }),
        this.prisma.aiEventDraftLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      ]);

    return {
      totalLogs,
      last24h: last24hCount,
      last7d: last7dCount,
      activeCommunities: communityDistinct.length,
      activeUsers: userDistinct.length,
      lastActivityAt: latestLog?.createdAt ?? null,
    };
  }

  private async buildEventAssistantUsageDetail(): Promise<AiUsageDetailResponse> {
    const metrics = await this.computeEventAssistantMetrics();
    const [avgTurns, stageGroups, languageGroups, recentLogs] = await Promise.all([
      this.prisma.aiEventDraftLog.aggregate({
        _avg: { turnCount: true },
      }),
      this.prisma.aiEventDraftLog.groupBy({
        by: ['stage'],
        _count: { _all: true },
      }),
      this.prisma.aiEventDraftLog.groupBy({
        by: ['language'],
        _count: { _all: true },
      }),
      this.prisma.aiEventDraftLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: {
          user: { select: { id: true, name: true, email: true } },
          community: { select: { id: true, name: true } },
        },
      }),
    ]);

    const formatBreakdown = <T extends { _count: { _all: number } }>(items: T[], key: keyof T) =>
      items.map((item) => ({
        label: ((item[key] as string | null) ?? '未标注'),
        count: item._count._all,
      }));

    return {
      module: {
        id: 'event-assistant',
        name: '活动助手（Console）',
        description: 'Console 端活动创建助手 · Speak → Guide → Write → Confirm 全流程',
      },
      metrics: {
        ...metrics,
        avgTurns: avgTurns._avg.turnCount ?? null,
      },
      breakdown: {
        stage: formatBreakdown(stageGroups as Array<{ stage: string | null; _count: { _all: number } }>, 'stage'),
        language: formatBreakdown(
          languageGroups as Array<{ language: string | null; _count: { _all: number } }>,
          'language',
        ),
      },
      recentSessions: recentLogs.map((log) => ({
        id: log.id,
        communityId: log.communityId,
        communityName: log.community.name,
        userId: log.userId,
        userName: log.user.name ?? '未命名',
        userEmail: log.user.email,
        stage: log.stage,
        status: log.status,
        summary: log.summary,
        turnCount: log.turnCount,
        createdAt: log.createdAt,
      })),
    };
  }

  async getCommunityUsage(communityId: string): Promise<AiCommunityUsage> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const total = await this.prisma.aiEventDraftLog.count({
      where: { communityId, createdAt: { gte: monthStart } },
    });
    const estimatedMinutesSaved = total * 3;
    return {
      communityId,
      totalAiCallsThisMonth: total,
      estimatedMinutesSaved,
    };
  }

  private extractMessageContent(completion: OpenAI.Chat.Completions.ChatCompletion) {
    const messageContent = completion.choices[0]?.message?.content;
    if (typeof messageContent === 'string') {
      return messageContent;
    }
    if (Array.isArray(messageContent)) {
      return (messageContent as Array<{ text?: string } | null>).map((part) => part?.text ?? '').join('');
    }
    return '';
  }

  private buildJsonSchema() {
    return {
      name: 'MoreAppEventContent',
      schema: this.getEventContentSchema(),
    };
  }

  private sanitizeMessages(messages: Array<{ role: string; content: string }>): ChatCompletionMessageParam[] {
    return messages.map((m) => ({
      role: m.role as ChatCompletionMessageParam['role'],
      content: this.maskSensitive(m.content ?? ''),
    })) as unknown as ChatCompletionMessageParam[];
  }

  private maskSensitive(text: string) {
    if (!text) return text;
    let masked = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
    masked = masked.replace(/\b\d{3,4}[-\s]?\d{3,4}[-\s]?\d{3,4}\b/g, '[phone]');
    return masked;
  }

  private async logCompletion(entry: {
    promptId?: string;
    model?: string;
    durationMs?: number;
    messages: ChatCompletionMessageParam[];
    userId?: string;
    tenantId?: string;
    usage?: { completion_tokens?: number; prompt_tokens?: number; total_tokens?: number };
  }) {
    try {
      const line = JSON.stringify({
        at: new Date().toISOString(),
        promptId: entry.promptId,
        model: entry.model,
        durationMs: entry.durationMs,
        userId: entry.userId,
        tenantId: entry.tenantId,
        tokens: entry.usage,
      });
      const fs = await import('fs');
      const path = await import('path');
      const dir = path.join(process.cwd(), 'generated');
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.appendFile(path.join(dir, 'ai-calls.log'), line + '\n', 'utf8');
    } catch {
      // logging best-effort
    }
  }

  private buildTranslationCacheKey(sourceLang: string, targetLang: string, text: string) {
    return `${sourceLang.trim().toLowerCase()}|${targetLang.trim().toLowerCase()}|${text}`;
  }

  private buildAssistantReplySchema() {
    return {
      name: 'MoreAppAssistantReply',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          state: { type: 'string', enum: ['collecting', 'options', 'ready'] },
          language: { type: 'string' },
          message: { type: 'string' },
          thinkingSteps: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: 6,
          },
          coachPrompt: { type: 'string' },
          editorChecklist: {
            type: 'array',
            items: { type: 'string' },
          },
          writerSummary: { type: 'string' },
          questions: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 4,
          },
          options: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                pros: { type: 'string' },
                cons: { type: 'string' },
              },
              required: ['title'],
            },
            maxItems: 3,
          },
          miniPreview: {
            type: 'object',
            additionalProperties: false,
            properties: {
              bullets: { type: 'array', items: { type: 'string' }, maxItems: 6 },
              note: { type: 'string' },
            },
          },
          choiceQuestion: {
            type: 'object',
            additionalProperties: false,
            properties: {
              key: { type: 'string' },
              prompt: { type: 'string' },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    label: { type: 'string' },
                    value: { type: 'string' },
                    recommended: { type: 'boolean' },
                  },
                  required: ['label', 'value'],
                },
                maxItems: 6,
              },
            },
          },
          compareCandidates: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                summary: { type: 'string' },
                time: { type: 'string' },
                price: { type: 'string' },
                notes: { type: 'string' },
              },
              required: ['id', 'summary'],
            },
            maxItems: 3,
          },
          inputMode: { type: 'string', enum: ['describe', 'fill', 'compare'] },
          nextQuestionKey: { type: ['string', 'null'] },
          titleSuggestions: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 10,
          },
          publicActivityDraft: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              shortDescription: { type: 'string' },
              detailedDescription: { type: 'string' },
              ageRange: { type: 'string' },
              highlights: {
                type: 'array',
                items: { type: 'string' },
              },
              schedule: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  date: { type: 'string' },
                  duration: { type: 'string' },
                  location: { type: 'string' },
                },
              },
              price: { type: ['number', 'string', 'null'] },
              capacity: { type: ['number', 'string', 'null'] },
              signupNotes: { type: 'string' },
            },
          },
          internalExecutionPlan: {
            type: 'object',
            additionalProperties: false,
            properties: {
              objective: { type: 'string' },
              coreExperienceDesign: { type: 'string' },
              runOfShow: { type: 'array', items: { type: 'string' } },
              materials: { type: 'array', items: { type: 'string' } },
              staffing: { type: 'array', items: { type: 'string' } },
              risksAndMitigation: { type: 'array', items: { type: 'string' } },
              prepChecklist: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        required: ['state', 'language', 'thinkingSteps'],
      },
    };
  }

  private detectLanguage(latestMessage: string, fallback?: string) {
    if (latestMessage && /[\u3040-\u30ff]/.test(latestMessage)) {
      return 'ja';
    }
    if (latestMessage && /[\u4e00-\u9fff]/.test(latestMessage)) {
      if (fallback === 'zh') {
        return 'zh';
      }
      return 'ja';
    }
    if (latestMessage && /[a-zA-Z]/.test(latestMessage)) {
      return 'en';
    }
    return fallback || 'ja';
  }

  private getEventContentSchema() {
    const localized = {
      type: 'object',
      properties: {
        original: { type: 'string' },
        lang: { type: 'string', enum: ['ja', 'zh', 'en'] },
        translations: {
          type: 'object',
          properties: {
            ja: { type: 'string' },
            zh: { type: 'string' },
            en: { type: 'string' },
          },
          additionalProperties: { type: 'string' },
          required: ['ja', 'zh', 'en'],
        },
      },
      required: ['original', 'lang', 'translations'],
      additionalProperties: false,
    };

    const caption = {
      type: 'object',
      properties: {
        ja: { type: 'string' },
        zh: { type: 'string' },
        en: { type: 'string' },
      },
      required: ['ja', 'zh', 'en'],
      additionalProperties: false,
    };

    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: localized,
        subtitle: localized,
        description: localized,
        notes: localized,
        riskNotice: localized,
        snsCaptions: {
          type: 'object',
          properties: {
            line: caption,
            instagram: caption,
          },
          required: ['line', 'instagram'],
          additionalProperties: false,
        },
        logistics: {
          type: 'object',
          additionalProperties: false,
          properties: {
            startTime: { type: 'string' },
            endTime: { type: 'string' },
            locationText: { type: 'string' },
            locationNote: { type: 'string' },
          },
        },
        ticketTypes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              price: { type: 'number' },
              currency: { type: 'string' },
              quota: { type: ['integer', 'null'] },
              type: { type: 'string' },
            },
            required: ['name', 'price'],
          },
        },
        requirements: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              label: { type: 'string' },
              type: { type: 'string', enum: ['must', 'nice-to-have'] },
            },
            required: ['label'],
          },
        },
        registrationForm: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              label: { type: 'string' },
              type: { type: 'string' },
              required: { type: 'boolean' },
            },
            required: ['label', 'type'],
          },
        },
        visibility: { type: 'string', enum: ['public', 'community', 'private'] },
      },
      required: ['title', 'description', 'notes', 'riskNotice', 'snsCaptions'],
    };
  }

  getProfileDefaults(): AiAssistantProfileDefaults {
    const basePrompt = getEventAssistantPromptConfig('collecting');
    return {
      version: basePrompt.version,
      defaults: basePrompt.defaults,
    };
  }
}
