import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImageUrl } from '../src/common/utils/normalize-image-url';

test('normalizeImageUrl returns null/undefined as-is', () => {
  assert.equal(normalizeImageUrl(null, 'https://app.socialmore.jp'), null);
  assert.equal(normalizeImageUrl(undefined, 'https://app.socialmore.jp'), undefined);
});

test('normalizeImageUrl keeps absolute URLs', () => {
  assert.equal(
    normalizeImageUrl('https://app.socialmore.jp/uploads/production/a.png', 'https://app.socialmore.jp'),
    'https://app.socialmore.jp/uploads/production/a.png',
  );
});

test('normalizeImageUrl prefixes /uploads paths', () => {
  assert.equal(
    normalizeImageUrl('/uploads/production/a.png', 'https://app.socialmore.jp'),
    'https://app.socialmore.jp/uploads/production/a.png',
  );
});

test('normalizeImageUrl prefixes bare object keys', () => {
  assert.equal(
    normalizeImageUrl('production/a.png', 'https://app.socialmore.jp'),
    'https://app.socialmore.jp/uploads/production/a.png',
  );
});
