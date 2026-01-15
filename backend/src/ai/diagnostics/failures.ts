import type { FailureSignals, FailureType } from './types';

const TIME_HINT_REGEX =
  /(下周|下星期|下週|今週|来週|本周|周|星期|月曜|火曜|水曜|木曜|金曜|土曜|日曜|\d{1,2}[:：]\d{2}|\d{1,2}\/\d{1,2})/i;
const PRICE_HINT_REGEX = /(円|元|無料|フリー|free|¥|\d{2,5}\s*(円|元))/i;

export interface FailureAnalysisInput {
  userText: string;
  previousUserText?: string | null;
  previousAskedKey: string | null;
  conversationReset?: boolean;
  promptPhase: string;
  uiPhase: string | null;
  missingKeys: string[];
  candidateKeys: string[];
  confirmedKeys: string[];
  nextQuestionKey: string | null;
  draftReady: boolean;
  uiMode: 'normal' | 'explain';
  uiAction: string | null;
  hasChoiceQuestion: boolean;
  uiQuestionText: string | null;
  choiceQuestionKey: string | null;
  parser: {
    timeOk: boolean;
    priceOk: boolean;
    timeReason?: string;
    priceReason?: string;
  };
  draftSummary: {
    title?: string | null;
    startTime?: string | null;
    location?: string | null;
    price?: string | null;
  };
}

export const analyzeFailures = (
  input: FailureAnalysisInput,
): { failureTypes: FailureType[]; signals: FailureSignals } => {
  const failureTypes: FailureType[] = [];
  const signals: FailureSignals = {
    repeatQuestion: false,
    saidButMissing: false,
    stageMismatch: false,
    actionNoEffect: false,
    unitSlipPrompted: false,
    nextQuestionMissing: false,
  };
  const saidTime = TIME_HINT_REGEX.test(input.userText);
  const saidPrice = PRICE_HINT_REGEX.test(input.userText);
  const saidButMissing =
    (saidTime && input.missingKeys.includes('time')) ||
    (saidPrice && input.missingKeys.includes('price'));
  if (saidButMissing) {
    failureTypes.push('SAID_BUT_MISSING');
    signals.saidButMissing = true;
  }

  const normalizedUserText = input.userText.trim();
  const normalizedPreviousText = (input.previousUserText ?? '').trim();
  const sameUserText = normalizedPreviousText.length > 0 && normalizedPreviousText === normalizedUserText;
  const repeatQuestion =
    !input.conversationReset &&
    sameUserText &&
    Boolean(input.nextQuestionKey) &&
    input.nextQuestionKey === input.previousAskedKey &&
    (input.candidateKeys.includes(input.nextQuestionKey ?? '') ||
      input.confirmedKeys.includes(input.nextQuestionKey ?? ''));
  if (repeatQuestion) {
    failureTypes.push('REPEAT_QUESTION');
    signals.repeatQuestion = true;
  }

  const timeFail =
    !input.parser.timeOk &&
    input.missingKeys.includes('time') &&
    !['no_amount', 'not_attempted'].includes(input.parser.timeReason ?? '');
  const priceFail =
    !input.parser.priceOk &&
    input.missingKeys.includes('price') &&
    !['no_amount', 'not_attempted'].includes(input.parser.priceReason ?? '');
  const parseFailed = timeFail || priceFail;
  if (parseFailed) {
    failureTypes.push('PARSE_FAILED');
  }

  const stageMismatch =
    (input.uiMode === 'explain' && Boolean(input.nextQuestionKey)) ||
    (input.uiPhase === 'revise_select' && Boolean(input.nextQuestionKey)) ||
    ((input.promptPhase === 'ready' || input.promptPhase === 'operate') && Boolean(input.nextQuestionKey));
  if (stageMismatch) {
    failureTypes.push('STAGE_MISMATCH');
    signals.stageMismatch = true;
  }

  const actionNoEffect =
    input.uiAction !== null &&
    ['confirm_draft', 'continue_edit'].includes(input.uiAction) &&
    input.promptPhase === 'collect' &&
    !input.draftReady;
  if (actionNoEffect) {
    failureTypes.push('ACTION_NO_EFFECT');
    signals.actionNoEffect = true;
  }

  const draftInconsistent =
    input.draftReady &&
    (!input.draftSummary.title ||
      !input.draftSummary.startTime ||
      !input.draftSummary.location ||
      !input.draftSummary.price);
  if (draftInconsistent) {
    failureTypes.push('DRAFT_INCONSISTENT');
  }

  const nextQuestionMissing =
    !input.hasChoiceQuestion &&
    input.missingKeys.length > 0 &&
    !input.nextQuestionKey &&
    input.uiPhase !== 'revise_select' &&
    input.uiPhase !== 'revise_edit';
  if (nextQuestionMissing) {
    failureTypes.push('NEXT_QUESTION_MISSING');
    signals.nextQuestionMissing = true;
  }

  if (input.uiQuestionText && input.hasChoiceQuestion) {
    failureTypes.push('DUAL_ACTION');
  }

  if (
    input.choiceQuestionKey?.startsWith('confirm_') &&
    ['title', 'time', 'location', 'price'].some((key) => input.missingKeys.includes(key))
  ) {
    failureTypes.push('CONFIRM_WHILE_MISSING');
  }

  return { failureTypes, signals };
};
