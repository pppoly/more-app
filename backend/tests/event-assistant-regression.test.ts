import test from 'node:test';
import assert from 'node:assert/strict';
import { enforcePhaseOutput, determinePromptPhase } from '../src/ai/assistant-phase.guard';
import { getEventAssistantPromptConfig } from '../src/ai/prompt.config';
import { getEventAssistantOutputSchema, validateAssistantOutput } from '../src/ai/event-assistant.schemas';

test('decision schema forbids ui.question/options', () => {
  const schema = getEventAssistantOutputSchema('decision').schema;
  const uiSchema = schema.properties?.ui;
  const uiProps = (uiSchema?.properties ?? {}) as Record<string, unknown>;
  assert.ok(Object.keys(uiProps).length > 0);
  assert.equal('question' in uiProps, false);
  assert.equal('options' in uiProps, false);
});

test('compare schema forbids ui.options', () => {
  const schema = getEventAssistantOutputSchema('compare').schema;
  const uiSchema = schema.properties?.ui;
  const uiProps = (uiSchema?.properties ?? {}) as Record<string, unknown>;
  assert.ok(Object.keys(uiProps).length > 0);
  assert.equal('options' in uiProps, false);
});

test('collecting/compare drop draft fields', () => {
  const collectingPolicy = getEventAssistantPromptConfig('collecting');
  const collectingPayload = {
    ui: { question: { key: 'title', text: 'x' } },
    publicActivityDraft: { title: 't' },
    internalExecutionPlan: { objective: 'o' },
  };
  const collectingResult = enforcePhaseOutput(collectingPayload, 'collecting', collectingPolicy);
  assert.ok(!('publicActivityDraft' in collectingResult.cleaned));
  assert.ok(!('internalExecutionPlan' in collectingResult.cleaned));

  const comparePolicy = getEventAssistantPromptConfig('compare');
  const comparePayload = {
    ui: { message: 'ok', options: [{ label: 'A', value: 'A' }] },
    publicActivityDraft: { title: 't' },
    internalExecutionPlan: { objective: 'o' },
  };
  const compareResult = enforcePhaseOutput(comparePayload, 'compare', comparePolicy);
  assert.ok(!('publicActivityDraft' in compareResult.cleaned));
  assert.ok(!('internalExecutionPlan' in compareResult.cleaned));
});

test('ready/operate require draft and remove questions/options', () => {
  const readyMissing = validateAssistantOutput('ready', { ui: { message: 'ok' } });
  assert.equal(readyMissing.valid, false);
  const operateMissing = validateAssistantOutput('operate', { ui: { message: 'ok' } });
  assert.equal(operateMissing.valid, false);

  const readyPolicy = getEventAssistantPromptConfig('ready');
  const readyPayload = {
    ui: { message: 'ok' },
    publicActivityDraft: {},
    internalExecutionPlan: {},
    questions: ['q1'],
    options: [{ title: 'o1' }],
  };
  const readyResult = enforcePhaseOutput(readyPayload, 'ready', readyPolicy);
  assert.ok('publicActivityDraft' in readyResult.cleaned);
  assert.ok('internalExecutionPlan' in readyResult.cleaned);
  assert.ok(!('questions' in readyResult.cleaned));
  assert.ok(!('options' in readyResult.cleaned));
});

test('machine fields from LLM are ignored by phase guard', () => {
  const policy = getEventAssistantPromptConfig('collecting');
  const payload = {
    ui: { question: { key: 'title', text: 'x' } },
    nextQuestionKey: 'title',
    choiceQuestion: { key: 'audience', prompt: 'x', options: [{ label: 'A', value: 'A' }] },
    compareCandidates: [{ id: 'A', summary: 'A' }],
    inputMode: 'compare',
    draftReady: true,
  };
  const result = enforcePhaseOutput(payload, 'collecting', policy);
  assert.ok(!('nextQuestionKey' in result.cleaned));
  assert.ok(!('choiceQuestion' in result.cleaned));
  assert.ok(!('compareCandidates' in result.cleaned));
  assert.ok(!('inputMode' in result.cleaned));
  assert.ok(!('draftReady' in result.cleaned));
});

test('determinePromptPhase covers all branches', () => {
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
