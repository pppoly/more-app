import fs from 'fs/promises';
import path from 'path';
import { resolveLogDir } from '../src/ai/diagnostics/logger';

const logDir = resolveLogDir();
const day = new Date().toISOString().slice(0, 10);
const summaryPath = path.join(logDir, `event-assistant-${day}.summary.json`);

const readSummary = async () => {
  try {
    const raw = await fs.readFile(summaryPath, 'utf-8');
    return JSON.parse(raw) as {
    totalTurns: number;
    failureTypeCounts: Record<string, number>;
    topMissingKeys: Record<string, number>;
    topNextQuestionKeys: Record<string, number>;
    topParserFailures: { time: number; price: number };
    topExamples: Record<string, Array<{ userText: string }>>;
    };
  } catch {
    return {
      totalTurns: 0,
      failureTypeCounts: {},
      topMissingKeys: {},
      topNextQuestionKeys: {},
      topParserFailures: { time: 0, price: 0 },
      topExamples: {},
    };
  }
};

const topKeys = (map: Record<string, number>, limit = 5) =>
  Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));

const buildPrompt = (summary: Awaited<ReturnType<typeof readSummary>>) => {
  const topFailures = topKeys(summary.failureTypeCounts, 5)
    .map((item) => `- ${item.key}: ${item.count}`)
    .join('\n');
  const topMissing = topKeys(summary.topMissingKeys, 5)
    .map((item) => `- ${item.key}: ${item.count}`)
    .join('\n');
  const topNext = topKeys(summary.topNextQuestionKeys, 5)
    .map((item) => `- ${item.key}: ${item.count}`)
    .join('\n');
  return [
    'Event Assistant Daily Diagnostics',
    '',
    'Top Failures:',
    topFailures || '- none',
    '',
    'Top Missing Keys:',
    topMissing || '- none',
    '',
    'Top NextQuestionKey:',
    topNext || '- none',
    '',
    'Parser Failures:',
    `- time: ${summary.topParserFailures.time}`,
    `- price: ${summary.topParserFailures.price}`,
  ].join('\n');
};

const run = async () => {
  const summary = await readSummary();
  if (summary.totalTurns === 0) {
    console.info('No summary for today yet:', summaryPath);
    return;
  }
  console.info('Total Turns:', summary.totalTurns);
  console.info('Top 5 failures:', topKeys(summary.failureTypeCounts));
  console.info('Top 5 parser misses:', summary.topParserFailures);
  console.info('Top 5 repeat questions:', topKeys(summary.topNextQuestionKeys));
  const prompt = buildPrompt(summary);
  const outputPath = path.join(logDir, `event-assistant-${day}.optimize-prompt.txt`);
  await fs.writeFile(outputPath, prompt, 'utf-8');
  console.info('Wrote optimize prompt:', outputPath);
};

run().catch((err) => {
  console.error('[daily-report] failed', err);
  process.exit(1);
});
