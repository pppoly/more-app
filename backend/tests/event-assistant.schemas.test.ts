import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAssistantOutput } from '../src/ai/event-assistant.schemas';

test('collect schema rejects draft and unknown fields', () => {
  const result = validateAssistantOutput('collect', {
    ui: { question: { key: 'title', text: 'x' } },
    thinkingSteps: ['a', 'b'],
    publicActivityDraft: { title: 't' },
    unknownKey: 'x',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('unknown_field')));
});

test('collect schema allows message without question', () => {
  const result = validateAssistantOutput('collect', {
    ui: { message: '了解しました。' },
  });
  assert.equal(result.valid, true);
});

test('ready schema requires draft fields', () => {
  const missingDraft = validateAssistantOutput('ready', {
    writerSummary: 'ok',
  });
  assert.equal(missingDraft.valid, false);
  assert.ok(missingDraft.errors.some((e) => e.includes('missing_required')));

  const okDraft = validateAssistantOutput('ready', {
    ui: { message: 'ok' },
    publicActivityDraft: {
      title: 't',
      shortDescription: 's',
      detailedDescription: 'd',
      schedule: { date: '2025-01-01', startTime: '10:00', endTime: '11:00', location: 'tokyo' },
      price: '無料',
      capacity: null,
      signupNotes: null,
    },
    internalExecutionPlan: {},
  });
  assert.equal(okDraft.valid, true);
});
