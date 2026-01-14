export type EventAssistantEnv = 'dev' | 'stg' | 'prod';

export type EventAssistantPromptPhase =
  | 'parse'
  | 'collect'
  | 'ready'
  | 'operate'
  | 'revise_select'
  | 'revise_edit'
  | 'unknown';

export type EventAssistantUiAction =
  | 'confirm_draft'
  | 'continue_edit'
  | 'resume_collecting'
  | 'open_preview'
  | 'go_form'
  | null;

export type FailureType =
  | 'SAID_BUT_MISSING'
  | 'REPEAT_QUESTION'
  | 'PARSE_FAILED'
  | 'STAGE_MISMATCH'
  | 'ACTION_NO_EFFECT'
  | 'DRAFT_INCONSISTENT';

export interface FailureSignals {
  repeatQuestion: boolean;
  saidButMissing: boolean;
  stageMismatch: boolean;
  actionNoEffect: boolean;
}

export interface EventAssistantTurnLog {
  ts: string;
  day: string;
  env: EventAssistantEnv;
  requestId: string | null;
  conversationId: string | null;
  turnIndex: number;
  input: {
    userText: string;
    uiAction: EventAssistantUiAction;
    uiMode: 'normal' | 'explain';
    locale: string;
    timezone: string;
  };
  machine: {
    promptPhase: EventAssistantPromptPhase;
    loopTriggered: boolean;
    missingKeys: string[];
    candidateKeys: string[];
    confirmedKeys: string[];
    nextQuestionKey: string | null;
    draftReady: boolean;
    messageSource: string | null;
    decisionTrace?: Record<string, unknown> | null;
  };
  parser: {
    time: {
      rawText: string | null;
      candidateStartAt: string | null;
      candidateEndAt: string | null;
      confidence: number | null;
      ok: boolean;
      reason: string;
    };
    price: {
      rawText: string | null;
      candidateAmount: number | null;
      currency: string | null;
      type: string | null;
      confidence: number | null;
      ok: boolean;
      reason: string;
    };
  };
  llm: {
    ledger: Array<{ name: string; allowed: boolean; reason?: string }>;
    callsCount: number;
  };
  draft: {
    publicActivityDraft: Record<string, unknown> | null;
    draftHash: string | null;
  };
  output: {
    assistantMessageText: string;
    uiQuestionText: string | null;
    choiceQuestion: Record<string, unknown> | null;
  };
  quality: {
    failureTypes: FailureType[];
    signals: FailureSignals;
  };
}

export interface EventAssistantDailySummary {
  day: string;
  env: EventAssistantEnv;
  totalTurns: number;
  failureTypeCounts: Record<string, number>;
  topMissingKeys: Record<string, number>;
  topNextQuestionKeys: Record<string, number>;
  topParserFailures: {
    time: number;
    price: number;
  };
  topExamples: Record<
    FailureType,
    Array<{
      userText: string;
      requestId: string | null;
      conversationId: string | null;
      machine: {
        missingKeys: string[];
        nextQuestionKey: string | null;
        promptPhase: string;
      };
    }>
  >;
}
