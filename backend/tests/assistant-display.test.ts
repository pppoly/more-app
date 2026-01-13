import test from 'node:test';
import assert from 'node:assert/strict';
import { getAssistantDisplay } from '../../frontend/src/utils/assistantDisplay';

test('assistant display prefers ui.question when contentText is internal', () => {
  const result = getAssistantDisplay({
    contentText: 'AIの理解：対象は〜',
    contentJson: { ui: { question: { key: 'title', text: 'タイトルを教えてください。' } } },
  });
  assert.equal(result.text, 'タイトルを教えてください。');
  assert.equal(result.source, 'derived_from_json');
});

test('assistant display derives from ui.message when contentText missing', () => {
  const result = getAssistantDisplay({
    contentJson: { ui: { message: '候補を整理しました。' } },
  });
  assert.equal(result.text, '候補を整理しました。');
  assert.equal(result.source, 'derived_from_json');
});

test('assistant display ignores ui.question without nextQuestionKey', () => {
  const result = getAssistantDisplay({
    contentJson: { ui: { question: { key: 'title', text: 'タイトルは？' } } },
  });
  assert.equal(result.text, '');
  assert.equal(result.source, 'empty');
});
