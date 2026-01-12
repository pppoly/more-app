import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import crypto from 'crypto';
import {
  COACHING_PROMPT_CONFIG,
  EventAssistantPromptPhase,
  getEventAssistantPromptConfig,
  PromptDefaultsProfile,
} from './prompt.config';
import { determinePromptPhase, enforcePhaseOutput } from './assistant-phase.guard';
import { getEventAssistantOutputSchema, validateAssistantOutput } from './event-assistant.schemas';
import { PrismaService } from '../prisma/prisma.service';
import { PromptStoreService } from './prompt-store.service';

export interface GenerateEventContentDto {
  baseLanguage: string;
  topic: string;
  audience: string;
  style: string;
  details: string;
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
  action?: 'confirm_draft';
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
}

export interface AiAssistantChoiceQuestion {
  key: keyof Slots;
  prompt: string;
  options: Array<{ label: string; value: string; recommended?: boolean }>;
}

export interface AiAssistantCompareCandidate {
  id: string;
  summary: string;
  activityType?: string;
  time?: string;
  price?: string;
  notes?: string;
}

export interface AiAssistantPublicDraft {
  title?: string;
  shortDescription?: string;
  detailedDescription?: string;
  targetAudience?: string;
  ageRange?: string;
  highlights?: string[];
  schedule?: { date?: string; duration?: string; location?: string };
  price?: number | string | null;
  capacity?: number | string | null;
  signupNotes?: string;
  facts_from_user?: Record<string, any>;
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
  audience?: string;
  activityType?: string;
  time?: string;
  location?: string;
  price?: string;
  capacity?: string;
  details?: string;
};

