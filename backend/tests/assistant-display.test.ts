import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<any>;
const loadAssistantDisplay = () =>
  dynamicImport(
    pathToFileURL(resolve(__dirname, '../../frontend/src/utils/assistantDisplay.ts')).href,
  );

test('assistant display prefers ui.question when contentText is internal', async () => {
  const { getAssistantDisplay } = await loadAssistantDisplay();
  const result = getAssistantDisplay({
    contentText: 'AIの理解：対象は〜',
    contentJson: {
      ui: { question: { key: 'title', text: 'タイトルを教えてください。' } },
      nextQuestionKey: 'title',
    },
  });
  assert.equal(result.text, 'タイトルを教えてください。');
  assert.equal(result.source, 'derived_from_json');
});

test('assistant display derives from ui.message when contentText missing', async () => {
  const { getAssistantDisplay } = await loadAssistantDisplay();
  const result = getAssistantDisplay({
    contentJson: { ui: { message: '候補を整理しました。' } },
  });
  assert.equal(result.text, '候補を整理しました。');
  assert.equal(result.source, 'derived_from_json');
});

test('assistant display ignores ui.question without nextQuestionKey', async () => {
  const { getAssistantDisplay } = await loadAssistantDisplay();
  const result = getAssistantDisplay({
    contentJson: { ui: { question: { key: 'title', text: 'タイトルは？' } } },
  });
  assert.equal(result.text, '');
  assert.equal(result.source, 'empty');
});
