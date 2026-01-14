import fs from 'fs/promises';
import path from 'path';
import { resolveLogDir } from '../src/ai/diagnostics/logger';

type TurnLog = {
  ts: string;
  input?: {
    userText?: string;
    locale?: string;
    timezone?: string;
  };
  machine?: {
    missingKeys?: string[];
    nextQuestionKey?: string | null;
  };
  output?: {
    choiceQuestion?: Record<string, unknown> | null;
  };
  quality?: {
    failureTypes?: string[];
  };
};

const TIME_HINT_REGEX =
  /下周|下星期|下週|今週|来週|週末|平日夜|土曜|日曜|金曜|月曜|火曜|水曜|木曜|上午|下午|中午|晚上|\d{1,2}[:：]\d{2}/i;
const PRICE_HINT_REGEX = /(円|元|無料|フリー|free|¥|\d{2,5}\s*(円|元))/i;

const sanitizeParserInput = (text: string) => {
  if (!text) return { text: '', source: 'rejected' as const };
  const trimmed = text.trim();
  const forbiddenMarkers = [
    'AIの理解：',
    '--- Assistant Prompt ---',
    'SOCIALMORE AI 憲章',
    '--- Conversation ---',
    'You are the SOCIALMORE',
    'Current stage:',
  ];
  if (forbiddenMarkers.some((marker) => trimmed.includes(marker))) {
    return { text: '', source: 'rejected' as const };
  }
  const lineCount = trimmed.split('\n').length;
  if (lineCount >= 3) {
    return { text: '', source: 'rejected' as const };
  }
  if (trimmed.length > 240) {
    return { text: '', source: 'rejected' as const };
  }
  const collapsed = trimmed.replace(/\s+/g, ' ').trim();
  const limited = collapsed.slice(0, 240).trim();
  if (!limited) return { text: '', source: 'rejected' as const };
  return { text: limited, source: 'userText' as const };
};

const parseZhNumber = (input: string) => {
  if (!input) return null;
  if (/^\d+$/.test(input)) return Number(input);
  const map: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  if (input.length === 1) return map[input] ?? null;
  if (input.length === 2 && input.startsWith('十')) return 10 + (map[input[1]] ?? 0);
  if (input.length === 2 && input.endsWith('十')) return (map[input[0]] ?? 0) * 10;
  if (input.length === 3 && input[1] === '十') return (map[input[0]] ?? 0) * 10 + (map[input[2]] ?? 0);
  return null;
};

const parseZhRelativeRange = (text: string, now: Date) => {
  if (!text) return null;
  const weekdayMatch = text.match(/下周|下星期/);
  const dayMatch = text.match(/(?:下周|下星期)?\s*([一二三四五六日天])/);
  if (!weekdayMatch || !dayMatch) return null;
  const dayToken = dayMatch[1];
  const weekdayMap: Record<string, number> = {
    日: 0,
    天: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
  };
  const weekday = weekdayMap[dayToken];
  const baseWeekday = now.getDay();
  const mondayOffset = baseWeekday === 0 ? -6 : 1 - baseWeekday;
  const nextWeekMonday = new Date(now);
  nextWeekMonday.setDate(now.getDate() + mondayOffset + 7);
  const target = new Date(nextWeekMonday);
  const weekdayOffset = weekday === 0 ? 6 : weekday - 1;
  target.setDate(nextWeekMonday.getDate() + weekdayOffset);
  const rangeMatch = text.match(
    /(上午|下午|中午|晚上)?\s*([一二三四五六七八九十\d]{1,3})点(半)?\s*(到|〜|~|-|－)\s*(上午|下午|中午|晚上)?\s*([一二三四五六七八九十\d]{1,3})点(半)?/,
  );
  if (!rangeMatch) return null;
  const startPeriod = rangeMatch[1] ?? rangeMatch[5] ?? '';
  const endPeriod = rangeMatch[5] ?? startPeriod;
  const startNum = parseZhNumber(rangeMatch[2]);
  const endNum = parseZhNumber(rangeMatch[6]);
  if (!startNum || !endNum) return null;
  const startMinute = rangeMatch[3] === '半' ? 30 : 0;
  const endMinute = rangeMatch[7] === '半' ? 30 : 0;
  const normalizeHour = (hour: number, period: string) => {
    if (/下午|晚上/.test(period) && hour < 12) return hour + 12;
    if (/中午/.test(period) && hour < 12) return hour + 12;
    return hour;
  };
  const start = new Date(target);
  start.setHours(normalizeHour(startNum, startPeriod), startMinute, 0, 0);
  const end = new Date(target);
  end.setHours(normalizeHour(endNum, endPeriod), endMinute, 0, 0);
  return { start, end };
};

