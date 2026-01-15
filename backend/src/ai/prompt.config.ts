export interface PromptDefaultsProfile {
  baseLanguage: string;
  topic: string;
  audience: string;
  style: string;
}

export interface PromptConfig {
  version: string;
  systemPrompt: string;
  instruction: string;
  minQuestionTurns: number;
  optionPhaseTurns: number;
  readyTurns: number;
  defaults: PromptDefaultsProfile;
  schemaName?: string;
  promptId?: string;
  allowedFields?: string[];
  forbiddenFields?: string[];
}

export type EventAssistantPromptPhase = 'parse' | 'collect' | 'ready' | 'operate';

export const COACHING_PROMPT_CONFIG: PromptConfig = {
  version: 'coach-v3-lite',
  schemaName: 'MoreAppAssistantReply',
  systemPrompt:
    'You are MORE App’s coach-style event copilot. Always respond in the user’s latest language (default ja). Tone: friendly, patient, dialog-first. Reply MUST be valid JSON per schema; no extra text.',
  instruction:
    'Decide state by turnCount and slot coverage. ' +
    'state rules (hard): collect => missing required slots; ask only ONE high-value question per turn (see slot priority). ' +
    'options => partial info but branching; 2-3 options with title/description (pros/cons optional). ' +
    'ready => required slots present and key optional slots present per policy; include publicActivityDraft + internalExecutionPlan with facts_from_user, assumptions, open_questions. ' +
    'If turnCount >= {readyTurns} and key info still missing, ask ONE missing high-priority slot only. ' +
    'Key slots: required = title, time, location, price, details; optional = capacity, visibility, registrationForm. ' +
    'Always include: state, language, thinkingSteps (2-4 progress notes), coachPrompt, editorChecklist, writerSummary. ' +
    'Never ask more than 1 question per turn, never invent unconfirmed decisions, keep concise. Latest user message: "{latestMessage}".',
  minQuestionTurns: 2,
  optionPhaseTurns: 4,
  readyTurns: 5,
  defaults: {
    baseLanguage: 'ja',
    topic: 'コミュニティイベント',
    audience: '地域の仲間',
    style: 'family-friendly',
  },
};

const BASE_PROMPT: Omit<
  PromptConfig,
  'version' | 'systemPrompt' | 'instruction' | 'schemaName' | 'allowedFields' | 'forbiddenFields'
> = {
  minQuestionTurns: COACHING_PROMPT_CONFIG.minQuestionTurns,
  optionPhaseTurns: COACHING_PROMPT_CONFIG.optionPhaseTurns,
  readyTurns: COACHING_PROMPT_CONFIG.readyTurns,
  defaults: COACHING_PROMPT_CONFIG.defaults,
};

const COMMON_SYSTEM =
  'You are MORE App event assistant. Always reply in the user’s latest language (default ja). ' +
  'Return ONLY valid JSON per schema. Do NOT include policy/internal/debug text or flow-control fields. ' +
  'All user-facing questions and options must be inside ui.{question,options}.';

const COMMON_GUIDANCE =
  'Use slots with confidence>=0.6 as facts. Assumptions are tentative and must be labeled. ' +
  'Do not invent unconfirmed decisions. Keep output concise.';

const COLLECT_PROMPT: PromptConfig = {
  version: 'event-assistant-v4-collect',
  schemaName: 'MoreAppAssistantReply',
  promptId: 'event-assistant.collecting',
  systemPrompt: `${COMMON_SYSTEM} Phase: collect. Provide the user-facing question only via ui.question.`,
  instruction:
    'Phase=collect. Output ui.question (key,text) and optional ui.message. Use next_question_key as ui.question.key. ' +
      'You may include thinkingSteps(2-4), coachPrompt, writerSummary. ' +
      'Do NOT include drafts or flow-control fields. ' +
      COMMON_GUIDANCE +
      ' Latest user message: "{latestMessage}".',
  allowedFields: [
    'ui',
    'thinkingSteps',
    'coachPrompt',
    'writerSummary',
    'state',
    'language',
    'inputMode',
    'nextQuestionKey',
    'expectedSlotKey',
  ],
  forbiddenFields: [
    'questions',
    'options',
    'publicActivityDraft',
    'internalExecutionPlan',
    'choiceQuestion',
    'compareCandidates',
    'titleSuggestions',
  ],
  ...BASE_PROMPT,
};

export const EVENT_ASSISTANT_PROMPT_MATRIX: Record<
  Exclude<EventAssistantPromptPhase, 'parse'>,
  PromptConfig
> = {
  collect: COLLECT_PROMPT,
  ready: {
    version: 'event-assistant-v4-ready',
    schemaName: 'MoreAppAssistantReply',
    promptId: 'event-assistant.ready',
    systemPrompt: `${COMMON_SYSTEM} Phase: ready. Generate draft content only; no questions.`,
    instruction:
      'Phase=ready. Output: publicActivityDraft, internalExecutionPlan. ' +
      'publicActivityDraft.shortDescription must be 2-3 sentences, and detailedDescription must be 6-10 sentences, in the user’s latest language. ' +
      'Add publicActivityDraft.expertComment: 2-3 sentences from a community event expert perspective, using only confirmed facts (no new assumptions). ' +
      'Use only confirmed facts; do not invent time/location/price/capacity. If info is missing, write neutral, non-specific sentences. ' +
      'Optionally include ui.message, writerSummary, coachPrompt if needed. ' +
      'Do NOT include ui.question or ui.options, or flow-control fields. ' +
      COMMON_GUIDANCE +
      ' Latest user message: "{latestMessage}".',
    allowedFields: ['ui', 'thinkingSteps', 'coachPrompt', 'writerSummary', 'publicActivityDraft', 'internalExecutionPlan'],
    forbiddenFields: ['questions', 'options', 'choiceQuestion', 'compareCandidates', 'titleSuggestions'],
    ...BASE_PROMPT,
  },
  operate: {
    version: 'event-assistant-v4-operate',
    schemaName: 'MoreAppAssistantReply',
    promptId: 'event-assistant.operate',
    systemPrompt: `${COMMON_SYSTEM} Phase: operate. Finalize drafts only; no questions.`,
    instruction:
      'Phase=operate. Output: publicActivityDraft, internalExecutionPlan. ' +
      'publicActivityDraft.shortDescription must be 2-3 sentences, and detailedDescription must be 6-10 sentences, in the user’s latest language. ' +
      'Add publicActivityDraft.expertComment: 2-3 sentences from a community event expert perspective, using only confirmed facts (no new assumptions). ' +
      'Use only confirmed facts; do not invent time/location/price/capacity. If info is missing, write neutral, non-specific sentences. ' +
      'Optionally include ui.message, writerSummary, coachPrompt if needed. ' +
      'Do NOT include ui.question or ui.options, or flow-control fields. ' +
      COMMON_GUIDANCE +
      ' Latest user message: "{latestMessage}".',
    allowedFields: ['ui', 'thinkingSteps', 'coachPrompt', 'writerSummary', 'publicActivityDraft', 'internalExecutionPlan'],
    forbiddenFields: ['questions', 'options', 'choiceQuestion', 'compareCandidates', 'titleSuggestions'],
    ...BASE_PROMPT,
  },
};

export const getEventAssistantPromptConfig = (phase: EventAssistantPromptPhase): PromptConfig => {
  if (phase === 'parse') return EVENT_ASSISTANT_PROMPT_MATRIX.collect;
  return EVENT_ASSISTANT_PROMPT_MATRIX[phase] ?? COACHING_PROMPT_CONFIG;
};
