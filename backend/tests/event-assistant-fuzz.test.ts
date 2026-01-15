import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AiService } from '../src/ai/ai.service';

process.env.EVENT_ASSISTANT_DEBUG = '0';
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
        const isRouter = schemaName === 'assistant_router';
        const isInitialParse = schemaName === 'initial_event_parse' || ('userText' in payload && !isRouter);
        const isNormalizer = schemaName === 'EventAssistantSlotNormalizer' || 'rawUserText' in payload;
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
          content = this.handlers.titleSuggestions?.() ?? { titles: ['タイトル案A', 'タイトル案B'] };
        } else if (isMain) {
          content =
            this.handlers.main?.() ?? {
              ui: { question: { key: 'title', text: 'イベントのタイトルを教えてください。' } },
            };
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

// Simple deterministic LCG for reproducible fuzzing
const makeRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const pick = <T>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];

const sentences = {
  time: [
    '下周二下午三点到五点',
    '来週金曜15:00-17:00',
    '1/23 17:00-19:00',
    '週末の夜19-21時',
    '周末下午三点到五点',
    '平日夜19:00-21:00',
  ],
  location: ['三鷹', '井の頭公園', '渋谷', '新宿TOHOシネマズ'],
  price: ['2000円/人', '無料', 'ワンドリンク制', '1000円', 'AA制', '4000元'],
  title: ['BBQ', '交流会', 'Language Exchange', '映画観賞会', '週末一起去happy'],
  noise: ['未定', '任せる', '我不知道', '随便聊聊', '？？？', '我不玩了', 'やめたい'],
  choice: [
    '【選択】confirm_location:yes',
    '【選択】confirm_location:no',
    '【選択】confirm_currency:confirm_jpy_1000',
    '【選択】confirm_currency:confirm_cny',
    '【選択】interrupt:continue',
    '【選択】interrupt:skip',
    '【選択】interrupt:manual',
  ],
  multiline: [
    ['タイトル: BBQ', '日時: 1/23 17:00-19:00', '場所: 渋谷', '参加費: 無料'].join('\n'),
    ['标题: 电影观赏会', '时间: 下周五 15:00-17:00', '地点: 三鹰', '费用: 2000円/人'].join('\n'),
  ],
};

const buildSentence = (rng: () => number) => {
  // Chance to emit a pure choice turn
  if (rng() < 0.1) return pick(rng, sentences.choice);
  // Chance to emit a multiline block
  if (rng() < 0.1) return pick(rng, sentences.multiline);
  const parts = [];
  if (rng() > 0.2) parts.push(pick(rng, sentences.time));
  if (rng() > 0.2) parts.push(pick(rng, sentences.location));
  if (rng() > 0.2) parts.push(pick(rng, sentences.price));
  if (rng() > 0.4) parts.unshift(pick(rng, sentences.title));
  if (parts.length === 0) parts.push(pick(rng, sentences.noise));
  return parts.join('、');
};

const runSequence = async (
  service: AiService,
  seq: string[],
  conversationId: string,
  baseLanguage: 'ja' | 'zh' | 'en',
) => {
  const conversation: Array<{ role: 'user'; content: string }> = [];
  let lastReply: any = null;
  for (let t = 0; t < seq.length; t += 1) {
    const text = seq[t];
    conversation.push({ role: 'user', content: text });
    lastReply = await service.generateAssistantReply({
      baseLanguage,
      topic: '',
      audience: '',
      style: '',
      details: 'fuzz',
      conversation,
      uiMode: 'collecting',
      requestId: `req-${conversationId}-${t}`,
      conversationId,
    } as any);
    const failureCount = Array.isArray(lastReply.quality?.failureTypes)
      ? lastReply.quality.failureTypes.length
      : 0;
    const dual = Boolean(lastReply.ui?.question?.text) && Boolean(lastReply.choiceQuestion);
    const hasConstitutionLeak = (() => {
      const markers = ['SOCIALMORE AI 憲章', 'AIの理解：', 'AI Constitution', '--- Assistant Prompt ---'];
      const texts: string[] = [];
      const push = (v?: string | null) => {
        if (typeof v === 'string') texts.push(v);
      };
      push(lastReply.message);
      push(lastReply.ui?.message);
      push(lastReply.ui?.question?.text);
      push(lastReply.choiceQuestion?.prompt);
      lastReply.choiceQuestion?.options?.forEach((opt: any) => {
        push(opt.label);
        push(opt.value);
      });
      const collect = (obj: any) => {
        if (!obj) return;
        if (typeof obj === 'string') texts.push(obj);
        if (Array.isArray(obj)) obj.forEach(collect);
        else if (obj && typeof obj === 'object') Object.values(obj).forEach(collect);
      };
      collect(lastReply.publicActivityDraft);
      collect(lastReply.internalExecutionPlan?.prepChecklist);
      return texts.some((t) => markers.some((m) => t.includes(m)));
    })();
    const readyChoiceInvalid =
      lastReply.draftReady &&
      (lastReply.ui?.question || (lastReply.choiceQuestion && lastReply.choiceQuestion.key !== 'ready_next_action'));
    if (dual || failureCount > 0 || hasConstitutionLeak || readyChoiceInvalid) {
      const err = new Error(`fuzz failure at turn ${t}`);
      (err as any).detail = { dual, failureCount, hasConstitutionLeak, reply: lastReply };
      throw err;
    }
  }
  return lastReply;
};

