import test from 'node:test';
import assert from 'node:assert/strict';
const loadEvaluateDraftVisibility = async () => {
  const mod = await import('../../frontend/src/utils/draftAnchor');
  return mod.evaluateDraftVisibility;
};

test('evaluateDraftVisibility: show anchor when draft exists even if not ready', async () => {
  const evaluateDraftVisibility = await loadEvaluateDraftVisibility();
  const result = evaluateDraftVisibility({
    hasDraftInMessages: true,
    hasLastReadyDraft: false,
    draftReadyForUi: false,
  });
  assert.equal(result.shouldShowDraftAnchor, true);
  assert.equal(result.hasMismatch, true);
});

test('evaluateDraftVisibility: no mismatch when ready', async () => {
  const evaluateDraftVisibility = await loadEvaluateDraftVisibility();
  const result = evaluateDraftVisibility({
    hasDraftInMessages: true,
    hasLastReadyDraft: true,
    draftReadyForUi: true,
  });
  assert.equal(result.shouldShowDraftAnchor, true);
  assert.equal(result.hasMismatch, false);
});

test('evaluateDraftVisibility: no anchor when no draft', async () => {
  const evaluateDraftVisibility = await loadEvaluateDraftVisibility();
  const result = evaluateDraftVisibility({
    hasDraftInMessages: false,
    hasLastReadyDraft: false,
    draftReadyForUi: false,
  });
  assert.equal(result.shouldShowDraftAnchor, false);
  assert.equal(result.hasMismatch, false);
});
