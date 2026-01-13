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

const deriveFromJson = (contentJson: Record<string, unknown> | null | undefined) => {
  if (!contentJson || typeof contentJson !== 'object') return '';
  const reply = contentJson as Record<string, any>;
  const ui = reply.ui ?? null;
  const nextQuestionKey = normalizeText(reply.nextQuestionKey);
  const uiQuestion = normalizeText(ui?.question?.text);
  if (uiQuestion && nextQuestionKey) return uiQuestion;
  if (uiQuestion && !nextQuestionKey) {
    console.warn('[assistantDisplay] ignore ui.question without nextQuestionKey');
  }
  const uiMessage = normalizeText(ui?.message);
  if (uiMessage) return uiMessage;
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
