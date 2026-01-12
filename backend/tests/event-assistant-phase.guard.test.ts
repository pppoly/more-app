import test from 'node:test';
import assert from 'node:assert/strict';
import { determinePromptPhase, enforcePhaseOutput } from '../src/ai/assistant-phase.guard';
import { getEventAssistantPromptConfig } from '../src/ai/prompt.config';

test('determinePromptPhase follows compare > operate > ready > decision > collecting order', () => {
  assert.equal(
    determinePromptPhase({ inputMode: 'compare', confirmDraft: false, draftReady: false, hasDecisionChoice: false }),
    'compare',
  );
  assert.equal(
    determinePromptPhase({ inputMode: 'fill', confirmDraft: true, draftReady: true, hasDecisionChoice: true }),
    'operate',
  );
  assert.equal(
    determinePromptPhase({ inputMode: 'fill', confirmDraft: false, draftReady: true, hasDecisionChoice: false }),
    'ready',
  );
  assert.equal(
    determinePromptPhase({ inputMode: 'fill', confirmDraft: false, draftReady: false, hasDecisionChoice: true }),
    'decision',
  );
  assert.equal(
    determinePromptPhase({ inputMode: 'describe', confirmDraft: false, draftReady: false, hasDecisionChoice: false }),
    'collecting',
  );
});

test('phase guard removes forbidden fields in collecting', () => {
  const policy = getEventAssistantPromptConfig('collecting');
  const payload = {
    state: 'collecting',
    language: 'ja',
    thinkingSteps: ['a', 'b'],
    coachPrompt: 'x',
    writerSummary: 'y',
    ui: { question: { key: 'title', text: 'タイトルは？' } },
    questions: ['q1'],
    options: [{ title: 'o1' }],
    publicActivityDraft: { title: 't' },
    internalExecutionPlan: { objective: 'o' },
  };
  const result = enforcePhaseOutput(payload, 'collecting', policy);
  assert.ok('ui' in result.cleaned);
  assert.ok(!('questions' in result.cleaned));
  assert.ok(!('options' in result.cleaned));
  assert.ok(!('publicActivityDraft' in result.cleaned));
  assert.ok(!('internalExecutionPlan' in result.cleaned));
});

test('phase guard keeps draft but removes questions in ready', () => {
  const policy = getEventAssistantPromptConfig('ready');
  const payload = {
    state: 'ready',
    language: 'ja',
    thinkingSteps: ['a', 'b'],
    ui: { message: 'ok' },
    publicActivityDraft: { title: 't' },
    internalExecutionPlan: { objective: 'o' },
    questions: ['q1'],
    options: [{ title: 'o1' }],
  };
  const result = enforcePhaseOutput(payload, 'ready', policy);
  assert.ok('publicActivityDraft' in result.cleaned);
  assert.ok('internalExecutionPlan' in result.cleaned);
  assert.ok(!('questions' in result.cleaned));
  assert.ok(!('options' in result.cleaned));
});

test('phase guard removes draft fields in decision', () => {
  const policy = getEventAssistantPromptConfig('decision');
  const payload = {
    state: 'collecting',
    language: 'ja',
    thinkingSteps: ['a', 'b'],
    ui: { question: { key: 'title', text: 'タイトルは？' } },
    publicActivityDraft: { title: 't' },
    internalExecutionPlan: { objective: 'o' },
  };
  const result = enforcePhaseOutput(payload, 'decision', policy);
  assert.ok(!('publicActivityDraft' in result.cleaned));
  assert.ok(!('internalExecutionPlan' in result.cleaned));
});

test('phase guard removes draft fields in compare', () => {
  const policy = getEventAssistantPromptConfig('compare');
  const payload = {
    state: 'collecting',
    language: 'ja',
    thinkingSteps: ['a', 'b'],
    ui: { message: 'ok', options: [{ label: 'A', value: 'A' }] },
    publicActivityDraft: { title: 't' },
    internalExecutionPlan: { objective: 'o' },
  };
  const result = enforcePhaseOutput(payload, 'compare', policy);
  assert.ok(!('publicActivityDraft' in result.cleaned));
  assert.ok(!('internalExecutionPlan' in result.cleaned));
});
