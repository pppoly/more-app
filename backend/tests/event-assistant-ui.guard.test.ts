import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<any>;
const loadUiState = () =>
  dynamicImport(
    pathToFileURL(resolve(__dirname, '../../frontend/src/utils/eventAssistantUiState.ts')).href,
  );

test('commit checkpoint appears only when draftReady and not committed', async () => {
  const { computeShouldShowCommitCheckpoint } = await loadUiState();
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

test('choiceQuestion prefers machine options over ui.options', async () => {
  const { resolveChoiceQuestionState } = await loadUiState();
  const machineChoice = {
    key: 'details' as const,
    prompt: '内容はどうしますか？',
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

test('compare choiceQuestion uses compareCandidates and ignores ui.options', async () => {
  const { resolveChoiceQuestionState } = await loadUiState();
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
  assert.equal(result?.key, 'details');
  assert.equal(result?.options.length, 2);
  assert.equal(result?.options[0].value, '候補A');
});

test('compare choiceQuestion ignores ui.options when compareCandidates missing', async () => {
  const { resolveChoiceQuestionState } = await loadUiState();
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

test('question bubble is not appended when last message is identical', async () => {
  const { shouldAppendQuestionBubble } = await loadUiState();
  const shouldAppend = shouldAppendQuestionBubble({
    lastMessage: { role: 'assistant', type: 'text', content: 'タイトルは？' },
    questionText: 'タイトルは？',
    shouldRender: true,
  });
  assert.equal(shouldAppend, false);
});

test('buildAckText formats price response', async () => {
  const { buildAckText } = await loadUiState();
  const ack = buildAckText('price', '1000円');
  assert.ok(ack.includes('参加費'));
});
