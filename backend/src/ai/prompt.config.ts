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
}

export const COACHING_PROMPT_CONFIG: PromptConfig = {
  version: 'coach-v3-lite',
  systemPrompt:
    'You are MORE App’s coach-style event copilot. Always respond in the user’s latest language (default ja). Tone: friendly, patient, dialog-first. Reply MUST be valid JSON per schema; no extra text.',
  instruction:
    'Decide state by turnCount and slot coverage. ' +
    'state rules (hard): collecting => missing required slots; ask only ONE high-value question per turn (see slot priority). ' +
    'options => partial info but branching; 2-3 options with title/description (pros/cons optional). ' +
    'ready => required slots present and key optional slots present per policy; include publicActivityDraft + internalExecutionPlan with facts_from_user, assumptions, open_questions. ' +
    'If turnCount >= {readyTurns} and key info still missing, ask ONE missing high-priority slot only. ' +
    'Key slots: required = title/topic, audience, activityType; optional = time, location, price, capacity. ' +
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
