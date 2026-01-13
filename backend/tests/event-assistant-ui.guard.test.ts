import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeShouldShowCommitCheckpoint,
  resolveChoiceQuestionState,
  shouldAppendQuestionBubble,
} from '../../frontend/src/utils/eventAssistantUiState';

test('commit checkpoint appears only when draftReady and not committed', () => {
  assert.equal(
    computeShouldShowCommitCheckpoint({
      mode: 'chat',
      draftReady: true,
      nextQuestionKey: null,
      isCommitted: false,
      hasChoiceQuestion: false,
      isCompareMode: false,
    }),
    true,
  );
  assert.equal(
    computeShouldShowCommitCheckpoint({
      mode: 'chat',
      draftReady: true,
      nextQuestionKey: null,
      isCommitted: true,
      hasChoiceQuestion: false,
      isCompareMode: false,
    }),
    false,
  );
  assert.equal(
    computeShouldShowCommitCheckpoint({
      mode: 'chat',
      draftReady: true,
      nextQuestionKey: 'title',
      isCommitted: false,
      hasChoiceQuestion: false,
      isCompareMode: false,
    }),
    false,
  );
});

test('choiceQuestion prefers machine options over ui.options', () => {
  const machineChoice = {
    key: 'audience',
    prompt: '誰向けにしますか？',
    options: [
      { label: 'A', value: 'A' },
      { label: 'B', value: 'B' },
    ],
  };
  const result = resolveChoiceQuestionState({
    inputMode: 'fill',
    compareCandidates: null,
    machineChoiceQuestion: machineChoice,
    uiMessage: 'LLM message',
    uiOptions: [
      { label: 'X', value: 'X' },
      { label: 'Y', value: 'Y' },
    ],
  });
  assert.deepEqual(result?.options, machineChoice.options);
});

test('compare choiceQuestion uses compareCandidates and ignores ui.options', () => {
  const result = resolveChoiceQuestionState({
    inputMode: 'compare',
    compareCandidates: [
      { id: 'A', summary: '候補A' },
      { id: 'B', summary: '候補B' },
    ],
    machineChoiceQuestion: null,
    uiMessage: 'どれにしますか？',
    uiOptions: [
      { label: '候補A', value: '候補A' },
      { label: '候補B', value: '候補B' },
    ],
  });
  assert.equal(result?.key, 'activityType');
  assert.equal(result?.options.length, 2);
  assert.equal(result?.options[0].value, '候補A');
});

test('compare choiceQuestion ignores ui.options when compareCandidates missing', () => {
  const result = resolveChoiceQuestionState({
    inputMode: 'compare',
    compareCandidates: [],
    machineChoiceQuestion: null,
    uiMessage: 'どれにしますか？',
    uiOptions: [
      { label: '候補A', value: '候補A' },
      { label: '候補B', value: '候補B' },
    ],
  });
  assert.equal(result, null);
});

test('question bubble is not appended when last message is identical', () => {
  const shouldAppend = shouldAppendQuestionBubble({
    lastMessage: { role: 'assistant', type: 'text', content: 'タイトルは？' },
    questionText: 'タイトルは？',
    shouldRender: true,
  });
  assert.equal(shouldAppend, false);
});
