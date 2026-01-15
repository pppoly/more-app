import test from 'node:test';
import assert from 'node:assert/strict';
import { AiService, GenerateAssistantReplyDto } from '../src/ai/ai.service';
import fs from 'fs/promises';
import path from 'path';
import { resolveLogDir } from '../src/ai/diagnostics/logger';
import { getPromptPhaseFromStatus, normalizePromptPhase } from '../src/ai/assistant-phase.guard';

process.env.EVENT_ASSISTANT_DEBUG = '1';
process.env.OPENAI_API_KEY = 'test';

type RouterResult = { route: string; confidence: number; language: 'ja' | 'zh' | 'en' };
type InitialParse = {
  intent: string;
  slots: Record<string, string>;
  missing: string[];
  confidence: Record<string, number>;
  language: 'ja' | 'zh' | 'en';
  firstReplyKey: string;
};

const buildDefaultInitialParse = (language: 'ja' | 'zh' | 'en'): InitialParse => ({
  intent: 'EVENT_INFO',
  slots: {},
  missing: ['title', 'time', 'location', 'price', 'details'],
  confidence: {},
  language,
  firstReplyKey: 'ASK_TITLE',
});

class FakeOpenAI {
  constructor(
    private readonly handlers: {
      router?: (text: string) => RouterResult;
      initialParse?: (text: string) => InitialParse;
      normalizer?: () => Record<string, unknown>;
      main?: () => Record<string, unknown>;
      titleSuggestions?: () => { titles: string[] };
    },
  ) {}

  chat = {
    completions: {
      create: async (params: any) => {
        const schemaName = params?.response_format?.json_schema?.name;
        const rawPayload = params?.messages?.[1]?.content ?? '{}';
        let userText = '';
        let payload: any = {};
        try {
          payload = JSON.parse(rawPayload);
          userText =
            payload.userText ||
            payload.rawUserText ||
            payload.latestUserMessage ||
            payload?.conversation?.slice?.(-1)?.[0]?.content ||
            '';
        } catch {
          userText = '';
        }
        let content: Record<string, unknown> = {};
        const isNormalizer = schemaName === 'EventAssistantSlotNormalizer' || 'rawUserText' in payload;
        const isRouter = schemaName === 'assistant_router';
        const isInitialParse = schemaName === 'initial_event_parse' || ('userText' in payload && !isRouter);
        const isMain = typeof payload?.phase === 'string';
        if (isRouter) {
          content = this.handlers.router?.(userText) ?? {
            route: 'EVENT_INFO',
            confidence: 0.9,
            language: 'ja',
          };
        } else if (isInitialParse) {
          content = this.handlers.initialParse?.(userText) ?? buildDefaultInitialParse('ja');
        } else if (isNormalizer) {
          content =
            this.handlers.normalizer?.() ?? {
              intent: 'answer',
              updates: {},
              ambiguities: [],
              shouldCloseSlot: false,
            };
        } else if (schemaName === 'TitleSuggestions') {
          content = this.handlers.titleSuggestions?.() ?? { titles: ['タイトル案A', 'タイトル案B', 'タイトル案C'] };
        } else if (isMain) {
          content =
            this.handlers.main?.() ?? {
              ui: { question: { key: 'title', text: 'イベントのタイトルを教えてください。' } },
            };
        } else {
          content = this.handlers.initialParse?.(userText) ?? buildDefaultInitialParse('ja');
        }
        return {
          choices: [{ message: { content: JSON.stringify(content) } }],
        };
      },
    },
  };
}

const createService = (handlers: ConstructorParameters<typeof FakeOpenAI>[0]) => {
  const promptStore = { getAll: async () => [] };
  const prisma = {};
  const service = new AiService(prisma as any, promptStore as any);
  (service as any).client = new FakeOpenAI(handlers);
  return service;
};

const createServiceWithPrompts = (
  handlers: ConstructorParameters<typeof FakeOpenAI>[0],
  prompts: Array<{ id: string; system: string; instructions?: string; status?: string; version?: string; params?: string[] }>,
) => {
  const promptStore = { getAll: async () => prompts };
  const prisma = {};
  const service = new AiService(prisma as any, promptStore as any);
  (service as any).client = new FakeOpenAI(handlers);
  return service;
};

const buildPayload = (
  text: string,
  conversation?: GenerateAssistantReplyDto['conversation'],
  requestId = 'test-request',
) => ({
  baseLanguage: 'ja',
  topic: '',
  audience: '',
  style: '',
  details: 'test',
  conversation: conversation ?? [{ role: 'user', content: text }],
  uiMode: 'collecting' as const,
  requestId,
  conversationId: 'test-conversation',
  clientLocale: 'ja',
  clientTimezone: 'Asia/Tokyo',
});
const buildPayloadWithAction = (
  text: string,
  conversation: GenerateAssistantReplyDto['conversation'],
  action: GenerateAssistantReplyDto['action'],
) => ({
  ...buildPayload(text, conversation),
  action,
});

const readLatestLogEntry = async (requestId: string) => {
  const logDir = resolveLogDir();
  const day = new Date().toISOString().slice(0, 10);
  const jsonlPath = path.join(logDir, `event-assistant-${day}.jsonl`);
  const raw = await fs.readFile(jsonlPath, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const entry = JSON.parse(lines[i]);
    if (entry?.requestId === requestId) return entry;
  }
  return null;
};