export type Confidence = Record<keyof Slots, number>;

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
  publicActivityDraft?: AiAssistantPublicDraft;
  internalExecutionPlan?: AiAssistantExecutionPlan;
  slots?: Slots;
  confidence?: Confidence;
  draftId?: string;
  draftReady?: boolean;
  applyEnabled?: boolean;
  modeHint?: 'chat' | 'operate';
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

  async generateEventContent(payload: GenerateEventContentDto): Promise<AiEventContent> {
    if (!this.client) {
      throw new HttpException('OpenAI API key is not configured', HttpStatus.BAD_REQUEST);
    }

    try {
      const completion = await this.client.chat.completions.create({
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
    if (!this.client) {
      throw new HttpException('OpenAI API key is not configured', HttpStatus.BAD_REQUEST);
    }

    const requiredSlots: (keyof Slots)[] = ['title', 'audience', 'activityType'];
    const primaryOptionalSlots: (keyof Slots)[] = ['time', 'location', 'price'];
    const secondaryOptionalSlots: (keyof Slots)[] = ['capacity', 'details'];
    const activityTypeChoiceLabels: Record<string, string> = {
      casual_meetup: 'カジュアル交流（自由に話す）',
      icebreakers: '自己紹介＋小グループ交流',
      game_night: 'ゲーム/ボードゲーム中心',
      language_exchange: 'Language Exchange（言語交換）',
    };
    const audienceChoiceLabels: Record<string, string> = {
      friends: '友人・同僚向け',
      family: '親子OK',
      multilingual: '外国人歓迎（多言語）',
      beginners: '初参加/初心者歓迎',
    };
    const detailsChoiceLines: Record<string, string> = {
      lively: '雰囲気：わいわい（飲み会っぽい）',
      calm_chat: '雰囲気：落ち着いた会話中心',
      potluck_drinks: '雰囲気：持ち寄り（ドリンク/軽食）',
      no_alcohol: '雰囲気：ノンアル中心',
    };
    const formatActivityType = (value?: string) => (value ? activityTypeChoiceLabels[value] ?? value : value);
    const formatAudience = (value?: string) => (value ? audienceChoiceLabels[value] ?? value : value);

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
      norm.audience = normalizeText(slots.audience);
      norm.activityType = normalizeText(slots.activityType);
      norm.time = normalizeText(slots.time);
      norm.location = normalizeLocation(slots.location);
      norm.price = normalizePrice(slots.price);
      norm.capacity = normalizeText(slots.capacity);
      norm.details = normalizeText(slots.details);
      return norm;
    };

    const hashStable = (input: any) => crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');

    const detectIntent = (text: string): AssistantIntent => {
      if (/[作办办]活動|イベントを?作|開催|公開|募集|申し込みフォーム|申込フォーム|作成|掲載|告知/i.test(text)) return 'create';
      if (/見たい|試す|体験だけ|デモ|見学/i.test(text)) return 'explore';
      return 'unknown';
    };

    const detectInputMode = (text: string): AssistantInputMode => {
      const selectionPattern = /【選択】\s*([a-zA-Z]+)\s*[:：]\s*(.+)/;
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
          activityType: activity,
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
      if (hint.activityType) base.push(formatActivityType(hint.activityType));
      if (hint.audience) base.push(formatAudience(hint.audience));
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

    const extractSlots = (
      conversationMessages: AssistantConversationMessage[],
      basePayload: GenerateAssistantReplyDto,
    ): { slots: Slots; confidence: Confidence; intent: AssistantIntent; flags: { hasRulePaste: boolean } } => {
      const slots: Slots = {};
      const confidence: Confidence = {
        title: 0,
        audience: 0,
        activityType: 0,
        time: 0,
        location: 0,
        price: 0,
        capacity: 0,
        details: 0,
      };
      const setSlot = (key: keyof Slots, value?: string, conf?: number) => {
        if (!value) return;
        const nextConf = conf ?? 0.7;
        if ((confidence[key] ?? 0) < nextConf) {
          slots[key] = value.trim();
          confidence[key] = nextConf;
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
      };

      // seed from payload
      // topic from payload is low-confidence unless user explicitly provides it later
      if (basePayload.topic?.trim()) {
        setSlot('title', basePayload.topic.trim(), 0.5);
        // Do not treat default topic as confirmed activity type.
        setSlot('activityType', basePayload.topic.trim(), 0.5);
      }
      // Do not treat default audience as confirmed.
      if (basePayload.audience?.trim()) {
        setSlot('audience', basePayload.audience, 0.5);
      }
      if (basePayload.details?.trim()) {
        setSlot('details', basePayload.details.trim(), 0.7);
        const priceMatch = basePayload.details.match(/(\d{1,5})\s*円(?:\/人)?/);
        if (priceMatch?.[1]) {
          const amount = Number(priceMatch[1]);
          if (!Number.isNaN(amount)) {
            if (amount === 0) {
              setSlot('price', 'free', 0.7);
            } else {
              setSlot('price', priceMatch[0].replace(/\s+/g, ''), 0.75);
            }
          }
        } else if (/無料|フリー|タダ|free/i.test(basePayload.details)) {
          setSlot('price', 'free', 0.7);
        }
        if (/オンライン|zoom|teams|google meet|line/i.test(basePayload.details)) {
          setSlot('location', 'online', 0.7);
        }
      }

      const userMessages = conversationMessages.filter((msg) => msg.role === 'user');
      let hasRulePaste = false;
      const allUserText = userMessages.map((m) => m.content || '').join(' ');

      for (const msg of userMessages) {
        const text = msg.content || '';
        const selectionMatch = text.match(/【選択】\s*([a-zA-Z]+)\s*[:：]\s*(.+)/);
        if (selectionMatch?.[1] && selectionMatch?.[2]) {
          const rawKey = selectionMatch[1] as keyof Slots;
          const rawValue = selectionMatch[2].trim();
          const candidateMatch = rawValue.match(/候補([A-C])/);
          if (candidateMatch?.[1]) {
            const compareSource = findLatestCompareMessage(userMessages);
            const candidates = extractCompareCandidates(compareSource);
            const selected = candidates.find((c) => c.id === candidateMatch[1]);
            if (selected) {
              if (selected.activityType) setSlot('activityType', selected.activityType, 1);
              if (selected.time) setSlot('time', selected.time, 1);
              if (selected.price) setSlot('price', selected.price, 1);
              if (selected.notes) setSlot('details', selected.notes, 0.8);
              continue;
            }
          }
          if (Object.prototype.hasOwnProperty.call(confidence, rawKey)) {
            if (rawKey === 'activityType' && activityTypeChoiceLabels[rawValue]) {
              setSlot('activityType', rawValue, 1);
              appendDetailLine(`形式: ${activityTypeChoiceLabels[rawValue]}`, 1);
              continue;
            }
            if (rawKey === 'audience' && audienceChoiceLabels[rawValue]) {
              setSlot('audience', rawValue, 1);
              continue;
            }
            if (rawKey === 'details' && detailsChoiceLines[rawValue]) {
              appendDetailLine(detailsChoiceLines[rawValue], 1);
              continue;
            }
            setSlot(rawKey, rawValue, 1);
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
        const cnDayMatch = text.match(/(下周|下星期)?[周星期][一二三四五六日天1234567]/);
        const timeDateMatch =
          text.match(/(\d{4}-\d{2}-\d{2}(?:\s*\d{1,2}[:：]\d{2})?|\d{1,2}月\d{1,2}日(?:\s*\d{1,2}[:：]\d{2})?)/) ??
          text.match(/(\d{1,2}\/\d{1,2}(?:\s*\d{1,2}[:：]\d{2})?)/);
        if (timeRangeMatch?.[1]) {
          setSlot('time', timeRangeMatch[1], 0.75);
        } else if (cnRangeFromTokens) {
          const dayPrefix = cnDayMatch?.[0] ? `${cnDayMatch[0]} ` : '';
          setSlot('time', `${dayPrefix}${cnRangeFromTokens}`.trim(), 0.75);
        } else if (timeDateMatch?.[0]) {
          setSlot('time', timeDateMatch[0], 0.75);
        } else if (/平日夜|週末|土曜|日曜|金曜|午後|午前/.test(text)) {
          setSlot('time', text.match(/(平日夜|週末|土曜|日曜|金曜|午後|午前)/)?.[0], 0.65);
        }
        // location detection
        if (/オンライン|zoom|teams|meet|line/i.test(text)) {
          setSlot('location', 'online', 0.8);
        } else {
          const locMatch = text.match(/(渋谷|新宿|池袋|東京|大阪|名古屋|福岡|札幌|横浜|神戸|京都|仙台|那覇|千葉|埼玉|神奈川)/);
          if (locMatch?.[0]) {
            setSlot('location', locMatch[0], 0.7);
          }
        }
        // price detection
        const priceMatch = text.match(/(\d{1,5})\s*円(?:\/人)?/);
        if (priceMatch?.[1]) {
          const amount = Number(priceMatch[1]);
          if (!Number.isNaN(amount)) {
            if (amount === 0) {
              setSlot('price', 'free', 0.8);
            } else {
              setSlot('price', priceMatch[0].replace(/\s+/g, ''), 0.75);
            }
          }
        } else if (/無料|フリー|タダ|free/i.test(text)) {
          setSlot('price', 'free', 0.8);
        }
        // capacity detection
        const capMatch = text.match(/(\d{1,3})\s*(名|人)/);
        if (capMatch?.[1]) {
          setSlot('capacity', capMatch[1], 0.7);
        }
        // activity type keywords
        if (/バーベキュー|bbq|ワークショップ|ＷＳ|ws|セミナー|講座|トーク|交流|交流会|勉強会|体験|ピクニック|マルシェ/i.test(text)) {
          setSlot('activityType', text, 0.75);
        }
        const hasSelectionTag = /【選択】/.test(text);
        const hasTimeLike =
          /\d{1,2}[:：]\d{2}/.test(text) || /平日夜|週末|土曜|日曜|金曜|午後|午前|来週|今週/.test(text);
        const hasPriceLike = /\d{2,5}\s*円/.test(text) || /無料|フリー|0円|タダ|free/i.test(text);
        const hasCjk = /[\u3040-\u30ff\u4e00-\u9fff]/.test(text);
        const minTitleLength = hasCjk ? 2 : 4;
        // possible title phrase (short, non-question, not time/price/selection)
        if (
          (confidence.title ?? 0) < 0.6 &&
          text.length >= minTitleLength &&
          text.length <= 40 &&
          !/[?？]/.test(text) &&
          !/(日時|場所|時間|料金|価格|free|無料|どこ|いつ)/i.test(text) &&
          !hasSelectionTag &&
          !hasTimeLike &&
          !hasPriceLike
        ) {
          setSlot('title', text, 0.7);
        }
        // audience hints
        if (/親子|子ども|子供|学生|社会人|ママ|パパ|ファミリー|シニア|若者|初心者/i.test(text)) {
          setSlot('audience', text, Math.max(confidence.audience, 0.7));
        }
        if (text.length > 80 && (confidence.details ?? 0) < 0.6) {
          setSlot('details', text, 0.65);
        }
      }

      const intent = hasRulePaste ? 'unknown' : detectIntent(allUserText || basePayload.details || '');
      return { slots, confidence, intent, flags: { hasRulePaste } };
    };
    const buildAssumptionsFromHeuristics = (slotValues: Slots, slotConfidence: Confidence, sourceText: string) => {
      const assumptions: Array<{ field: string; assumedValue: string; reason: string }> = [];
      const lower = sourceText.toLowerCase();
      const hasBBQ =
        /bbq|バーベキュー/.test(lower) ||
        /bbq|バーベキュー/i.test(slotValues.activityType ?? '') ||
        /bbq|バーベキュー/i.test(slotValues.title ?? '') ||
        /bbq|バーベキュー/i.test(slotValues.details ?? '');
      if (hasBBQ) {
        assumptions.push({
          field: 'activityType',
          assumedValue: 'BBQパーティー（屋外）',
          reason: 'BBQの一般的な形式',
        });
        if ((slotConfidence.location ?? 0) < 0.6) {
          assumptions.push({
            field: 'location',
            assumedValue: '屋外（公園など）',
            reason: 'BBQの一般的な開催場所',
          });
        }
      }
      if ((slotConfidence.audience ?? 0) < 0.6) {
        assumptions.push({
          field: 'audience',
          assumedValue: '友人・同僚向け',
          reason: '一般的な想定',
        });
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
      const hasTopic = (slotConfidence.activityType ?? 0) >= 0.6 || (slotConfidence.title ?? 0) >= 0.6;
      if (!hasTime || !hasPrice || !hasTopic) return null;
      const bullets: string[] = [];
      const assumptionMap = new Map(assumptions.map((a) => [a.field, a.assumedValue]));
      if ((slotConfidence.activityType ?? 0) >= 0.6 && slotValues.activityType) {
        bullets.push(`タイプ: ${formatActivityType(slotValues.activityType)}`);
      } else if (assumptionMap.has('activityType')) {
        bullets.push(`タイプ: ${assumptionMap.get('activityType')}（暫定）`);
      }
      if (hasTime && slotValues.time) {
        bullets.push(`日時: ${slotValues.time}`);
      }
      if (hasPrice && slotValues.price) {
        bullets.push(`料金: ${slotValues.price}`);
      }
      if ((slotConfidence.audience ?? 0) >= 0.6 && slotValues.audience) {
        bullets.push(`対象: ${formatAudience(slotValues.audience)}`);
      } else if (assumptionMap.has('audience')) {
        bullets.push(`対象: ${assumptionMap.get('audience')}（暫定）`);
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
        { key: 'audience', label: '対象' },
        { key: 'time', label: '日時' },
        { key: 'price', label: '料金' },
        { key: 'capacity', label: '定員' },
        { key: 'details', label: '詳細' },
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
      const lower = text.toLowerCase();
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
    const buildDecisionChoiceKey = (
      key: keyof Slots | null,
      slotValues: Slots,
      slotConfidence: Confidence,
      prevSlots: Slots,
      prevConfidence: Confidence,
      lastUserMessage: string,
      lastAskedSlot: keyof Slots | null,
    ): keyof Slots | null => {
      if (!key) return null;
      const subjectiveKeys: (keyof Slots)[] = ['activityType', 'audience', 'details'];
      if (!subjectiveKeys.includes(key)) return null;
      const hasSlotValue = Boolean(slotValues[key]) && (slotConfidence[key] ?? 0) >= 0.6;
      const ambiguous = isAmbiguousAnswer(lastUserMessage) || isOptionRequest(lastUserMessage);
      const askedSame = lastAskedSlot === key;
      const noNewInfo = askedSame && noNewInfoForKey(key, prevSlots, prevConfidence, slotValues, slotConfidence);
      const shouldOfferChoices = !hasSlotValue || ambiguous || noNewInfo;
      return shouldOfferChoices ? key : null;
    };
    const hitSlot = (key: keyof Slots, slotValues: Slots, slotConfidence: Confidence) =>
      Boolean(slotValues[key]) && (slotConfidence[key] ?? 0) >= 0.6;
    const detectAskedSlot = (message: string): keyof Slots | null => {
      const lower = message.toLowerCase();
      if (/日時|いつ|何時|日程|時間/.test(message) || /(time|when)/.test(lower)) return 'time';
      if (/場所|どこ|会場|オンライン/.test(message) || /(where|location)/.test(lower)) return 'location';
      if (/料金|価格|いくら/.test(message) || /(price|fee|cost)/.test(lower)) return 'price';
      if (/タイトル|題名/.test(message) || /(title|name)/.test(lower)) return 'title';
      if (/対象|誰向け|参加者/.test(message) || /(audience|who)/.test(lower)) return 'audience';
      if (/形式|タイプ|どんなイベント/.test(message) || /(type|format)/.test(lower)) return 'activityType';
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
        key: 'activityType',
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
    const detectedLanguage = this.detectLanguage(latestUserMessage, payload.baseLanguage);
    const inputMode = detectInputMode(latestUserMessage);
    const extracted = extractSlots(conversation, payload);
    const slots = extracted.slots;
    const confidence = extracted.confidence;
    const intent = extracted.intent;
    const confirmDraft = payload.action === 'confirm_draft';
    const compareCandidatesForPrompt = inputMode === 'compare' ? extractCompareCandidates(latestUserMessage) : [];
    const lastUserIndex = (() => {
      for (let i = conversation.length - 1; i >= 0; i -= 1) {
        if (conversation[i].role === 'user') return i;
      }
      return -1;
    })();
    const prevConversation = lastUserIndex >= 0 ? conversation.slice(0, lastUserIndex) : conversation;
    const prevExtracted = extractSlots(prevConversation, payload);
    const prevSlots = prevExtracted.slots;
    const prevConfidence = prevExtracted.confidence;
    const hit = (k: keyof Slots) => Boolean(slots[k]) && (confidence[k] ?? 0) >= 0.6;
    const requiredAll = requiredSlots.every(hit);
    const optCount = primaryOptionalSlots.filter(hit).length;
    const fastPath = requiredAll && optCount >= 2;
    const slowPath = requiredAll && optCount >= 1 && turnCount >= 3;
    const isCompareMode = inputMode === 'compare';
    const draftReady = !isCompareMode && (confirmDraft || fastPath || slowPath);

    const lastAssistantMessage =
      [...conversation].reverse().find((msg) => msg.role === 'assistant' && msg.content)?.content ?? '';
    const lastAskedSlot = lastAssistantMessage ? detectAskedSlot(lastAssistantMessage) : null;
    const askedSet = new Set<keyof Slots>();
    conversation
      .filter((msg) => msg.role === 'assistant')
      .forEach((msg) => {
        const text = (msg.content || '').toLowerCase();
        if (/日時|いつ|日程/.test(text)) askedSet.add('time');
        if (/場所|どこ|会場|オンライン/.test(text)) askedSet.add('location');
        if (/対象|誰向け|オーディエンス/.test(text)) askedSet.add('audience');
        if (/料金|有料|無料|価格/.test(text)) askedSet.add('price');
        if (/定員|人数/.test(text)) askedSet.add('capacity');
        if (/形式|どんなイベント|タイプ/.test(text)) askedSet.add('activityType');
      });
    const pickNextQuestion = (missing: (keyof Slots)[]) => {
      const priority: (keyof Slots)[] = [
        'activityType',
        'time',
        'location',
        'title',
        'audience',
        'price',
        'capacity',
        'details',
      ];
      if (lastAskedSlot && missing.includes(lastAskedSlot)) return lastAskedSlot;
      for (const key of priority) {
        if (askedSet.has(key)) continue;
        if (missing.includes(key)) return key;
      }
      for (const key of priority) {
        if (missing.includes(key)) return key;
      }
      return null;
    };
    const missingRequired = requiredSlots.filter((k) => !hit(k));
    const missingOptional = primaryOptionalSlots.concat(secondaryOptionalSlots).filter((k) => !hit(k));
    const missingAll = [...missingRequired, ...missingOptional];
    const nextQuestionKeyCandidate = draftReady ? null : pickNextQuestion(missingAll as (keyof Slots)[]);
    const decisionChoiceKey =
      !draftReady && !isCompareMode
        ? buildDecisionChoiceKey(
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
    const promptPhase: EventAssistantPromptPhase = determinePromptPhase({
      inputMode,
      confirmDraft,
      draftReady,
      hasDecisionChoice: Boolean(decisionChoiceKey),
    });
    const promptConfig = getEventAssistantPromptConfig(promptPhase);
    const promptParams: Record<string, string> = {
      latest_message: latestUserMessage || '',
      phase: promptPhase,
      next_question_key: nextQuestionKeyCandidate ?? '',
      input_mode: inputMode,
      min_question_turns: String(promptConfig.minQuestionTurns),
      option_phase_turns: String(promptConfig.optionPhaseTurns),
      ready_turns: String(promptConfig.readyTurns),
    };
    const resolvedPrompt = await this.resolveEventAssistantPrompt(promptPhase, promptParams);
    const instruction = resolvedPrompt.instruction;

    try {
      const outputSchema = getEventAssistantOutputSchema(promptPhase);
      const completion = await this.client.chat.completions.create({
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
              inputMode,
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
      let parsed: AiAssistantReplyPayload;
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
      let nextQuestionKey: keyof Slots | null = nextQuestionKeyCandidate;
      let compareCandidates: AiAssistantCompareCandidate[] = [];
      if (isCompareMode) {
        compareCandidates = compareCandidatesForPrompt;
        nextQuestionKey = null;
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
        nextQuestionKey = null;
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
        inputMode,
        Boolean(parsed.choiceQuestion),
      );
      parsed.message = sanitize(guardedMessage);
      const uiQuestionKey = nextQuestionKey ?? null;
      const cleanUiOptions = Array.isArray(parsed.ui?.options)
        ? parsed.ui!.options
            .map((o) => ({
              label: sanitize(o.label),
              value: sanitize(o.value),
              recommended: Boolean(o.recommended),
            }))
            .filter((o) => o.label && o.value)
        : [];
      const cleanUiQuestionText = sanitize(parsed.ui?.question?.text);
      const cleanUiMessage = sanitize(parsed.ui?.message);
      const cleanUiQuestion =
        cleanUiQuestionText && uiQuestionKey ? { key: uiQuestionKey, text: cleanUiQuestionText } : undefined;
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
      const choiceKey =
        isCompareMode && cleanUiOptions.length ? 'activityType' : uiQuestionKey;
      const choicePrompt = cleanUiQuestionText || cleanUiMessage || '';
      const cleanChoiceQuestion =
        choiceKey && cleanUiOptions.length && choicePrompt
          ? {
              key: choiceKey,
              prompt: choicePrompt,
              options: cleanUiOptions,
            }
          : undefined;
      const cleanCompareCandidates = Array.isArray(compareCandidates)
        ? compareCandidates
            .map((candidate) => ({
              id: sanitize(candidate.id),
              summary: sanitize(candidate.summary),
              activityType: sanitize(candidate.activityType),
              time: sanitize(candidate.time),
              price: sanitize(candidate.price),
              notes: sanitize(candidate.notes),
            }))
            .filter((candidate) => candidate.id && candidate.summary)
        : [];
      const cleanTitleSuggestions = Array.isArray(parsed.titleSuggestions)
        ? parsed.titleSuggestions.map((t) => sanitize(t)).filter(Boolean)
        : [];
      const cleanWriterSummary =
        typeof parsed.writerSummary === 'string'
          ? sanitize(parsed.writerSummary)
          : parsed.writerSummary;
      if (parsed.publicActivityDraft) {
        parsed.publicActivityDraft.title = sanitize(parsed.publicActivityDraft.title as any);
        parsed.publicActivityDraft.shortDescription = sanitize(parsed.publicActivityDraft.shortDescription);
        parsed.publicActivityDraft.detailedDescription = sanitize(parsed.publicActivityDraft.detailedDescription);
        parsed.publicActivityDraft.targetAudience = sanitize(parsed.publicActivityDraft.targetAudience);
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
        }
        parsed.publicActivityDraft.signupNotes = sanitize(parsed.publicActivityDraft.signupNotes);
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
      parsed.choiceQuestion = cleanChoiceQuestion;
      parsed.compareCandidates = cleanCompareCandidates;
      parsed.titleSuggestions = cleanTitleSuggestions;
      parsed.ui = cleanUi;
      parsed.inputMode = inputMode;
      parsed.nextQuestionKey = nextQuestionKey;
      parsed.editorChecklist = Array.isArray(parsed.editorChecklist)
        ? parsed.editorChecklist.map((item) => sanitize(item)).filter(Boolean)
        : [];
      parsed.thinkingSteps = Array.isArray(parsed.thinkingSteps)
        ? parsed.thinkingSteps.map((item) => sanitize(item)).filter(Boolean)
        : [];
      const highConfSlots: Slots = {};
      (Object.keys(slots) as (keyof Slots)[]).forEach((k) => {
        if ((confidence[k] ?? 0) >= 0.6 && slots[k]) {
          highConfSlots[k] = slots[k];
        }
      });
      const draftBaseSlots = Object.keys(highConfSlots).length ? highConfSlots : slots;
      const draftId =
        draftReady && Object.keys(draftBaseSlots).length
          ? hashStable({ slots: normalizeSlotsForHash(draftBaseSlots), policyVersion: this.POLICY_VERSION })
          : undefined;

      return {
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
        optionTexts: optionTexts.map((t) => sanitize(t) as string),
        writerSummary: cleanWriterSummary as any,
        message: fallbackMessage ?? '',
        miniPreview: cleanMiniPreview,
        choiceQuestion: cleanChoiceQuestion,
        compareCandidates: cleanCompareCandidates,
        titleSuggestions: cleanTitleSuggestions,
        inputMode,
        nextQuestionKey,
        slots,
        confidence,
        draftReady,
        applyEnabled,
        draftId,
        intent: effectiveIntent,
        modeHint: confirmDraft ? 'operate' : 'chat',
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AiService] generateAssistantReply error:', error);
      const safe: AiAssistantReply = {
        state: 'collecting',
        status: 'collecting',
        stage: 'coach',
        language: payload.baseLanguage || 'ja',
        thinkingSteps: ['AI接続が不安定です', '必要な情報をもう1つ教えてください'],
        coachPrompt: 'タイトル/対象/日時/場所/料金のいずれか1つだけ教えてください。',
        editorChecklist: [],
        writerSummary: '',
        ui: {
          question: {
            key: 'title',
            text: 'タイトル/対象/日時/場所/料金のいずれか1つだけ教えてください。',
          },
        },
        optionTexts: [],
        promptVersion: resolvedPrompt.version,
        turnCount,
        slots: {},
        confidence: {
          title: 0,
          audience: 0,
          activityType: 0,
          time: 0,
          location: 0,
          price: 0,
          capacity: 0,
          details: 0,
        },
        draftReady: false,
        applyEnabled: false,
        intent: 'unknown',
        inputMode: 'describe',
        nextQuestionKey: null,
        modeHint: 'chat',
      };
      return safe;
    }
  }

  async translateText(payload: TranslateTextDto): Promise<TranslateTextResult> {
    if (!this.client) {
      throw new HttpException('OpenAI API key is not configured', HttpStatus.BAD_REQUEST);
    }
    const client = this.client;

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
    if (!this.client) {
      throw new HttpException('OpenAI API key is not configured', HttpStatus.BAD_REQUEST);
    }
    const messages = this.sanitizeMessages([
      { role: 'system' as const, content: payload.prompt.system },
      ...payload.messages,
    ]);
    const startedAt = Date.now();
    try {
      const completion = await this.client.chat.completions.create({
        model: payload.model || this.model,
        temperature: payload.temperature ?? 0.3,
        messages,
      });
      const content = this.extractMessageContent(completion);
      await this.logCompletion({
        promptId: payload.promptId,
        model: payload.model || this.model,
        durationMs: Date.now() - startedAt,
        messages,
        userId: payload.userId,
        tenantId: payload.tenantId,
        usage: completion.usage as any,
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
    messages: Array<any>;
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
                activityType: { type: 'string' },
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
              targetAudience: { type: 'string' },
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
