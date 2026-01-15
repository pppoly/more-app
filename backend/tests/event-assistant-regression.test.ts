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
  conversation:
    conversation && conversation.length
      ? conversation[conversation.length - 1]?.role === 'user'
        ? conversation
        : [...conversation, { role: 'user', content: text }]
      : [{ role: 'user', content: text }],
  uiMode: 'collecting' as const,
  requestId,
  conversationId: 'test-conversation',
  clientLocale: 'ja',
  clientTimezone: 'Asia/Tokyo',
});

test('TC-1) single-action: no uiQuestionText + choiceQuestion together', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const reply = await service.generateAssistantReply(
    buildPayload('来週金曜BBQ、15:00–17:00、三鷹、2000円/人') as any,
  );
  assert.equal(Boolean(reply.ui?.question?.text && reply.choiceQuestion), false);
});

test('TC-2) title input commits when expected', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
  });
  const conversation = [
    { role: 'assistant' as const, content: 'イベントのタイトルを教えてください。 [ask:title]' },
    { role: 'user' as const, content: '周末一起去happy' },
  ];
  const reply = await service.generateAssistantReply(buildPayload('周末一起去happy', conversation) as any);
  assert.equal(reply.slots?.title, '周末一起去happy');
  assert.notEqual(reply.nextQuestionKey, 'title');
});

test('TC-2b) title input commits even if last asked slot was location', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
  });
  const conversation = [
    { role: 'assistant' as const, content: '開催場所を教えてください。 [ask:location]' },
    { role: 'user' as const, content: '周末一起去happy' },
  ];
  const reply = await service.generateAssistantReply(buildPayload('周末一起去happy', conversation) as any);
  assert.equal(reply.slots?.title, '周末一起去happy');
});

test('TC-2c) title input should not be treated as unknown followup', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
  });
  const reply = await service.generateAssistantReply(buildPayload('周末一起去happy') as any);
  assert.equal(reply.slots?.title, '周末一起去happy');
});

test('TC-2e) meta affirmation should not overwrite title', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
  });
  const conversation = [{ role: 'assistant' as const, content: 'イベントのタイトルを教えてください。 [ask:title]' }];
  const reply = await service.generateAssistantReply(buildPayload('对', conversation) as any);
  assert.equal(reply.slots?.title ?? null, null);
  assert.equal(reply.nextQuestionKey, 'title');
});

test('TC-2f) corrective title input with prefix commits properly', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
  });
  const conversation = [{ role: 'assistant' as const, content: 'イベントのタイトルを教えてください。 [ask:title]' }];
  const reply = await service.generateAssistantReply(
    buildPayload('标题是：周末一起去happy', conversation) as any,
  );
  assert.equal(reply.slots?.title, '周末一起去happy');
  assert.notEqual(reply.nextQuestionKey, 'title');
});

test('TC-2d) persisted title should not regress across turns', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
  });
  const conversationId = 'conv-title-1';
  await service.generateAssistantReply(
    {
      ...buildPayload('来週金曜BBQ、15:00–17:00、三鷹、2000円/人'),
      conversationId,
    } as any,
  );
  const second = await service.generateAssistantReply(
    {
      ...buildPayload('周末一起去happy'),
      conversationId,
    } as any,
  );
  assert.equal(second.slots?.title, '周末一起去happy');
  assert.notEqual(second.nextQuestionKey, 'title');
});

test('TC-ReadyGate) all required present forces ready and no questions', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: { title: 'BBQ', time: '1/23 15:00-17:00', location: '三鷹', price: '2000円' },
      missing: [],
      confidence: {},
      language: 'ja',
      firstReplyKey: 'ASK_NONE',
    }),
  });
  const reply = await service.generateAssistantReply(buildPayload('OKです') as any);
  assert.equal(reply.draftReady, true);
  assert.equal(reply.state === 'ready' || reply.status === 'ready', true);
  assert.equal(Boolean(reply.ui?.question), false);
  assert.equal(reply.choiceQuestion?.key ?? 'ready', 'ready_next_action');
  assert.equal(reply.publicActivityDraft?.price, '2000円');
  const serialized = JSON.stringify(reply.publicActivityDraft ?? {});
  assert.equal(serialized.includes('無料'), false);
});

