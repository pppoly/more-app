import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAssistantOutput } from '../src/ai/event-assistant.schemas';

test('collecting schema rejects draft and unknown fields', () => {
  const result = validateAssistantOutput('collecting', {
    ui: { question: { key: 'title', text: 'x' } },
    thinkingSteps: ['a', 'b'],
    publicActivityDraft: { title: 't' },
    unknownKey: 'x',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('unknown_field')));
});

test('ready schema requires draft fields', () => {
  const missingDraft = validateAssistantOutput('ready', {
    writerSummary: 'ok',
  });
  assert.equal(missingDraft.valid, false);
  assert.ok(missingDraft.errors.some((e) => e.includes('missing_required')));

  const okDraft = validateAssistantOutput('ready', {
    ui: { message: 'ok' },
    publicActivityDraft: {},
    internalExecutionPlan: {},
  });
  assert.equal(okDraft.valid, true);
});