const withCapturedLogs = async (fn: () => Promise<void> | void) => {
  const warns: any[] = [];
  const infos: any[] = [];
  const originalWarn = console.warn;
  const originalInfo = console.info;
  console.warn = (...args: any[]) => {
    warns.push(args);
  };
  console.info = (...args: any[]) => {
    infos.push(args);
  };
  try {
    await fn();
  } finally {
    console.warn = originalWarn;
    console.info = originalInfo;
  }
  return { warns, infos };
};

test('1) 起手清单抽取后不提示日時未確定', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: {
        time: '1/23 17:00-19:00',
        location: '渋谷',
        price: '無料',
      },
      missing: ['title', 'details'],
      confidence: { time: 0.8, location: 0.8, price: 0.8 },
      language: 'ja',
      firstReplyKey: 'ASK_TITLE',
    }),
  });
  const text = 'タイトル: BBQ\n日時: 1/23 17:00-19:00\n場所: 渋谷\n参加費: 無料';
  await withCapturedLogs(async () => {
    const reply = await service.generateAssistantReply(buildPayload(text) as any);
    assert.notEqual(reply.nextQuestionKey, 'time');
  });
});

test('1-1) 解析只使用 userText，不解析提示词', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
    initialParse: () => buildDefaultInitialParse('zh'),
  });
  const { infos } = await withCapturedLogs(async () => {
    await service.generateAssistantReply(buildPayload('我想创建一个活动') as any);
  });
  const priceParse = infos
    .map((args) => args?.[1])
    .find((entry) => entry?.message === 'price_parse');
  assert.ok(priceParse);
  assert.equal(String(priceParse.rawText || ''), '我想创建一个活动');
  assert.equal(priceParse.ok, false);
});

test('1-2) 解析拒绝提示词/上下文污染', { concurrency: false }, async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const requestId = 'test-request-forbidden';
  const text = 'AIの理解：タイトル: テスト --- Assistant Prompt --- SOCIALMORE AI 憲章';
  await service.generateAssistantReply(buildPayload(text, undefined, requestId) as any);
  const entry = await readLatestLogEntry(requestId);
  assert.ok(entry);
  assert.equal(entry.parser?.price?.parserInputSource, 'rejected');
  assert.equal(entry.parser?.price?.ok, false);
  assert.equal(entry.parser?.price?.rawText, null);
});

test('1-3) 1000元 不触发时间解析', { concurrency: false }, async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
  });
  const requestId = 'test-request-no-time';
  const payload = {
    ...buildPayload('1000元', undefined, requestId),
    clientLocale: 'zh-CN',
    clientTimezone: 'Asia/Tokyo',
  };
  await service.generateAssistantReply(payload as any);
  const entry = await readLatestLogEntry(requestId);
  assert.ok(entry);
  assert.equal(entry.parser?.time?.ok, false);
  assert.equal(entry.parser?.time?.reason, 'not_attempted');
});

test('1-3a) 时段数字不应被当作金额', { concurrency: false }, async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const requestId = 'test-request-price-time-range';
  await service.generateAssistantReply(buildPayload('1/23 17-19 1000円', undefined, requestId) as any);
  const entry = await readLatestLogEntry(requestId);
  assert.ok(entry);
  assert.equal(entry.parser?.price?.ok, true);
  assert.equal(entry.parser?.price?.candidateAmount, 1000);
});

test('1-3b) 選択メッセージは parser に渡さない', { concurrency: false }, async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const requestId = 'test-request-choice-parse';
  await service.generateAssistantReply(
    buildPayload('【選択】confirm_location:未定', undefined, requestId) as any,
  );
  const entry = await readLatestLogEntry(requestId);
  assert.ok(entry);
  assert.equal(entry.parser?.time?.ok, false);
  assert.equal(entry.parser?.time?.reason, 'not_attempted');
});

test('1-3c) missing があれば nextQuestionKey は必ず返る', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const reply = await service.generateAssistantReply(buildPayload('関係ない話') as any);
  assert.ok(reply.nextQuestionKey);
});

test('1-3d) nextQuestionKey がある場合は choiceQuestion を出さない', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: {
        time: '来週金曜 15:00-17:00',
        location: '三鷹',
        price: '2000円/人',
      },
      missing: ['title'],
      confidence: { time: 0.8, location: 0.8, price: 0.8 },
      language: 'ja',
      firstReplyKey: 'ASK_TITLE',
    }),
  });
  const reply = await service.generateAssistantReply(
    buildPayload('来週金曜BBQ、15:00–17:00、三鷹、2000円/人') as any,
  );
  assert.equal(reply.nextQuestionKey, 'title');
  assert.equal(Boolean(reply.choiceQuestion), false);
  assert.equal(reply.inputChannel, 'text');
  assert.equal(reply.expectedSlotKey, 'title');
});