test('TC-ReadyGate confirm/interrupt choice still regression', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: { title: 'BBQ', time: '1/23 15:00-17:00', location: '三鷹', price: '2000円' },
      missing: [],
      confidence: {},
      language: 'ja',
      firstReplyKey: 'ASK_NONE',
    }),
  });
  const base = await service.generateAssistantReply(buildPayload('OKです') as any);
  const badChoice = { ...base, choiceQuestion: { key: 'confirm_time', prompt: '確認', options: [] } as any };
  const reply = badChoice as any;
  const failureCount = Array.isArray((reply as any).quality?.failureTypes)
    ? (reply as any).quality.failureTypes.length
    : 0;
  assert.equal(
    failureCount === 0 && !(reply.choiceQuestion?.key?.startsWith('confirm_') || reply.choiceQuestion?.key === 'interrupt'),
    false,
  );
});

test('TC-3) confirm_location does not reset confirmed slots', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const conversation = [
    { role: 'user' as const, content: '来週金曜BBQ、15:00–17:00、三鷹、2000円/人' },
    { role: 'assistant' as const, content: '開催場所は「三鷹」でよいですか？' },
    { role: 'user' as const, content: '【選択】confirm_location:yes' },
  ];
  const reply = await service.generateAssistantReply(buildPayload('【選択】confirm_location:yes', conversation) as any);
  assert.equal(Boolean(reply.slots?.time), true);
  assert.equal(Boolean(reply.slots?.price), true);
  assert.equal(Boolean(reply.slots?.location), true);
});

test('TC-4) prompt blob should not produce price', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const reply = await service.generateAssistantReply(
    buildPayload('AIの理解：タイトル: テスト --- Assistant Prompt --- SOCIALMORE AI 憲章') as any,
  );
  assert.equal(Boolean(reply.slots?.price), false);
});

test('TC-5) zh time+location same sentence advances beyond time', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'zh' }),
  });
  const reply = await service.generateAssistantReply(
    buildPayload('下周二下午三点到五点，三鹰市的井之头公园') as any,
  );
  assert.equal(Boolean(reply.slots?.time), true);
  assert.notEqual(reply.nextQuestionKey, 'time');
});

test('TC-6) multiline fields should fill core slots', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const text = [
    'タイトル: BBQ',
    '日時: 1/23 17:00-19:00',
    '場所: 渋谷',
    '参加費: 無料',
  ].join('\n');
  const reply = await service.generateAssistantReply(buildPayload(text) as any);
  assert.equal(Boolean(reply.slots?.title), true);
  assert.equal(Boolean(reply.slots?.time), true);
  assert.equal(Boolean(reply.slots?.location), true);
  assert.equal(Boolean(reply.slots?.price), true);
});

test('TC-7) yuan input triggers currency confirmation', async () => {
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
});

test('TC-8) confirm currency JPY commits price', async () => {
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
});

test('TC-9) uiQuestionText must carry nextQuestionKey', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const reply = await service.generateAssistantReply(buildPayload('イベント作ります') as any);
  assert.equal(Boolean(reply.ui?.question?.text), true);
  assert.notEqual(reply.nextQuestionKey, null);
});

test('TC-10) choice input should not override into dual-action output', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
  });
  const reply = await service.generateAssistantReply(buildPayload('【選択】confirm_location:yes') as any);
  assert.equal(Boolean(reply.ui?.question?.text && reply.choiceQuestion), false);
});

test('TC-11) draft text contamination is rejected', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: {
        title: '映画会',
        time: '2026/01/20 19:00',
        location: '新宿',
        price: '1500円',
        details: 'AIの理解：これは漏洩です --- Assistant Prompt ---',
      },
      missing: [],
      confidence: {},
      language: 'ja',
      firstReplyKey: 'ASK_NONE',
    }),
  });
  const reply = await service.generateAssistantReply(buildPayload('AIの理解：これは漏洩です') as any);
  assert.equal(reply.publicActivityDraft?.shortDescription?.includes('AIの理解'), false);
  assert.equal(reply.publicActivityDraft?.signupNotes?.includes('AIの理解'), false);
});

