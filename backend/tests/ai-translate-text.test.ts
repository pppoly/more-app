import test from 'node:test';
import assert from 'node:assert/strict';
import { AiService } from '../src/ai/ai.service';
import { HttpException } from '@nestjs/common';

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'test';

const buildAiServiceWithCompletion = (content: string, onCreate?: (params: any) => void) => {
  const service = new AiService({} as any, {} as any);
  (service as any).client = {
    chat: {
      completions: {
        create: async (params: any) => {
          onCreate?.(params);
          return {
            choices: [{ message: { content } }],
          };
        },
      },
    },
  };
  return service;
};

test('translateText: json_schema response returns expected shape', async () => {
  const payload = {
    sourceLang: 'ja',
    targetLangs: ['en'],
    items: [{ key: 'title', text: 'こんにちは' }],
  };

  let captured: any = null;
  const service = buildAiServiceWithCompletion(
    JSON.stringify({
      translations: [{ key: 'title', source: 'こんにちは', translated: { en: 'Hello' } }],
    }),
    (params) => {
      captured = params;
    },
  );

  const result = await service.translateText(payload as any);
  assert.equal(result.translations[0].translated.en, 'Hello');
  assert.equal(captured?.response_format?.type, 'json_schema');
  assert.equal(captured?.response_format?.json_schema?.strict, true);
  assert.ok(String(captured?.messages?.[1]?.content ?? '').includes('Return a JSON object'));
});

test('translateText: accepts legacy JSON array output by wrapping into {translations: ...}', async () => {
  const service = buildAiServiceWithCompletion(
    JSON.stringify([{ key: 'title', source: 'こんにちは', translated: { en: 'Hello' } }]),
  );

  const result = await service.translateText({
    sourceLang: 'ja',
    targetLangs: ['en'],
    items: [{ key: 'title', text: 'こんにちは' }],
  } as any);

  assert.equal(result.translations.length, 1);
  assert.equal(result.translations[0].translated.en, 'Hello');
});

test('translateText: invalid JSON throws HttpException("Failed to translate text")', async () => {
  const service = buildAiServiceWithCompletion('{"translations":[}');
  await assert.rejects(async () => {
    await service.translateText({
      sourceLang: 'ja',
      targetLangs: ['en'],
      items: [{ key: 'title', text: 'こんにちは' }],
    } as any);
  }, (err: any) => err instanceof HttpException && err.message === 'Failed to translate text');
});