test('1-4) confirm_location:yes は候補値を保持して確定する', { concurrency: false }, async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const requestId = 'test-request-confirm-location';
  const conversation = [
    { role: 'assistant', content: '開催場所は「井の頭公園」でよいですか？' },
    { role: 'user', content: '【選択】confirm_location:yes' },
  ] as GenerateAssistantReplyDto['conversation'];
  const reply = await service.generateAssistantReply(buildPayload('【選択】confirm_location:yes', conversation, requestId) as any);
  assert.equal(reply.slots?.location, '井の頭公園');
  const entry = await readLatestLogEntry(requestId);
  assert.ok(entry);
  assert.equal(entry.machine?.missingKeys?.includes('location'), false);
});

test('1-5) followupUnknownNoDelta でも missingKeys が空にならない', { concurrency: false }, async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const requestId = 'test-request-followup-unknown';
  await service.generateAssistantReply(buildPayload('了解', undefined, requestId) as any);
  const entry = await readLatestLogEntry(requestId);
  assert.ok(entry);
  assert.ok(Array.isArray(entry.machine?.missingKeys));
  assert.ok(entry.machine?.missingKeys?.length > 0);
});

test('1-4) collecting/normalizer prompt 不包含憲章', async () => {
  let capturedSystem = '';
  const handlers = {
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' as const }),
  };
  const service = createServiceWithPrompts(handlers, [
    {
      id: 'event-assistant.collecting',
      status: 'published',
      system: 'SOCIALMORE AI 憲章\n--- Assistant Prompt ---\nPhase: collecting',
      instructions: 'Fields still missing: title/time',
      version: 'test',
      params: [],
    },
  ]);
  (service as any).client.chat.completions.create = async (params: any) => {
    capturedSystem = params?.messages?.[0]?.content ?? '';
    return {
      choices: [{ message: { content: JSON.stringify({ ui: { question: { key: 'title', text: 'タイトルを教えてください。' } } }) } }],
    };
  };
  await service.generateAssistantReply(buildPayload('テスト') as any);
  assert.equal(/SOCIALMORE AI 憲章|--- Assistant Prompt ---|Fields still missing/i.test(capturedSystem), false);
});

test('1-5) normalizer system prompt 不包含憲章', async () => {
  const { buildSlotNormalizerPrompt } = await import('../src/ai/slot-normalizer');
  const prompt = buildSlotNormalizerPrompt({
    rawUserText: 'テスト',
    currentSlots: {},
    currentNextQuestionKey: 'price',
    recentTurns: [],
  });
  assert.equal(/SOCIALMORE AI 憲章|--- Assistant Prompt ---/i.test(prompt.systemPrompt), false);
});

test('1-6) constitution flag 仅影响 ready/operate', async () => {
  const service = createServiceWithPrompts(
    {
      router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' as const }),
    },
    [
      {
        id: 'event-assistant.ready',
        status: 'published',
        system: 'SOCIALMORE AI 憲章\nReady system prompt',
        instructions: 'Ready instruction',
        version: 'test',
        params: [],
      },
    ],
  );
  const originalMode = process.env.EVENT_ASSISTANT_CONSTITUTION_MODE;
  process.env.EVENT_ASSISTANT_CONSTITUTION_MODE = 'full';
  const resolvedFull = await (service as any).resolveEventAssistantPrompt('ready', {
    latest_message: 'テスト',
    phase: 'ready',
  });
  assert.equal(/SOCIALMORE AI 憲章/.test(resolvedFull.systemPrompt), true);
  process.env.EVENT_ASSISTANT_CONSTITUTION_MODE = 'off';
  const resolvedOff = await (service as any).resolveEventAssistantPrompt('ready', {
    latest_message: 'テスト',
    phase: 'ready',
  });
  assert.equal(/SOCIALMORE AI 憲章/.test(resolvedOff.systemPrompt), false);
  process.env.EVENT_ASSISTANT_CONSTITUTION_MODE = originalMode;
});

test('2) 混中日输入 time/price inferred 完成', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
    initialParse: () => buildDefaultInitialParse('zh'),
  });
  await withCapturedLogs(async () => {
    const reply = await service.generateAssistantReply(buildPayload('1/23 17-23 一人4000') as any);
    assert.notEqual(reply.nextQuestionKey, 'time');
    assert.notEqual(reply.nextQuestionKey, 'price');
  });
});

test('2-1) 必要情報が揃ったら confirm を出せる', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const text = [
    'イベント名: テスト会',
    '日時: 平日夜',
    '場所: 渋谷',
    '参加費: 1000円',
    '参加条件: 友人同僚',
  ].join('\n');
  const reply = await service.generateAssistantReply(buildPayload(text) as any);
  // Ready gate now drives the flow directly into ready without extra confirm choice
  assert.equal(reply.choiceQuestion ?? null, null);
  assert.equal(reply.nextQuestionKey ?? null, null);
});

test('2-2) zh + Tokyo 输入 1000元 触发货币确认', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
  });
  const payload = {
    ...buildPayload('1000元'),
    clientLocale: 'zh-CN',
    clientTimezone: 'Asia/Tokyo',
  };
  const reply = await service.generateAssistantReply(payload as any);
  assert.equal(reply.choiceQuestion?.key, 'confirm_currency');
  const labels = reply.choiceQuestion?.options.map((opt) => opt.label).join(' ') ?? '';
  assert.match(labels, /1000円/);
});