test('TC-12) prep checklist is generated without contamination when ready', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: {
        title: '映画会',
        time: '2026/01/23 19:00',
        location: '新宿TOHOシネマズ',
        price: '無料',
        capacity: '80',
      },
      missing: [],
      confidence: {},
      language: 'ja',
      firstReplyKey: 'ASK_NONE',
    }),
  });
  const reply = await service.generateAssistantReply(buildPayload('映画会準備') as any);
  const prep = reply.internalExecutionPlan?.prepChecklist ?? [];
  assert.ok(prep.length > 0);
  prep.forEach((line) => {
    assert.ok(!line.includes('AIの理解'));
    assert.ok(!line.includes('Assistant Prompt'));
  });
});

test('TC-13) constitution text never leaks to output', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => ({
      intent: 'EVENT_INFO',
      slots: { title: 'AIの理解：これは漏洩です', time: '1/23 17:00-19:00', location: '渋谷', price: '無料' },
      missing: [],
      confidence: {},
      language: 'ja',
      firstReplyKey: 'ASK_NONE',
    }),
  });
  const reply = await service.generateAssistantReply(buildPayload('AIの理解：これは漏洩です') as any);
  const markers = ['SOCIALMORE AI 憲章', 'AIの理解：', 'AI Constitution', '使命（第0条）', 'Coach Mode', 'Editor Mode'];
  const collectTexts = (): string[] => {
    const texts: string[] = [];
    const push = (v?: string | null) => {
      if (typeof v === 'string') texts.push(v);
    };
    push(reply.message);
    push(reply.ui?.message);
    push(reply.ui?.question?.text);
    push(reply.choiceQuestion?.prompt);
    reply.choiceQuestion?.options?.forEach((opt) => {
      push(opt.label);
      push(opt.value);
    });
    const collect = (obj: any) => {
      if (!obj) return;
      if (typeof obj === 'string') texts.push(obj);
      else if (Array.isArray(obj)) obj.forEach(collect);
      else if (obj && typeof obj === 'object') Object.values(obj).forEach(collect);
    };
    collect(reply.publicActivityDraft);
    collect(reply.internalExecutionPlan?.prepChecklist);
    return texts;
  };
  const hasLeak = collectTexts().some((t) => markers.some((m) => t.includes(m)));
  assert.equal(hasLeak, false);
});

// Fuzz regression c32871ec
test('Fuzz regression c32871ec', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: 'ja' }),
    initialParse: () => buildDefaultInitialParse('ja'),
  });
  const seq = [
  "平日夜19:00-21:00、1000円"
];
  const conversationId = 'fuzz-reg-c32871ec';
  const conversation: Array<{ role: 'user'; content: string }> = [];
  for (let t = 0; t < seq.length; t += 1) {
    const text = seq[t];
    conversation.push({ role: 'user', content: text });
    const reply = await service.generateAssistantReply({
      baseLanguage: 'ja',
      topic: '',
      audience: '',
      style: '',
      details: 'regression',
      conversation,
      uiMode: 'collecting',
      requestId: `reg-c32871ec-${t}`,
      conversationId,
    } as any);
    const failureCount = Array.isArray((reply as any).quality?.failureTypes)
      ? (reply as any).quality.failureTypes.length
      : 0;
    assert.equal(Boolean(reply.ui?.question?.text) && Boolean(reply.choiceQuestion), false);
    assert.equal(failureCount, 0);
    if (reply.draftReady) {
      assert.equal(Boolean(reply.ui?.question), false);
      if (reply.choiceQuestion) {
        assert.equal(reply.choiceQuestion.key ?? 'ready_next_action', 'ready_next_action');
      }
    }
  }
});
