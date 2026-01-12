import test from 'node:test';
import assert from 'node:assert/strict';
import { getAssistantDisplay } from '../../frontend/src/utils/assistantDisplay';

test('assistant display prefers contentText and ignores internal summary', () => {
  const result = getAssistantDisplay({
    contentText: 'AIの理解：対象は〜',
    contentJson: { coachPrompt: '次の情報を教えてください。' },
  });
  assert.equal(result.text, '次の情報を教えてください。');
  assert.equal(result.source, 'derived_from_json');
});

test('assistant display derives from writerSummary when contentText missing', () => {
  const result = getAssistantDisplay({
    contentJson: { writerSummary: { headline: '親子BBQ', nextSteps: '日時を教えてください。' } },
  });
  assert.equal(result.text, '親子BBQ / 日時を教えてください。');
  assert.equal(result.source, 'derived_from_json');
});