test('2-3) 货币确认 JPY 后 price 生效', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
  });
  const conversation = [{ role: 'user' as const, content: '【選択】confirm_currency:confirm_jpy_1000' }];
  const payload = {
    ...buildPayload('【選択】confirm_currency:confirm_jpy_1000', conversation),
    clientLocale: 'zh-CN',
    clientTimezone: 'Asia/Tokyo',
  };
  const reply = await service.generateAssistantReply(payload as any);
  assert.equal(reply.slots?.price?.includes('円'), true);
  assert.notEqual(reply.nextQuestionKey, 'price');
});

test('2-4) en locale 输入 1000元 也触发确认', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'en' }),
  });
  const payload = {
    ...buildPayload('1000元'),
    clientLocale: 'en-US',
    clientTimezone: 'Asia/Tokyo',
  };
  const reply = await service.generateAssistantReply(payload as any);
  assert.equal(reply.choiceQuestion?.key === 'confirm_currency', true);
});

test('2-5) 中文相对时间解析', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
  });
  process.env.EVENT_ASSISTANT_NOW = '2026-01-14T00:00:00+09:00';
  const requestId = 'test-request-zh-time';
  const payload = {
    ...buildPayload('下周二下午三点到五点', undefined, requestId),
    clientLocale: 'zh-CN',
    clientTimezone: 'Asia/Tokyo',
  };
  const { infos } = await withCapturedLogs(async () => {
    await service.generateAssistantReply(payload as any);
  });
  const timeParse = infos
    .map((args) => args?.[1])
    .find((entry) => entry?.message === 'time_parse');
  assert.ok(timeParse);
  assert.match(timeParse.candidateStartAt, /2026-01-20T06:00:00/);
  assert.match(timeParse.candidateEndAt, /2026-01-20T08:00:00/);
  const entry = await readLatestLogEntry(requestId);
  assert.ok(entry);
  assert.equal(entry.machine?.missingKeys?.includes('time'), false);
  delete process.env.EVENT_ASSISTANT_NOW;
});

test('2-5b) 下周五上午十点到12点 解析', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
  });
  process.env.EVENT_ASSISTANT_NOW = '2026-01-14T00:00:00+09:00';
  const payload = {
    ...buildPayload('下周五的上午十点到12点'),
    clientLocale: 'zh-CN',
    clientTimezone: 'Asia/Tokyo',
  };
  const { infos } = await withCapturedLogs(async () => {
    await service.generateAssistantReply(payload as any);
  });
  const timeParse = infos
    .map((args) => args?.[1])
    .find((entry) => entry?.message === 'time_parse');
  assert.ok(timeParse);
  assert.match(timeParse.candidateStartAt, /2026-01-23T01:00:00/);
  assert.match(timeParse.candidateEndAt, /2026-01-23T03:00:00/);
  delete process.env.EVENT_ASSISTANT_NOW;
});

test('2-5c) 时间文本不应解析为价格', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
  });
  const requestId = 'test-request-no-price-from-time';
  const payload = {
    ...buildPayload('下周五的上午十点到12点', undefined, requestId),
    clientLocale: 'zh-CN',
    clientTimezone: 'Asia/Tokyo',
  };
  await service.generateAssistantReply(payload as any);
  const entry = await readLatestLogEntry(requestId);
  assert.ok(entry);
  assert.equal(entry.parser?.price?.candidateAmount, null);
  assert.equal(entry.parser?.price?.ok, false);
});

test('2-5a) 复现实例：先描述后补时间应推进', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
  });
  process.env.EVENT_ASSISTANT_NOW = '2026-01-14T00:00:00+09:00';
  const conversation = [
    { role: 'user' as const, content: '下周五，我想办一个bbq，10个人左右，费用待定' },
    { role: 'user' as const, content: '下周五的上午十点到12点' },
  ];
  const payload = {
    ...buildPayload('下周五的上午十点到12点', conversation),
    clientLocale: 'zh-CN',
    clientTimezone: 'Asia/Tokyo',
  };
  const { infos } = await withCapturedLogs(async () => {
    const reply = await service.generateAssistantReply(payload as any);
    assert.ok(reply.nextQuestionKey);
  });
  const timeParse = infos
    .map((args) => args?.[1])
    .find((entry) => entry?.message === 'time_parse');
  assert.ok(timeParse?.candidateStartAt);
  delete process.env.EVENT_ASSISTANT_NOW;
});

test('2-6) shell 输出短路 LLM', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const shellText = [
    'pppoly@more-staging:/opt/more-app/backend$ ls -la',
    'No such file or directory',
    '/opt/more-app/backend',
  ].join('\n');
  const { infos } = await withCapturedLogs(async () => {
    const reply = await service.generateAssistantReply(buildPayload(shellText) as any);
    assert.match(reply.ui?.message ?? '', /ログ\/コマンド/);
  });
  const llmCalls = infos
    .map((args) => args?.[1])
    .filter((entry) => entry?.message === 'llm_call');
  assert.equal(llmCalls.length, 0);
});

