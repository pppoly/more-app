import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  AiAssistantReply,
  AiAssistantProfileDefaults,
  AiEventContent,
  AiService,
  AssistantConversationMessage,
  GenerateAssistantReplyDto,
  GenerateEventContentDto,
  TranslateTextDto,
  TranslateTextResult,
} from './ai.service';
import { PromptStoreService } from './prompt-store.service';
import { PromptDefinition } from './prompt.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { promises as fs } from 'fs';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import promptTests from './prompt-tests.json';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const rateLimitBuckets = new Map<string, number[]>();

const DEFAULT_SUPPORTED_LANGS = ['ja', 'en', 'zh', 'vi', 'ko', 'tl', 'pt-br', 'ne', 'id', 'th', 'zh-tw', 'my'];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly promptStore: PromptStoreService,
  ) {}

  @Post('events/generate')
  async generateEventCopy(@Body() body: Partial<GenerateEventContentDto>): Promise<AiEventContent> {
    const requiredFields: Array<keyof GenerateEventContentDto> = [
      'baseLanguage',
      'topic',
      'audience',
      'style',
      'details',
    ];

    for (const field of requiredFields) {
      if (!body || typeof body[field] !== 'string' || !body[field]) {
        throw new HttpException(`${String(field)} is required`, HttpStatus.BAD_REQUEST);
      }
    }

    return this.aiService.generateEventContent(body as GenerateEventContentDto);
  }

  @Post('events/assistant')
  async generateAssistantReply(
    @Body() body: Partial<GenerateAssistantReplyDto>,
  ): Promise<AiAssistantReply> {
    try {
      const requiredFields: Array<keyof GenerateEventContentDto> = [
        'baseLanguage',
        'topic',
        'audience',
        'style',
        'details',
      ];

      for (const field of requiredFields) {
        if (!body || typeof body[field] !== 'string' || !body[field]) {
          throw new HttpException(`${String(field)} is required`, HttpStatus.BAD_REQUEST);
        }
      }

      const conversation = Array.isArray(body?.conversation) ? body.conversation : [];
      const normalizedConversation: AssistantConversationMessage[] = conversation
        .filter(
          (item): item is AssistantConversationMessage =>
            Boolean(item) &&
            typeof item.role === 'string' &&
            (item.role === 'user' || item.role === 'assistant') &&
            typeof item.content === 'string' &&
            item.content.length > 0,
        )
        .slice(-12);

      return await this.aiService.generateAssistantReply({
        ...(body as GenerateEventContentDto),
        conversation: normalizedConversation,
        action: body?.action === 'confirm_draft' ? 'confirm_draft' : undefined,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ai/events/assistant] error', err);
      throw err;
    }
  }

  @Get('events/profile-defaults')
  getProfileDefaults(): AiAssistantProfileDefaults {
    return this.aiService.getProfileDefaults();
  }

  @Get('languages')
  getSupportedLanguages() {
    const configured = process.env.SUPPORTED_LANGUAGES;
    const list = configured
      ? configured
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean)
      : DEFAULT_SUPPORTED_LANGS;
    const unique = Array.from(new Set(list.map((l) => l.toLowerCase())));
    const defaultLang = process.env.DEFAULT_LANGUAGE?.trim().toLowerCase() || unique[0] || 'ja';
    return { default: defaultLang, supported: unique };
  }

  @Post('translate')
  async translateText(@Body() body: Partial<TranslateTextDto>, @Req() req: any): Promise<TranslateTextResult> {
    const sourceLang = typeof body?.sourceLang === 'string' ? body.sourceLang.trim() : '';
    const targetLangs = Array.isArray(body?.targetLangs)
      ? body.targetLangs.map((lang) => String(lang).trim()).filter(Boolean)
      : [];
    const items = Array.isArray(body?.items)
      ? body.items.filter(
          (item): item is TranslateTextDto['items'][number] =>
            Boolean(item) && typeof item.key === 'string' && typeof item.text === 'string',
        )
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
    this.assertSupportedLang(sourceLang);
    targetLangs.forEach((lang) => this.assertSupportedLang(lang));
    this.assertRateLimit(req);

    return this.aiService.translateText({
      sourceLang,
      targetLangs,
      items,
    });
  }

  @Get('prompts')
  async listPrompts(): Promise<PromptDefinition[]> {
    return this.promptStore.getAll();
  }

  @Post('prompts')
  @Roles('admin')
  async savePrompts(@Body() body: PromptDefinition[], @Req() req: any): Promise<PromptDefinition[]> {
    if (!Array.isArray(body)) {
      throw new HttpException('Body must be an array of prompts', HttpStatus.BAD_REQUEST);
    }
    const normalized = body.map((p) => ({
      id: String(p.id),
      name: String(p.name ?? p.id),
      description: p.description ?? '',
      version: p.version ?? '',
      system: String(p.system ?? ''),
      instructions: p.instructions ?? '',
      params: Array.isArray(p.params) ? p.params.map((x: unknown) => String(x)) : [],
      tags: Array.isArray(p.tags) ? p.tags.map((x: unknown) => String(x)) : [],
      meta: p.meta ?? {},
      status: (p as any).status ?? 'draft',
      approvedById: (p as any).approvedById ?? null,
      approvedAt: (p as any).approvedAt ?? null,
    }));
    const saved = await this.promptStore.upsert(normalized, req?.user?.id);
    await this.appendAuditLog('save_prompts', { count: saved.length, actorId: req?.user?.id ?? null });
    return saved;
  }