const deltaMinimize = async (
  service: AiService,
  seq: string[],
  baseLanguage: 'ja' | 'zh' | 'en',
) => {
  let best = [...seq];
  let improved = true;
  while (best.length > 1 && improved) {
    improved = false;
    for (let i = 0; i < best.length; i += 1) {
      const candidate = best.slice(0, i).concat(best.slice(i + 1));
      try {
        await runSequence(service, candidate, `delta`, baseLanguage);
        // success -> failure resolved, so cannot remove
      } catch {
        best = candidate;
        improved = true;
        break;
      }
    }
  }
  return best;
};

const appendRegressionTest = (seq: string[], baseLanguage: 'ja' | 'zh' | 'en') => {
  const hash = crypto.createHash('sha256').update(JSON.stringify({ baseLanguage, seq })).digest('hex').slice(0, 8);
  const regressionPath = path.join(__dirname, 'event-assistant-regression.test.ts');
  const content = fs.readFileSync(regressionPath, 'utf-8');
  if (content.includes(`Fuzz regression ${hash}`)) return;
  const testCode = `
// Fuzz regression ${hash}
test('Fuzz regression ${hash}', async () => {
  const service = createService({
    router: () => ({ route: 'EVENT_INFO', confidence: 0.9, language: '${baseLanguage}' }),
    initialParse: () => buildDefaultInitialParse('${baseLanguage}'),
  });
  const seq = ${JSON.stringify(seq, null, 2)};
  const conversationId = 'fuzz-reg-${hash}';
  const conversation: Array<{ role: 'user'; content: string }> = [];
  for (let t = 0; t < seq.length; t += 1) {
    const text = seq[t];
    conversation.push({ role: 'user', content: text });
    const reply = await service.generateAssistantReply({
      baseLanguage: '${baseLanguage}',
      topic: '',
      audience: '',
      style: '',
      details: 'regression',
      conversation,
      uiMode: 'collecting',
      requestId: \`reg-${hash}-\${t}\`,
      conversationId,
    } as any);
    const failureCount = Array.isArray(reply.quality?.failureTypes) ? reply.quality.failureTypes.length : 0;
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
`;
  fs.appendFileSync(regressionPath, testCode);
};

test('Fuzz 500 sequences should not hit invariants or regress', async (t) => {
  const seed = Number(process.env.SEED ?? 42);
  const rng = makeRng(seed);
  const service = createService({
    router: (text) => {
      const hasZh = /[\u4e00-\u9fa5]/.test(text);
      const hasEn = /[a-zA-Z]/.test(text) && !hasZh;
      const language: 'ja' | 'zh' | 'en' = hasZh ? 'zh' : hasEn ? 'en' : 'ja';
      return { route: 'EVENT_INFO', confidence: 0.9, language };
    },
    initialParse: () => buildDefaultInitialParse('ja'),
  });

  for (let i = 0; i < 500; i += 1) {
    const turns = 2 + Math.floor(rng() * 6);
    const conversationId = `fuzz-${i}`;
    const seq: string[] = [];
    for (let t = 0; t < turns; t += 1) seq.push(buildSentence(rng));
    const baseLanguage: 'ja' | 'zh' | 'en' = rng() < 0.3 ? 'zh' : rng() < 0.6 ? 'ja' : 'en';
    try {
      await runSequence(service, seq, conversationId, baseLanguage);
    } catch (err: any) {
      // delta minimize and persist failing case for regression
      const minimized = await deltaMinimize(service, seq, baseLanguage);
      const logPath = path.join(__dirname, 'event-assistant-regression.fuzz.log');
      const record = {
        seed,
        language: baseLanguage,
        original: seq,
        minimized,
      };
      fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
      appendRegressionTest(minimized, baseLanguage);
      console.error(`Fuzz failure recorded to ${logPath}`);
      throw err;
    }
  }
  t.diagnostic('Fuzz done without failures');
});