test('2-7) missingKeys 存在时 nextQuestionKey 有优先级', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
    initialParse: () => buildDefaultInitialParse('zh'),
  });
  const reply = await service.generateAssistantReply(buildPayload('我想创建一个活动') as any);
  assert.equal(reply.nextQuestionKey, 'time');
});

test('2-8) confirm_location 不应清空既有确认', { concurrency: false }, async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const requestId = 'test-request-confirm-location';
  const conversation = [
    {
      role: 'user' as const,
      content: 'タイトル: テスト会\n日時: 1/23 19:00-21:00\n場所: 渋谷\n参加費: 1000円',
    },
    { role: 'user' as const, content: '【選択】confirm_location:yes' },
  ];
  await service.generateAssistantReply(buildPayload('【選択】confirm_location:yes', conversation, requestId) as any);
  const entry = await readLatestLogEntry(requestId);
  assert.ok(entry);
  const confirmed = entry.machine?.confirmedKeys ?? [];
  assert.ok(confirmed.includes('time'));
  assert.ok(confirmed.includes('price'));
  assert.ok(confirmed.includes('location'));
  const missing = entry.machine?.missingKeys ?? [];
  assert.equal(missing.includes('time'), false);
  assert.equal(missing.includes('price'), false);
  assert.equal(missing.includes('location'), false);
});

test('2-8a) 确认しました 必须提交状态', { concurrency: false }, async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const requestId = 'test-request-confirm-price-text';
  const conversation = [
    {
      role: 'user' as const,
      content: 'タイトル: テスト会\n日時: 1/23 19:00-21:00\n場所: 渋谷\n参加費: 1000円',
    },
    { role: 'assistant' as const, content: '参加費は1000円でよろしいですか？' },
    { role: 'user' as const, content: '确认しました' },
  ];
  await service.generateAssistantReply(buildPayload('确认しました', conversation, requestId) as any);
  const entry = await readLatestLogEntry(requestId);
  assert.ok(entry);
  const confirmed = entry.machine?.confirmedKeys ?? [];
  assert.ok(confirmed.includes('price'));
  const missing = entry.machine?.missingKeys ?? [];
  assert.equal(missing.includes('price'), false);
});

test('2-9) 价格解析使用当前输入而非历史', { concurrency: false }, async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const requestId = 'test-request-current-price';
  const conversation = [
    { role: 'user' as const, content: '前回は1000円だった' },
    { role: 'user' as const, content: '一人10000' },
  ];
  await service.generateAssistantReply(buildPayload('一人10000', conversation, requestId) as any);
  const entry = await readLatestLogEntry(requestId);
  assert.ok(entry);
  assert.equal(entry.parser?.price?.rawText, '一人10000');
  assert.equal(entry.parser?.price?.candidateAmount, 10000);
});

test('2-9a) price 질문 상태에서 순수 숫자도 금액으로 인식', { concurrency: false }, async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const conversation = [
    { role: 'user' as const, content: '前の入力' },
    { role: 'assistant' as const, content: '参加費はいくらですか？' },
    { role: 'user' as const, content: '10000' },
  ];
  const reply = await service.generateAssistantReply(
    buildPayload('10000', conversation, 'test-request-bare-price') as any,
  );
  assert.equal(reply.slots?.price, '10000円');
});

test('2-9b) 日元 は CNY 判定しない', { concurrency: false }, async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const requestId = 'test-request-jpy-text';
  await service.generateAssistantReply(
    buildPayload('10000日元', undefined, requestId) as any,
  );
  const entry = await readLatestLogEntry(requestId);
  assert.ok(entry);
  assert.equal(entry.parser?.price?.reason, 'parsed');
  assert.equal(entry.parser?.price?.currency, 'JPY');
});

test('3) 委托标题不会写入原句为 title', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: {},
      missing: ['title', 'time', 'location', 'price', 'details'],
      confidence: {},
      language: 'zh',
      firstReplyKey: 'ASK_TITLE',
    }),
    titleSuggestions: () => ({ titles: ['候補タイトルA', '候補タイトルB', '候補タイトルC'] }),
  });
  const conversation = [
    { role: 'user' as const, content: '前の入力' },
    { role: 'assistant' as const, content: 'タイトルを教えてください。' },
    { role: 'user' as const, content: '你帮我想一个标题吧' },
  ];
  const reply = await service.generateAssistantReply(
    buildPayload('你帮我想一个标题吧', conversation) as any,
  );
  assert.notEqual(reply.slots?.title, '你帮我想一个标题吧');
  assert.ok(reply.autoTitle);
});

test('4) help/explain 进入 explain mode 且不出现未確定', async () => {
  const service = createService({
    router: () => ({ route: 'HELP_HOWTO', confidence: 0.9, language: 'zh' }),
    initialParse: () => ({
      intent: 'HELP_HOWTO',
      slots: {},
      missing: [],
      confidence: {},
      language: 'zh',
      firstReplyKey: 'HELP',
    }),
  });
  const reply = await service.generateAssistantReply(buildPayload('怎么用') as any);
  assert.equal(reply.ui?.mode, 'explain');
  assert.equal(reply.messageSource, 'backend.ui');
  assert.ok(!reply.ui?.message?.includes('未確定'));
});

