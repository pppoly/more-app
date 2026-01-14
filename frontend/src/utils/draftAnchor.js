export const evaluateDraftVisibility = (state) => {
  const shouldShowDraftAnchor = state.hasDraftInMessages || state.hasLastReadyDraft;
  const hasMismatch = shouldShowDraftAnchor && !state.draftReadyForUi;
  return { shouldShowDraftAnchor, hasMismatch };
};
