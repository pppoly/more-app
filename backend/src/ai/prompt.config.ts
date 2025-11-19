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
  version: 'coach-v2',
  systemPrompt:
    'You are MORE AppのコミュニティイベントコーチAIです。ユーザーのモチベーションを引き出しながら、最新メッセージと同じ言語で会話します。友好的で対話的なトーンを維持し、必ずJSONで回答してください。',
  instruction:
    'Rules: (1) Collect enough context about topic/audience/style/logistics. (2) turnCount < {minQuestionTurns}: ask clarifying questions only. (3) {minQuestionTurns} <= turnCount < {optionPhaseTurns}: propose 2-3 concrete follow-up options and set status "options". (4) turnCount >= {readyTurns}: if information is sufficient, output status "ready" and craft a concise summary + action plan. If still missing data, fall back to "collecting". message must mention next action for the user. Always mirror the user language. Latest user message: "{latestMessage}". Additionally, populate "thinkingSteps" with 2-4 short bullets describing the reasoning or checks you just performed, and provide stage-specific guidance: Coach prompts that spark ideas, Editor checklist that surfaces gaps/risks, Writer summary that rewrites the draft for confirmation.',
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