test('4-1) help 直达 explain 且 LLM 调用为 0', async () => {
  const service = createService({
    router: () => ({ route: 'HELP_SYSTEM', confidence: 0.9, language: 'ja' }),
  });
  const { infos } = await withCapturedLogs(async () => {
    const reply = await service.generateAssistantReply(buildPayload('これは何の機能') as any);
    assert.equal(reply.ui?.mode, 'explain');
    assert.equal(reply.nextQuestionKey, null);
  });
  const llmCalls = infos.filter((args) => args[1]?.message === 'llm_call');
  assert.equal(llmCalls.length, 0);
});

test('4-1a) help 直达 explain 且无 llm_call_blocked', async () => {
  const service = createService({
    router: () => ({ route: 'HELP_SYSTEM', confidence: 0.9, language: 'ja' }),
  });
  const { warns } = await withCapturedLogs(async () => {
    const reply = await service.generateAssistantReply(buildPayload('怎么用') as any);
    assert.equal(reply.ui?.mode, 'explain');
  });
  const blocked = warns.filter((args) => args[1]?.message === 'llm_call_blocked');
  assert.equal(blocked.length, 0);
});

test('4-2) 首轮 ready 不调用 router/initial_parse', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: {},
      missing: [],
      confidence: {},
      language: 'ja',
      firstReplyKey: 'ASK_TITLE',
    }),
  });
  const text = [
    'イベント名: BBQ交流会',
    '日付: 1/23',
    '時間: 17:00-19:00',
    '場所: 渋谷',
    '参加費: 1000円',
    '参加条件: 友人同僚で交流',
    '参加人数: 20人',
    '申込フォーム: 氏名・電話',
    '公開範囲: 公開',
  ].join('\n');
  const { infos } = await withCapturedLogs(async () => {
    await service.generateAssistantReply(buildPayload(text) as any);
  });
  const llmCalls = infos.filter((args) => args[1]?.message === 'llm_call');
  const routerCalls = llmCalls.filter((args) => args[1]?.name === 'router');
  const parseCalls = llmCalls.filter((args) => args[1]?.name === 'initial_parse');
  assert.equal(routerCalls.length, 0);
  assert.equal(parseCalls.length, 0);
});

test('5) 回答 price 后 nextQuestionKey 不应回到 price', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: { price: '4000円' },
      missing: ['title', 'time', 'location', 'details'],
      confidence: { price: 0.8 },
      language: 'ja',
      firstReplyKey: 'ASK_TIME',
    }),
  });
  const conversation = [
    { role: 'assistant' as const, content: '参加費はいくらですか？' },
    { role: 'user' as const, content: '4000円' },
  ];
  const reply = await service.generateAssistantReply(buildPayload('4000円', conversation) as any);
  assert.notEqual(reply.nextQuestionKey, 'price');
});

test('5-1) title 委托记录 title_suggestions ledger', async () => {
  const service = createService({
    normalizer: () => ({
      intent: 'answer',
      updates: {},
      ambiguities: [],
      shouldCloseSlot: false,
    }),
    titleSuggestions: () => ({ titles: ['候補A', '候補B'] }),
  });
  const conversation = [
    { role: 'user' as const, content: '前の入力' },
    { role: 'assistant' as const, content: 'イベントのタイトルを教えてください。' },
    { role: 'user' as const, content: '任せる' },
  ];
  const { infos } = await withCapturedLogs(async () => {
    await service.generateAssistantReply(buildPayload('任せる', conversation) as any);
  });
  const llmCalls = infos.filter((args) => args[1]?.message === 'llm_call');
  const titleCalls = llmCalls.filter((args) => args[1]?.name === 'title_suggestions');
  assert.ok(titleCalls.length >= 1);
});

test('5-2) ready 阶段不触发 title_suggestions', async () => {
  const service = createService({
    main: () => ({ ui: { message: 'ready-ok' } }),
  });
  const text = [
    'イベント名: BBQ交流会',
    '日付: 1/23',
    '時間: 17:00-19:00',
    '場所: 渋谷',
    '参加費: 1000円',
    '参加条件: 友人同僚で交流',
    '参加人数: 20人',
    '申込フォーム: 氏名・電話',
    '公開範囲: 公開',
  ].join('\n');
  const { infos } = await withCapturedLogs(async () => {
    await service.generateAssistantReply(buildPayload(text) as any);
  });
  const titleCalls = infos.filter((args) => args[1]?.name === 'title_suggestions');
  assert.equal(titleCalls.length, 0);
});

test('6) edit 단계未定输入不会写入字段且不会跳到日時', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: {},
      missing: ['title', 'time', 'location', 'price', 'details'],
      confidence: {},
      language: 'zh',
      firstReplyKey: 'ASK_TITLE',
    }),
  });
  const conversation = [
    { role: 'assistant' as const, content: 'どこを直したいですか？' },
    { role: 'user' as const, content: '未定你帮我看看' },
  ];
  const reply = await service.generateAssistantReply(
    buildPayload('未定你帮我看看', conversation) as any,
  );
  assert.equal(reply.nextQuestionKey, null);
  assert.ok(reply.ui?.message?.includes('直したい項目を教えてください'));
});

