import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAssistantMessages } from '../src/console/assistant-log.utils';

test('mergeAssistantMessages preserves assistant messages on user-only update', () => {
  const existing = [
    { id: 'u1', role: 'user', content: 'hello', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'a1', role: 'assistant', content: 'hi there', createdAt: '2024-01-01T00:00:01.000Z' },
  ];
  const incoming = [{ id: 'u1', role: 'user', content: 'hello', createdAt: '2024-01-01T00:00:00.000Z' }];
  const merged = mergeAssistantMessages(existing, incoming, new Date('2024-01-01T00:00:02.000Z'));
  assert.equal(merged.length, 2);
  assert.ok(merged.find((m) => m.role === 'assistant' && m.content === 'hi there'));
});

test('mergeAssistantMessages is idempotent for same clientMessageId', () => {
  const incoming = [
    { clientMessageId: 'c1', role: 'user', content: 'a', createdAt: '2024-01-01T00:00:00.000Z' },
    { clientMessageId: 'c1', role: 'user', content: 'a', createdAt: '2024-01-01T00:00:00.000Z' },
  ];
  const merged = mergeAssistantMessages([], incoming, new Date('2024-01-01T00:00:01.000Z'));
  assert.equal(merged.length, 1);
  assert.equal(merged[0].clientMessageId, 'c1');
});

test('mergeAssistantMessages orders by serverCreatedAt', () => {
  const existing = [
    { id: 'b', role: 'assistant', content: 'later', serverCreatedAt: '2024-01-01T00:00:02.000Z' },
    { id: 'a', role: 'user', content: 'earlier', serverCreatedAt: '2024-01-01T00:00:01.000Z' },
  ];
  const merged = mergeAssistantMessages(existing, [], new Date('2024-01-01T00:00:03.000Z'));
  assert.equal(merged[0].id, 'a');
  assert.equal(merged[1].id, 'b');
});

test('conversation round-trip keeps user + assistant messages', () => {
  const firstSave = mergeAssistantMessages(
    [],
    [{ clientMessageId: 'u1', role: 'user', content: 'hello', createdAt: '2024-01-01T00:00:00.000Z' }],
    new Date('2024-01-01T00:00:00.500Z'),
  );
  const secondSave = mergeAssistantMessages(
    firstSave,
    [{ clientMessageId: 'a1', role: 'assistant', content: 'hi', createdAt: '2024-01-01T00:00:01.000Z' }],
    new Date('2024-01-01T00:00:01.500Z'),
  );
  assert.equal(secondSave.length, 2);
  assert.deepEqual(
    secondSave.map((m) => m.role),
    ['user', 'assistant'],
  );
});

test('mergeAssistantMessages keeps contentText/contentJson and prefers longer contentText', () => {
  const existing = [
    {
      id: 'a1',
      role: 'assistant',
      contentText: '短い',
      contentJson: { coachPrompt: '短い' },
      createdAt: '2024-01-01T00:00:01.000Z',
    },
  ];
  const incoming = [
    {
      id: 'a1',
      role: 'assistant',
      contentText: 'より長い表示テキスト',
      contentJson: { coachPrompt: '更新' },
      createdAt: '2024-01-01T00:00:01.000Z',
    },
  ];
  const merged = mergeAssistantMessages(existing, incoming, new Date('2024-01-01T00:00:02.000Z'));
  assert.equal(merged.length, 1);
  assert.equal(merged[0].contentText, 'より長い表示テキスト');
  assert.deepEqual(merged[0].contentJson, { coachPrompt: '更新' });
});