@Get('prompts/:id')
@Roles('admin')
async getPrompt(@Param('id') id: string): Promise<PromptDefinition> {
  const prompts = await this.promptStore.getAll();
  const prompt = prompts.find((p) => p.id === id);
  if (!prompt) {
    throw new HttpException('Prompt not found', HttpStatus.NOT_FOUND);
  }
  return prompt;
}

@Post('prompts/:id/publish')
@Roles('admin')
async publishPrompt(@Param('id') id: string, @Req() req: any): Promise<PromptDefinition> {
  const prompts = await this.promptStore.getAll();
  const prompt = prompts.find((p) => p.id === id);
  if (!prompt) {
    throw new HttpException('Prompt not found', HttpStatus.NOT_FOUND);
  }
  const updated = prompts.map((p) =>
    p.id === id
      ? {
          ...p,
          status: 'published',
          approvedById: req?.user?.id ?? null,
          approvedAt: new Date().toISOString(),
        }
      : p,
  );
  const saved = await this.promptStore.upsert(updated, req?.user?.id);
  const next = saved.find((p) => p.id === id)!;
  await this.appendAuditLog('publish_prompt', {
    promptId: id,
    actorId: req?.user?.id ?? null,
  });
  return next;
}

  @Post('render')
  @Roles('admin')
  async renderPrompt(
    @Body()
    body: {
      promptId: string;
      params?: Record<string, string>;
      messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    },
    @Req() req: any,
  ) {
    this.assertRateLimit(req);
    const prompts = await this.promptStore.getAll();
    const prompt = prompts.find((p) => p.id === body.promptId);
    if (!prompt) {
      throw new HttpException('Prompt not found', HttpStatus.NOT_FOUND);
    }
    const params = body.params || {};
    this.assertParamsAllowed(prompt, params);
    this.assertLangParams(params);
    const system = this.applyParams(prompt.system, params);
    const messages = [{ role: 'system', content: system }, ...(body.messages ?? [])];
    return { messages };
  }

  @Post('complete')
  @Roles('admin')
  async completeWithPrompt(
    @Body()
    body: {
      promptId: string;
      params?: Record<string, string>;
      messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
      model?: string;
      temperature?: number;
    },
    @Req() req: any,
  ) {
    this.assertRateLimit(req);
    const prompts = await this.promptStore.getAll();
    const prompt = prompts.find((p) => p.id === body.promptId);
    if (!prompt) {
      throw new HttpException('Prompt not found', HttpStatus.NOT_FOUND);
    }
    const params = body.params || {};
    this.assertParamsAllowed(prompt, params);
    this.assertLangParams(params);
    const system = this.applyParams(prompt.system, params);
    return this.aiService.completeWithPrompt({
      prompt: { system },
      messages: body.messages ?? [],
      model: body.model,
      temperature: body.temperature,
      promptId: prompt.id,
      userId: req?.user?.id,
      tenantId: req?.user?.id ? `user:${req.user.id}` : undefined,
    });
  }

  private applyParams(template: string, params: Record<string, string>) {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => params[key] ?? `{${key}}`);
  }

  private assertSupportedLang(lang: string) {
    const list = this.getSupportedLanguages().supported;
    if (!list.includes(lang.trim().toLowerCase())) {
      throw new HttpException(`Unsupported language: ${lang}`, HttpStatus.BAD_REQUEST);
    }
  }

  private assertParamsAllowed(prompt: PromptDefinition, params: Record<string, string>) {
    if (!prompt.params || prompt.params.length === 0) {
      return;
    }
    const allowed = prompt.params.map((p: string) => p.toLowerCase());
    for (const key of Object.keys(params)) {
      if (!allowed.includes(key.toLowerCase())) {
        throw new HttpException(`Unsupported parameter: ${key}`, HttpStatus.BAD_REQUEST);
      }
    }
  }

  private assertLangParams(params: Record<string, string>) {
    const maybeLangs = ['source_lang', 'target_lang'];
    for (const key of maybeLangs) {
      if (typeof params[key] === 'string') {
        this.assertSupportedLang(params[key]);
      }
    }
  }

  private async appendAuditLog(action: string, payload: Record<string, any>) {
    const logDir = join(process.cwd(), 'generated');
    await fs.mkdir(logDir, { recursive: true });
    const line = JSON.stringify({
      action,
      at: new Date().toISOString(),
      ...payload,
    });
    await fs.appendFile(join(logDir, 'prompt-audit.log'), line + '\n', 'utf8');
  }

  @Post('eval')
  @Roles('admin')
  async evalPrompts(
    @Body()
    body: {
      promptId?: string;
      cases?: Array<{ params?: Record<string, string>; expectContains?: string }>;
    },
    @Req() req: any,
  ) {
    const prompts = await this.promptStore.getAll();
    const targetPrompt = body.promptId
      ? prompts.find((p) => p.id === body.promptId)
      : prompts.find((p) => promptTests[0]?.promptId === p.id);
    if (!targetPrompt) {
      throw new HttpException('Prompt not found for eval', HttpStatus.NOT_FOUND);
    }
    const cases =
      body.cases && body.cases.length
        ? body.cases
        : (promptTests.filter((t: any) => t.promptId === targetPrompt.id) as any[]);
    const results = cases.map((c, idx) => {
      const params = (c.params as Record<string, string>) || {};
      this.assertParamsAllowed(targetPrompt, params);
      const rendered = this.applyParams(targetPrompt.system, params);
      const pass = c.expectContains ? rendered.includes(c.expectContains) : true;
      return { index: idx, pass, rendered, expectContains: c.expectContains ?? null };
    });
    const passed = results.filter((r) => r.pass).length;
    await this.appendAuditLog('prompt_eval', {
      promptId: targetPrompt.id,
      total: results.length,
      passed,
      actorId: req?.user?.id ?? null,
    });
    return { promptId: targetPrompt.id, total: results.length, passed, results };
  }

  private assertRateLimit(req: any) {
    const key = req?.user?.id ? `user:${req.user.id}` : 'anon';
    const now = Date.now();
    const bucket = rateLimitBuckets.get(key) ?? [];
    const recent = bucket.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) {
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    rateLimitBuckets.set(key, recent);
  }
}
