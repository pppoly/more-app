import type { PromptConfig, EventAssistantPromptPhase } from './prompt.config';

const ALWAYS_ALLOWED = new Set<string>();

const isPresentValue = (value: unknown) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
};

export const enforcePhaseOutput = <T extends Record<string, unknown>>(
  payload: T,
  phase: EventAssistantPromptPhase,
  policy: PromptConfig,
) => {
  const cleaned: Record<string, unknown> = { ...payload };
  const removed: string[] = [];
  const forbidden = new Set(policy.forbiddenFields ?? []);
  const allowed = policy.allowedFields ? new Set([...policy.allowedFields, ...ALWAYS_ALLOWED]) : null;

  forbidden.forEach((key) => {
    if (key in cleaned) {
      if (isPresentValue(cleaned[key])) removed.push(key);
      delete cleaned[key];
    }
  });

  if (allowed) {
    Object.keys(cleaned).forEach((key) => {
      if (!allowed.has(key)) {
        if (isPresentValue(cleaned[key])) removed.push(key);
        delete cleaned[key];
      }
    });
  }

  return { cleaned: cleaned as T, removed, phase };
};

export const determinePromptPhase = (params: {
  inputMode: 'describe' | 'fill' | 'compare';
  confirmDraft: boolean;
  draftReady: boolean;
  hasDecisionChoice: boolean;
}): EventAssistantPromptPhase => {
  if (params.inputMode === 'compare') return 'compare';
  if (params.confirmDraft) return 'operate';
  if (params.draftReady) return 'ready';
  if (params.hasDecisionChoice) return 'decision';
  return 'collecting';
};
