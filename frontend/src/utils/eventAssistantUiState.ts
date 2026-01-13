import type { EventAssistantReply } from '../types/api';

export type ChoiceOption = {
  label: string;
  value: string;
  recommended?: boolean;
};

export type ChoiceQuestion = {
  key: string;
  prompt: string;
  options: ChoiceOption[];
};

type ResolveChoiceQuestionInput = {
  inputMode?: EventAssistantReply['inputMode'] | null;
  compareCandidates?: EventAssistantReply['compareCandidates'] | null;
  machineChoiceQuestion?: EventAssistantReply['choiceQuestion'] | null;
  uiMessage?: string | null;
  uiOptions?: ChoiceOption[] | null;
};

type CommitCheckpointParams = {
  mode: 'chat' | 'operate';
  draftReady: boolean;
  nextQuestionKey?: string | null;
  isCommitted: boolean;
  hasChoiceQuestion: boolean;
  isCompareMode: boolean;
};

type MessageSummary = {
  role?: string;
  type?: string;
  content?: string | null;
};

const normalizeAckValue = (value: string) => {
  const firstLine = value.split('\n')[0]?.trim() || '';
  return firstLine.length > 32 ? `${firstLine.slice(0, 32)}…` : firstLine;
};

export const buildAckText = (key: string | null | undefined, answer: string) => {
  const normalized = normalizeAckValue(answer);
  switch (key) {
    case 'price':
      return normalized ? `了解しました。参加費は${normalized}ですね。` : '了解しました。参加費を記録しました。';
    case 'time':
      return normalized ? `了解しました。日時は${normalized}ですね。` : '了解しました。日時を記録しました。';
    case 'location':
      return normalized ? `了解しました。場所は${normalized}ですね。` : '了解しました。場所を記録しました。';
    case 'title':
      return normalized ? `了解しました。タイトルは「${normalized}」ですね。` : '了解しました。タイトルを記録しました。';
    case 'details':
      return normalized ? `了解しました。内容は「${normalized}」ですね。` : '了解しました。内容を記録しました。';
    case 'capacity':
      return normalized ? `了解しました。定員は${normalized}ですね。` : '了解しました。定員を記録しました。';
    case 'registrationForm':
      return normalized ? `了解しました。申込項目は「${normalized}」ですね。` : '了解しました。申込フォームを記録しました。';
    default:
      return '了解しました。';
  }
};

export const isCompareMode = (
  inputMode?: EventAssistantReply['inputMode'] | null,
  compareCandidates?: EventAssistantReply['compareCandidates'] | null,
) => inputMode === 'compare' || Boolean(compareCandidates && compareCandidates.length);

export const resolveChoiceQuestionState = ({
  inputMode,
  compareCandidates,
  machineChoiceQuestion,
  uiMessage,
  uiOptions,
}: ResolveChoiceQuestionInput): ChoiceQuestion | null => {
  if (machineChoiceQuestion?.options?.length) {
    return machineChoiceQuestion as ChoiceQuestion;
  }
  if (!isCompareMode(inputMode, compareCandidates)) return null;
  if (!compareCandidates || compareCandidates.length === 0) return null;
  return {
    key: 'activityType',
    prompt: '比較したい候補を選んでください。',
    options: compareCandidates.map((candidate, idx) => ({
      label: `候補${candidate.id}: ${candidate.summary}`,
      value: `候補${candidate.id}`,
      recommended: idx === 0,
    })),
  };
};

export const computeShouldShowCommitCheckpoint = ({
  mode,
  draftReady,
  nextQuestionKey,
  isCommitted,
  hasChoiceQuestion,
  isCompareMode,
}: CommitCheckpointParams) =>
  mode === 'chat' &&
  draftReady &&
  !isCommitted &&
  !hasChoiceQuestion &&
  !isCompareMode &&
  !nextQuestionKey;

export const shouldAppendQuestionBubble = ({
  lastMessage,
  questionText,
  shouldRender,
}: {
  lastMessage: MessageSummary | null;
  questionText: string;
  shouldRender: boolean;
}) => {
  if (!shouldRender) return false;
  if (!questionText) return false;
  if (!lastMessage) return true;
  if (
    lastMessage.role === 'assistant' &&
    lastMessage.type === 'text' &&
    (lastMessage.content ?? '').trim() === questionText
  ) {
    return false;
  }
  return true;
};