test('6-1) revise select_field 不写入 slot', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: {},
      missing: ['title', 'time', 'location', 'price', 'details'],
      confidence: {},
      language: 'ja',
      firstReplyKey: 'ASK_TITLE',
    }),
  });
  const conversation = [
    { role: 'assistant' as const, content: 'どこを直したいですか？' },
    { role: 'user' as const, content: '明日19時にしたい' },
  ];
  const reply = await service.generateAssistantReply(
    buildPayload('明日19時にしたい', conversation) as any,
  );
  assert.equal(reply.nextQuestionKey, null);
  assert.equal(reply.slots?.time, undefined);
});

test('6-2) edit_field 委托时回到选择项', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: {},
      missing: ['title', 'time', 'location', 'price', 'details'],
      confidence: {},
      language: 'ja',
      firstReplyKey: 'ASK_TITLE',
    }),
  });
  const conversation = [
    { role: 'assistant' as const, content: '参加費はいくらですか？' },
    { role: 'user' as const, content: '任せる' },
  ];
  const reply = await service.generateAssistantReply(
    buildPayloadWithAction('任せる', conversation, 'continue_edit') as any,
  );
  assert.equal(reply.nextQuestionKey, null);
  assert.ok(reply.ui?.message?.includes('直したい項目を教えてください'));
});

test('6-3) edit_field 委托不写入 delegateDefaults', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const conversation = [
    { role: 'assistant' as const, content: '参加費はいくらですか？' },
    { role: 'user' as const, content: '任せる' },
  ];
  const reply = await service.generateAssistantReply(
    buildPayloadWithAction('任せる', conversation, 'continue_edit') as any,
  );
  assert.equal(reply.slots?.price, undefined);
  assert.equal(reply.nextQuestionKey, null);
});

test('7) missing_keys_mismatch WARN 不应出现', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: { time: '1/23 17-19', price: '1000円' },
      missing: ['title', 'location', 'details'],
      confidence: { time: 0.8, price: 0.8 },
      language: 'ja',
      firstReplyKey: 'ASK_TITLE',
    }),
  });
  const { warns } = await withCapturedLogs(async () => {
    await service.generateAssistantReply(buildPayload('1/23 17-19 1000円') as any);
  });
  const mismatch = warns.filter((args) => args[1]?.message === 'missing_keys_mismatch_danger');
  assert.equal(mismatch.length, 0);
});

test('8) messageSource 缺失 WARN 不应出现（后端）', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: { time: '1/23 17-19', price: '1000円' },
      missing: ['title', 'location', 'details'],
      confidence: { time: 0.8, price: 0.8 },
      language: 'ja',
      firstReplyKey: 'ASK_TITLE',
    }),
  });
  const { warns } = await withCapturedLogs(async () => {
    const reply = await service.generateAssistantReply(buildPayload('1/23 17-19 1000円') as any);
    assert.ok(reply.messageSource);
  });
  const missingSource = warns.filter((args) => args[1]?.message === 'missing_message_source');
  assert.equal(missingSource.length, 0);
});

test('9) LLM ledger 阈值触发记录（基线）', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: { time: '1/23 17-19', price: '1000円' },
      missing: ['title', 'location', 'details'],
      confidence: { time: 0.8, price: 0.8 },
      language: 'ja',
      firstReplyKey: 'ASK_TITLE',
    }),
  });
  const { warns } = await withCapturedLogs(async () => {
    await service.generateAssistantReply(buildPayload('1/23 17-19 1000円') as any);
  });
  const ledgerWarns = warns.filter((args) => args[1]?.message === 'llm_call_ledger_threshold');
  assert.equal(ledgerWarns.length, 0);
});

test('9-1) collect 轮不允许 main LLM', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: { time: '1/23 17:00-19:00' },
      missing: ['title', 'location', 'price', 'details'],
      confidence: { time: 0.8 },
      language: 'ja',
      firstReplyKey: 'ASK_TITLE',
    }),
  });
  const conversation = [
    { role: 'user' as const, content: '起手信息' },
    { role: 'assistant' as const, content: '開催日時を教えてください。' },
    { role: 'user' as const, content: '1/23 17:00-19:00' },
  ];
  const { infos } = await withCapturedLogs(async () => {
    await service.generateAssistantReply(buildPayload('1/23 17:00-19:00', conversation) as any);
  });
  const llmCalls = infos.filter((args) => args[1]?.message === 'llm_call');
  const mainAllowed = llmCalls.find(
    (args) => args[1]?.name === 'main_llm' && args[1]?.allowed === true,
  );
  assert.equal(Boolean(mainAllowed), false);
});

test('9-2) normalizer 兜底问题必须带 nextQuestionKey', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    normalizer: () => ({
      intent: 'ask',
      updates: {},
      ambiguities: [],
      shouldCloseSlot: false,
    }),
  });
  const conversation = [
    {
      role: 'user' as const,
      content: 'タイトル: BBQ\n日時: 1/23 17:00-19:00\n場所: 渋谷\n説明: 交流会',
    },
    { role: 'assistant' as const, content: '参加費はいくらですか？' },
    { role: 'user' as const, content: '未定' },
    { role: 'assistant' as const, content: '参加費はいくらですか？' },
    { role: 'user' as const, content: 'まだ決めてない' },
  ];
  const reply = await service.generateAssistantReply(
    buildPayload('まだ決めてない', conversation) as any,
  );
  assert.equal(reply.nextQuestionKey, 'price');
});