const evaluateTurn = (entry: TurnLog) => {
  const userText = entry.input?.userText ?? '';
  const timeInput = sanitizeParserInput(userText);
  const priceInput = sanitizeParserInput(userText);
  const hasTimeSignal = TIME_HINT_REGEX.test(timeInput.text);
  const hasPriceSignal = PRICE_HINT_REGEX.test(priceInput.text);
  const now = entry.ts ? new Date(entry.ts) : new Date();
  const zhRange = parseZhRelativeRange(timeInput.text, now);
  const timeOk = Boolean(zhRange) || /\d{1,2}[:：]\d{2}\s*[-〜~]\s*\d{1,2}[:：]\d{2}/.test(timeInput.text);
  const priceAmountMatch = priceInput.text.match(/(\d{1,5})/);
  const priceAmount = priceAmountMatch ? Number(priceAmountMatch[1]) : null;
  const priceOk = Boolean(priceAmount || /無料|free/i.test(priceInput.text));

  const missingKeys = entry.machine?.missingKeys ?? [];
  const hasChoiceQuestion = Boolean(entry.output?.choiceQuestion);
  const nextQuestionKeyNullWithMissing =
    missingKeys.length > 0 && !hasChoiceQuestion && !entry.machine?.nextQuestionKey;
  return {
    hasTimeSignal,
    hasPriceSignal,
    timeOk: hasTimeSignal && timeOk,
    priceOk: hasPriceSignal && priceOk,
    nextQuestionKeyNullWithMissing,
  };
};

const run = async () => {
  const args = process.argv.slice(2);
  const dateArg = args.find((arg) => arg.startsWith('--date='))?.split('=')[1];
  const fileArg = args.find((arg) => arg.startsWith('--file='))?.split('=')[1];
  const day = dateArg || new Date().toISOString().slice(0, 10);
  const logDir = resolveLogDir();
  const jsonlPath = fileArg || path.join(logDir, `event-assistant-${day}.jsonl`);
  const raw = await fs.readFile(jsonlPath, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);
  let total = 0;
  let timeAttempts = 0;
  let timeOkCount = 0;
  let priceAttempts = 0;
  let priceOkCount = 0;
  let nextQuestionNull = 0;
  let saidButMissing = 0;
  let nonEventInput = 0;

  lines.forEach((line) => {
    const entry = JSON.parse(line) as TurnLog;
    total += 1;
    const evalResult = evaluateTurn(entry);
    if (evalResult.hasTimeSignal) {
      timeAttempts += 1;
      if (evalResult.timeOk) timeOkCount += 1;
    }
    if (evalResult.hasPriceSignal) {
      priceAttempts += 1;
      if (evalResult.priceOk) priceOkCount += 1;
    }
    if (evalResult.nextQuestionKeyNullWithMissing) nextQuestionNull += 1;
    if (entry.quality?.failureTypes?.includes('SAID_BUT_MISSING')) saidButMissing += 1;
    if (entry.quality?.failureTypes?.includes('NON_EVENT_INPUT')) nonEventInput += 1;
  });

  const evalReport = {
    day,
    totalTurns: total,
    parse: {
      time: {
        attempts: timeAttempts,
        ok: timeOkCount,
        rate: timeAttempts ? Number((timeOkCount / timeAttempts).toFixed(4)) : 0,
      },
      price: {
        attempts: priceAttempts,
        ok: priceOkCount,
        rate: priceAttempts ? Number((priceOkCount / priceAttempts).toFixed(4)) : 0,
      },
    },
    nextQuestionKeyNullWithMissing: nextQuestionNull,
    saidButMissing,
    nonEventInput,
  };
  const evalPath = path.join(logDir, `event-assistant-${day}.eval.json`);
  await fs.writeFile(evalPath, JSON.stringify(evalReport, null, 2), 'utf-8');
  console.info('Wrote eval report:', evalPath);
};

run().catch((err) => {
  console.error('[eval-event-assistant] failed', err);
  process.exit(1);
});
