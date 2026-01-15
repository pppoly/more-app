import test from 'node:test';
import assert from 'node:assert/strict';
import { determineUiPhase, enforcePhaseOutput } from '../src/ai/assistant-phase.guard';
import { getEventAssistantPromptConfig } from '../src/ai/prompt.config';

test('determineUiPhase follows compare > operate > ready > decision > collecting order', () => {
  assert.equal(
    determineUiPhase({ inputMode: 'compare', confirmDraft: false, draftReady: false, hasDecisionChoice: false }),
    'compare',
  );
  assert.equal(
    determineUiPhase({ inputMode: 'fill', confirmDraft: true, draftReady: true, hasDecisionChoice: true }),
    'operate',
  );
  assert.equal(
    determineUiPhase({ inputMode: 'fill', confirmDraft: false, draftReady: true, hasDecisionChoice: false }),
    'ready',
  );
  assert.equal(
    determineUiPhase({ inputMode: 'fill', confirmDraft: false, draftReady: false, hasDecisionChoice: true }),
    'decision',
  );
  assert.equal(
    determineUiPhase({ inputMode: 'describe', confirmDraft: false, draftReady: false, hasDecisionChoice: false }),
    'collecting',
  );
});

test('phase guard removes forbidden fields in collect', () => {
  const policy = getEventAssistantPromptConfig('collect');
  const payload = {
    state: 'collecting',
    language: 'ja',
    inputMode: 'describe',
    nextQuestionKey: 'title',
    thinkingSteps: ['a', 'b'],
    coachPrompt: 'x',
    writerSummary: 'y',
    ui: { question: { key: 'title', text: 'タイトルは？' } },
    questions: ['q1'],
    options: [{ title: 'o1' }],
    publicActivityDraft: { title: 't' },
    internalExecutionPlan: { objective: 'o' },
  };
  const result = enforcePhaseOutput(payload, 'collect', policy);
  assert.ok('ui' in result.cleaned);
  assert.ok('state' in result.cleaned);
  assert.ok('language' in result.cleaned);
  assert.ok('inputMode' in result.cleaned);
  assert.ok('nextQuestionKey' in result.cleaned);
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
