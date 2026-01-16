export type AssistantDisplaySource = 'content_text' | 'derived_from_json' | 'empty';

type AssistantDisplayInput = {
  content?: string | null;
  contentText?: string | null;
  contentJson?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
};

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const isInternalSummaryText = (text: string) => {
  const trimmed = text.trim();
  return trimmed.startsWith('AIの理解') || trimmed.startsWith('AI 的理解') || trimmed.startsWith('AI的理解');
};

const inferUiPhaseFromStructure = (reply: Record<string, any>): string | null => {
  const uiPhase = normalizeText(reply.uiPhase);
  if (uiPhase) return uiPhase;
  if (Boolean(reply.draftReady)) return 'ready';
  const inputMode = normalizeText(reply.inputMode);
  const compareCandidates = Array.isArray(reply.compareCandidates) ? reply.compareCandidates : [];
  if (inputMode === 'compare' || compareCandidates.length) return 'compare';
  const choiceQuestion = reply.choiceQuestion ?? null;
  const choiceOptions = Array.isArray(choiceQuestion?.options) ? choiceQuestion.options : [];
  const choiceKey = normalizeText(choiceQuestion?.key);
  if (choiceOptions.length) {
    if (choiceKey === 'ready_next_action' || choiceKey === 'ready_actions') return 'ready';
    return 'decision';
  }
  const nextQuestionKey = normalizeText(reply.nextQuestionKey);
  if (nextQuestionKey) return 'collecting';
  return null;
};

const deriveFromJson = (contentJson: Record<string, unknown> | null | undefined) => {
  if (!contentJson || typeof contentJson !== 'object') return '';
  const reply = contentJson as Record<string, any>;
  const ui = reply.ui ?? null;
  const nextQuestionKey = normalizeText(reply.nextQuestionKey);
  const uiQuestionKey = normalizeText(ui?.question?.key);
  const uiQuestion = normalizeText(ui?.question?.text);
  const messageSource = normalizeText(reply.messageSource);
  const machineUiOnly = import.meta.env.VITE_EVENT_ASSISTANT_MACHINE_UI_ONLY === '1';
  if (machineUiOnly) {
    const uiPhase = inferUiPhaseFromStructure(reply);
    const machinePhase = uiPhase === 'collecting' || uiPhase === 'decision' || uiPhase === 'compare';
    if (machinePhase) {
      const safeQuestion =
        uiQuestion &&
        nextQuestionKey &&
        uiQuestionKey === nextQuestionKey &&
        messageSource !== 'backend.llm' &&
        uiQuestion.length <= 140;
      return safeQuestion ? uiQuestion : '';
    }
  }
  if (uiQuestion && nextQuestionKey) return uiQuestion;
  if (uiQuestion && !nextQuestionKey) {
    console.warn('[assistantDisplay] ignore ui.question without nextQuestionKey');
  }
  const uiMessage = normalizeText(ui?.message);
  if (uiMessage && !machineUiOnly) return uiMessage;
  return '';
};

export const getAssistantDisplay = (input: AssistantDisplayInput): { text: string; source: AssistantDisplaySource } => {
  const contentText = normalizeText(input.contentText || input.content || '');
  if (contentText && !isInternalSummaryText(contentText)) {
    return { text: contentText, source: 'content_text' };
  }
  const payloadReply =
    input.payload && typeof input.payload === 'object'
      ? ((input.payload as Record<string, any>).assistantReply as Record<string, unknown> | null | undefined)
      : null;
  const derived = deriveFromJson(input.contentJson || payloadReply);
  if (derived) {
    return { text: derived, source: 'derived_from_json' };
  }
  return { text: '', source: 'empty' };
};

export const buildAssistantDisplayText = (input: AssistantDisplayInput) => getAssistantDisplay(input).text;
