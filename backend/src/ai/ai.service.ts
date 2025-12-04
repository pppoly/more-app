import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { COACHING_PROMPT_CONFIG, PromptDefaultsProfile } from './prompt.config';
import { PrismaService } from '../prisma/prisma.service';

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
}

export type AssistantReplyStatus = 'collecting' | 'options' | 'ready';

export type AssistantStage = 'coach' | 'editor' | 'writer';

interface AiAssistantReplyPayload {
  status: AssistantReplyStatus;
  message: string;
  options?: string[];
  proposal?: AiEventContent;
  thinkingSteps?: string[];
  stage?: AssistantStage;
  coachPrompts?: string[];
  editorChecklist?: string[];
  writerSummary?: {
    headline?: string;
    audience?: string;
    logistics?: string;
    riskNotes?: string;
    nextSteps?: string;
  };
  confirmQuestions?: string[];
}

export interface AiAssistantReply extends AiAssistantReplyPayload {
  promptVersion: string;
  language: string;
  turnCount: number;
  thinkingSteps: string[];
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

  constructor(private readonly prisma: PrismaService) {
    const apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
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

    const conversation = (payload.conversation ?? []).slice(-12);
    const turnCount = conversation.filter((msg) => msg.role === 'user').length;
    const latestUserMessage =
      [...conversation].reverse().find((msg) => msg.role === 'user')?.content ?? '';
    const promptConfig = COACHING_PROMPT_CONFIG;
    const detectedLanguage = this.detectLanguage(latestUserMessage, payload.baseLanguage);
    const instruction = promptConfig.instruction
      .replace('{minQuestionTurns}', promptConfig.minQuestionTurns.toString())
      .replace('{optionPhaseTurns}', promptConfig.optionPhaseTurns.toString())
      .replace('{readyTurns}', promptConfig.readyTurns.toString())
      .replace('{latestMessage}', latestUserMessage || '');

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.65,
        response_format: {
          type: 'json_schema',
          json_schema: this.buildAssistantReplySchema(),
        },
        messages: [
          {
            role: 'system',
            content: promptConfig.systemPrompt,
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
              conversation,
              turnCount,
              latestUserMessage,
              targetLanguage: detectedLanguage,
              instruction,
            }),
          },
        ],
      });

      const raw = this.extractMessageContent(completion);
      if (!raw) {
        throw new Error('Empty response from AI');
      }

      const parsed = JSON.parse(raw) as AiAssistantReplyPayload;
      const stageTag = parsed.stage ?? 'coach';
      return {
        ...parsed,
        promptVersion: promptConfig.version,
        language: detectedLanguage,
        turnCount,
        stage: stageTag,
        thinkingSteps: Array.isArray(parsed.thinkingSteps) ? parsed.thinkingSteps : [],
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to generate assistant reply', HttpStatus.INTERNAL_SERVER_ERROR, {
        cause: error,
      });
    }
  }

  async translateText(payload: TranslateTextDto): Promise<TranslateTextResult> {
    if (!this.client) {
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

    const preserveFormats = Array.from(new Set(items.map((item) => item.preserveFormat ?? 'plain')));

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

      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_schema', json_schema: jsonSchema },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: JSON.stringify({
              source_language: sourceLang,
              target_languages: targetLangs,
              preserve_format: preserveFormats,
              instructions:
                'Keep placeholders such as {name}, {{count}}, <br>, markdown links intact. ' +
                'Do not translate brand names, URLs, or variables. ' +
                'Return a JSON array with translations for each target language.',
              items: items.map((item) => ({
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
      const parsed = JSON.parse(raw) as TranslateTextResult;

      // write-through cache
      for (const item of parsed.translations ?? []) {
        for (const target of Object.keys(item.translated ?? {})) {
          const translatedText = item.translated?.[target];
          if (!translatedText) continue;
          const cacheKey = this.buildTranslationCacheKey(sourceLang, target, item.source);
          const existing = this.translationCache.get(cacheKey) ?? {};
          existing[target] = translatedText;
          this.translationCache.set(cacheKey, existing);
        }
      }

      // merge cached + new
      const merged: TranslateTextResult['translations'] = [...cachedTranslations];
      for (const item of parsed.translations ?? []) {
        const cached = merged.find((m) => m.key === item.key);
        if (cached) {
          cached.translated = { ...cached.translated, ...(item.translated ?? {}) };
        } else {
          merged.push(item);
        }
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
        label: ((item[key] as string | null) ?? '未标注') as string,
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
          status: { type: 'string', enum: ['collecting', 'options', 'ready'] },
          message: { type: 'string' },
          stage: { type: 'string', enum: ['coach', 'editor', 'writer'] },
          thinkingSteps: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 6,
          },
          coachPrompts: {
            type: 'array',
            items: { type: 'string' },
          },
          editorChecklist: {
            type: 'array',
            items: { type: 'string' },
          },
          writerSummary: {
            type: 'object',
            additionalProperties: false,
            properties: {
              headline: { type: 'string' },
              audience: { type: 'string' },
              logistics: { type: 'string' },
              riskNotes: { type: 'string' },
              nextSteps: { type: 'string' },
            },
          },
          confirmQuestions: {
            type: 'array',
            items: { type: 'string' },
          },
          options: {
            type: 'array',
            items: { type: 'string' },
          },
          proposal: this.getEventContentSchema(),
        },
        required: ['status', 'message', 'thinkingSteps', 'stage'],
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
    return {
      version: COACHING_PROMPT_CONFIG.version,
      defaults: COACHING_PROMPT_CONFIG.defaults,
    };
  }
}