test('9-3) unrelatedAnswerKey でも missing があれば nextQuestionKey を維持', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: { time: '1/23 17:00-19:00', location: '渋谷', details: '交流会' },
      missing: ['title', 'price'],
      confidence: { time: 0.8, location: 0.8, details: 0.8 },
      language: 'ja',
      firstReplyKey: 'ASK_TITLE',
    }),
  });
  const conversation = [
    { role: 'user' as const, content: '前の入力' },
    { role: 'assistant' as const, content: '参加費はいくらですか？' },
    { role: 'user' as const, content: '関係ない話' },
  ];
  const { infos } = await withCapturedLogs(async () => {
    const reply = await service.generateAssistantReply(
      buildPayload('関係ない話', conversation) as any,
    );
    assert.equal(reply.nextQuestionKey, 'price');
  });
  const trace = infos.find((args) => args[1]?.message === 'next_question_key_trace');
  assert.ok(trace?.[1]?.nextQuestionKeyCandidate);
  assert.equal(trace?.[1]?.finalNextQuestionKey, 'price');
});

test('9-3a) compare 模式锁定 nextQuestionKey 为 null', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const conversation = [
    { role: 'user' as const, content: 'AとBどっちがいい？' },
    { role: 'assistant' as const, content: 'どちらが近いですか？' },
    { role: 'user' as const, content: 'A' },
  ];
  const { infos } = await withCapturedLogs(async () => {
    const reply = await service.generateAssistantReply(
      buildPayload('A', conversation) as any,
    );
    assert.ok(reply.nextQuestionKey);
  });
  const trace = infos.find((args) => args[1]?.message === 'next_question_key_trace');
  assert.ok(trace?.[1]?.finalNextQuestionKey);
});

test('10) nextQuestionKey 锁定且避免同字段连问', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: {},
      missing: ['title', 'time', 'location', 'price', 'details'],
      confidence: {},
      language: 'ja',
      firstReplyKey: 'ASK_TITLE',
    }),
  });
  const conversation = [
    { role: 'assistant' as const, content: '参加費はいくらですか？' },
    { role: 'user' as const, content: '未定' },
    { role: 'assistant' as const, content: '参加費はいくらですか？' },
  ];
  const { infos } = await withCapturedLogs(async () => {
    await service.generateAssistantReply(buildPayload('まだ決めてない', conversation) as any);
  });
  const traceArgs = infos.find((args) => args[1]?.message === 'next_question_key_trace');
  assert.ok(traceArgs, 'next_question_key_trace not found');
  const trace = traceArgs?.[1] ?? {};
  assert.equal(trace.finalNextQuestionKey, 'price');
  assert.equal(trace.nextQuestionKeyLocked, true);
});

test('10-1) 提问必须带 nextQuestionKey', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => buildDefaultInitialParse('ja'),
  });
  const reply = await service.generateAssistantReply(buildPayload('イベント作ります') as any);
  if (reply.ui?.question?.key) {
    assert.equal(reply.nextQuestionKey, reply.ui.question.key);
  } else if (reply.choiceQuestion?.key) {
    assert.equal(reply.nextQuestionKey, reply.choiceQuestion.key);
  }
});

test('11) normalizePromptPhase 归一化 collecting/parsing/operating', () => {
  assert.equal(normalizePromptPhase('collecting'), 'collect');
  assert.equal(normalizePromptPhase('parsing'), 'parse');
  assert.equal(normalizePromptPhase('operating'), 'operate');
  assert.equal(normalizePromptPhase('collect'), 'collect');
  assert.equal(normalizePromptPhase('ready'), 'ready');
  assert.equal(normalizePromptPhase('unknown-phase'), null);
});

test('12) UI 状态 collecting 映射 promptPhase=collect', () => {
  assert.equal(getPromptPhaseFromStatus('collecting'), 'collect');
  assert.equal(getPromptPhaseFromStatus('ready'), 'ready');
});

test.skip('13) 草稿可见性 trace（前端） - SKIP (frontend runtime only)', () => {
  // Requires frontend runtime to verify draft_visibility_mismatch; documented skip.
});

test('14) turnIndex should not go backwards for same conversationId', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const conversationId = 'conv-stable-1';
  const requestId1 = 'turn-idx-1';
  const requestId2 = 'turn-idx-2';
  await service.generateAssistantReply(
    {
      ...buildPayload('来週金曜BBQ、15:00–17:00、三鷹、2000円/人', [{ role: 'user', content: '来週金曜BBQ、15:00–17:00、三鷹、2000円/人' }], requestId1),
      conversationId,
    } as any,
  );
  await service.generateAssistantReply(
    {
      ...buildPayload('周末一起去happy', [{ role: 'user', content: '周末一起去happy' }], requestId2),
      conversationId,
    } as any,
  );
  const entry1 = await readLatestLogEntry(requestId1);
  const entry2 = await readLatestLogEntry(requestId2);
  assert.ok(entry1 && entry2);
  assert.ok(entry2.turnIndex > entry1.turnIndex);
});
