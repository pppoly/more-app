import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { redactText } from './redact';
import type { EventAssistantDailySummary, EventAssistantEnv, EventAssistantTurnLog, FailureType } from './types';

const resolveEnv = (): EventAssistantEnv => {
  const env = (process.env.APP_ENV || process.env.NODE_ENV || 'dev').toLowerCase();
  if (env.startsWith('prod')) return 'prod';
  if (env.startsWith('stg') || env.startsWith('stage')) return 'stg';
  return 'dev';
};

const findBackendRoot = () => {
  let current = __dirname;
  for (let i = 0; i < 6; i += 1) {
    const pkgPath = path.join(current, 'package.json');
    if (fsSync.existsSync(pkgPath)) {
      try {
        const raw = fsSync.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(raw) as { name?: string };
        if (pkg.name === 'more-app-backend') return current;
      } catch {
        // ignore parse errors
      }
    }
    current = path.dirname(current);
  }
  return null;
};

export const resolveLogDir = () => {
  const base = process.env.EVENT_ASSISTANT_LOG_DIR;
  if (base && base.trim()) return base.trim();
  const backendRoot = findBackendRoot();
  if (backendRoot) {
    return path.join(backendRoot, '.logs/event-assistant');
  }
  if (resolveEnv() === 'prod') return '/data/logs/event-assistant';
  return path.resolve(process.cwd(), '.logs/event-assistant');
};

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const getLogPaths = (day: string) => {
  const dir = resolveLogDir();
  return {
    dir,
    jsonl: path.join(dir, `event-assistant-${day}.jsonl`),
    summary: path.join(dir, `event-assistant-${day}.summary.json`),
  };
};

  const defaultSummary = (day: string, env: EventAssistantEnv): EventAssistantDailySummary => ({
  day,
  env,
  totalTurns: 0,
  failureTypeCounts: {},
  topMissingKeys: {},
  topNextQuestionKeys: {},
  topParserFailures: { time: 0, price: 0 },
  topExamples: {
    STRICT_WORKER_COLLECT_FALLBACK: [],
    SAID_BUT_MISSING: [],
    REPEAT_QUESTION: [],
    PARSE_FAILED: [],
    STAGE_MISMATCH: [],
    ACTION_NO_EFFECT: [],
    DRAFT_INCONSISTENT: [],
    NON_EVENT_INPUT: [],
    NEXT_QUESTION_MISSING: [],
    DUAL_ACTION: [],
    TITLE_NOT_COMMITTED: [],
    CONFIRM_WHILE_MISSING: [],
    CHOICE_RESET_STATE: [],
    READY_REGRESSION: [],
    DRAFT_TEXT_CONTAMINATED: [],
    CONSTITUTION_LEAK: [],
  },
});

const incrementCount = (map: Record<string, number>, key: string | null | undefined) => {
  if (!key) return;
  map[key] = (map[key] ?? 0) + 1;
};

const appendExample = (
  summary: EventAssistantDailySummary,
  failureType: FailureType,
  entry: EventAssistantTurnLog,
) => {
  if (!summary.topExamples[failureType]) {
    summary.topExamples[failureType] = [];
  }
  const list = summary.topExamples[failureType];
  if (list.length >= 5) return;
  list.push({
    userText: entry.input.userText,
    requestId: entry.requestId,
    conversationId: entry.conversationId,
    machine: {
      missingKeys: entry.machine.missingKeys,
      nextQuestionKey: entry.machine.nextQuestionKey,
      promptPhase: entry.machine.promptPhase,
    },
  });
};

const updateSummary = async (entry: EventAssistantTurnLog) => {
  const day = entry.day;
  const { summary } = getLogPaths(day);
  let current = defaultSummary(day, entry.env);
  try {
    const raw = await fs.readFile(summary, 'utf-8');
    current = JSON.parse(raw) as EventAssistantDailySummary;
  } catch {
    // ignore missing summary
  }
  current.totalTurns += 1;
  entry.machine.missingKeys.forEach((key) => incrementCount(current.topMissingKeys, key));
  incrementCount(current.topNextQuestionKeys, entry.machine.nextQuestionKey ?? undefined);
  if (!entry.parser.time.ok) current.topParserFailures.time += 1;
  if (!entry.parser.price.ok) current.topParserFailures.price += 1;
  entry.quality.failureTypes.forEach((type) => {
    incrementCount(current.failureTypeCounts, type);
    appendExample(current, type, entry);
  });
  await fs.writeFile(summary, JSON.stringify(current, null, 2), 'utf-8');
};

export const writeTurnLog = async (entry: EventAssistantTurnLog) => {
  const day = entry.day;
  const { dir, jsonl } = getLogPaths(day);
  await ensureDir(dir);
  await fs.appendFile(jsonl, `${JSON.stringify(entry)}\n`, 'utf-8');
  await updateSummary(entry);
};

export const redactTurnLog = (entry: EventAssistantTurnLog): EventAssistantTurnLog => {
  return {
    ...entry,
    input: {
      ...entry.input,
      userText: redactText(entry.input.userText),
    },
    parser: {
      time: {
        ...entry.parser.time,
        rawText: entry.parser.time.rawText ? redactText(entry.parser.time.rawText) : null,
      },
      price: {
        ...entry.parser.price,
        rawText: entry.parser.price.rawText ? redactText(entry.parser.price.rawText) : null,
      },
    },
    output: {
      ...entry.output,
      assistantMessageText: redactText(entry.output.assistantMessageText),
      uiQuestionText: entry.output.uiQuestionText ? redactText(entry.output.uiQuestionText) : null,
    },
  };
};
