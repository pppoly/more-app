import test from 'node:test';
import assert from 'node:assert/strict';
import { AiService, GenerateAssistantReplyDto } from '../src/ai/ai.service';

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

const buildPayload = (text: string, conversation?: GenerateAssistantReplyDto['conversation']) => ({
  baseLanguage: 'ja',
  topic: '',
  audience: '',
  style: '',
  details: 'test',
  conversation: conversation ?? [{ role: 'user', content: text }],
  uiMode: 'collecting' as const,
  requestId: 'test-request',
  conversationId: 'test-conversation',
});
const buildPayloadWithAction = (
  text: string,
  conversation: GenerateAssistantReplyDto['conversation'],
  action: GenerateAssistantReplyDto['action'],
) => ({
  ...buildPayload(text, conversation),
  action,
});

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

test('2-1) 候选时间会触发确认 선택', async () => {
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
  assert.equal(Boolean(reply.choiceQuestion?.key?.startsWith('confirm_')), true);
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

test('9-2) normalizer 不直接写 nextQuestionKey', async () => {
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
  assert.notEqual(reply.nextQuestionKey, 'price');
});

test('9-3) unrelatedAnswerKey 直接锁定为 null', async () => {
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
    assert.equal(reply.nextQuestionKey, null);
  });
  const trace = infos.find((args) => args[1]?.message === 'next_question_key_trace');
  assert.ok(trace?.[1]?.nextQuestionKeyCandidate);
  assert.equal(trace?.[1]?.finalNextQuestionKey, null);
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
    assert.equal(reply.nextQuestionKey ?? null, null);
  });
  const trace = infos.find((args) => args[1]?.message === 'next_question_key_trace');
  assert.equal(trace?.[1]?.finalNextQuestionKey ?? null, null);
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
  assert.notEqual(trace.nextQuestionKeyCandidate, 'price');
  if (trace.finalNextQuestionKey !== null) {
    assert.equal(trace.nextQuestionKeyCandidate, trace.finalNextQuestionKey);
  }
  assert.equal(trace.nextQuestionKeyLocked, true);
});

test('11) 草稿可见性 trace（前端）', { skip: true }, () => {
  // TODO: requires frontend runtime to verify draft_visibility_mismatch
});
