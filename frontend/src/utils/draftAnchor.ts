type DraftVisibilityState = {
  hasDraftInMessages: boolean;
  hasLastReadyDraft: boolean;
  hasMvpDraft?: boolean;
  draftReadyForUi: boolean;
};

export const evaluateDraftVisibility = (state: DraftVisibilityState) => {
  const shouldShowDraftAnchor = state.hasDraftInMessages || state.hasLastReadyDraft;
  const hasMismatch = shouldShowDraftAnchor && !state.draftReadyForUi;
  return { shouldShowDraftAnchor, hasMismatch };
};
