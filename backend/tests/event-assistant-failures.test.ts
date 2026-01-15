import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFailures } from '../src/ai/diagnostics/failures';

test('repeat question should reset on conversation reset', () => {
  const result = analyzeFailures({
    userText: '周末一起去happy',
    previousAskedKey: 'title',
    conversationReset: true,
    promptPhase: 'collect',
    uiPhase: 'collecting',
    missingKeys: ['title'],
    candidateKeys: ['title'],
    confirmedKeys: [],
    nextQuestionKey: 'title',
    draftReady: false,
    uiMode: 'normal',
    uiAction: null,
    hasChoiceQuestion: false,
    uiQuestionText: 'イベントのタイトルを教えてください。',
    choiceQuestionKey: null,
    parser: {
      timeOk: false,
      priceOk: false,
      timeReason: 'not_attempted',
      priceReason: 'no_amount',
    },
    draftSummary: {
      title: null,
      startTime: null,
      location: null,
      price: null,
    },
  });
  assert.equal(result.failureTypes.includes('REPEAT_QUESTION'), false);
});

test('interrupt choice does not trigger next question missing', () => {
  const result = analyzeFailures({
    userText: '到底怎么了',
    previousAskedKey: null,
    conversationReset: false,
    promptPhase: 'collect',
    uiPhase: 'collecting',
    missingKeys: ['title', 'location'],
    candidateKeys: [],
    confirmedKeys: ['price'],
    nextQuestionKey: null,
    draftReady: false,
    uiMode: 'normal',
    uiAction: null,
    hasChoiceQuestion: true,
    uiQuestionText: null,
    choiceQuestionKey: 'interrupt',
    parser: {
      timeOk: false,
      priceOk: false,
      timeReason: 'not_attempted',
      priceReason: 'no_amount',
    },
    draftSummary: {
      title: null,
      startTime: null,
      location: null,
      price: null,
    },
  });
  assert.equal(result.failureTypes.includes('NEXT_QUESTION_MISSING'), false);
});
