import type { EventDraft } from '../types/api';
import { SOCIALMORE_AI_CONSTITUTION_V1 } from './constitution';

export type EventAssistantStage = 'coach' | 'editor' | 'writer';

export interface BuildEventAssistantPromptOptions {
  draft?: Partial<EventDraft>;
  locale?: 'ja' | 'zh' | 'en';
  userName?: string;
  communityName?: string;
  explicitStage?: EventAssistantStage;
  lastUserUtterance?: string;
}

const REQUIRED_FIELDS: Array<keyof EventDraft> = [
  'title',
  'description',
  'startTime',
  'locationText',
  'ticketTypes',
  'visibility',
  'registrationFormSchema',
];

const BASE_PROMPT = `${SOCIALMORE_AI_CONSTITUTION_V1}

---
You are the SOCIALMORE Event Creation Assistant.
- Mission: understand the organizer's intention, encourage them when they hesitate, and then help them commit to clear written decisions.
- Persona: warm coach at first, precise editor later. Never turn the conversation into a rigid form.
- Languages: default to Japanese, but mirror the user's input language when possible.
- Process: Listen (感性) → Guide (構造化) → Write (草稿を提示) → Confirm (ユーザーに最終判断を委ねる).`;

const STAGE_PROMPTS: Record<EventAssistantStage, string> = {
  coach: `Current stage: 感性モード (Coach).
Goals:
- Surface the organizer's motivation, people they want to help, and desired vibe.
- Translate vague wishes into tangible goals.
- Ask one focused question at a time; do not rush into fields or checklists.
Forbidden:
- Empty hype (e.g., "必ず成功します").
- Ignoring obvious fears or blockers the organizer mentions.`,
  editor: `Current stage: 理性モード (Editor).
Goals:
- Organize concrete decisions (title, time, location, ticketing, requirements).
- Offer options with pros/cons when the organizer hesitates.
- Highlight contradictions or risks (e.g., "想要開放但又限定費用很高").
Guidelines:
- Provide concise bullet structures or A/B drafts.
- Ask clarifying questions only for the missing fields listed below.`,
  writer: `Current stage: ライティング / 確認.
Goals:
- Summarize the EventDraft so the organizer can confirm or adjust.
- Clearly list every key field (title, schedule, ticketing, requirements, notes).
- Invite the organizer to edit specific parts instead of rewriting everything.
If something is still missing, politely mention it before presenting the summary.`,
};

const OUTPUT_INSTRUCTIONS = `Reply with:
1) A short natural-language response following the current stage instructions.
2) If you update the draft, append a JSON block using \`\`\`json ... \`\`\` that contains { "type": "event_draft_update", "data": Partial<EventDraft> }.
Never invent data that the organizer has not provided.`;

export function determineEventAssistantStage(draft?: Partial<EventDraft>): EventAssistantStage {
  if (!draft) return 'coach';
  const hasSeedInfo = Boolean(
    (typeof draft.title === 'string' && draft.title.trim()) ||
      draft.purpose ||
      draft.description ||
      draft.category ||
      draft.targetAudience,
  );
  const hasRequired = REQUIRED_FIELDS.every((field) => {
    const value = draft[field];
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  });

  if (!hasSeedInfo) return 'coach';
  if (!hasRequired) return 'editor';
  return 'writer';
}

function summarizeDraft(draft?: Partial<EventDraft>): string {
  if (!draft) return 'No draft data yet.';
  const parts: string[] = [];
  if (draft.title) parts.push(`Title: ${stringifyContent(draft.title)}`);
  if (draft.subtitle) parts.push(`Subtitle: ${stringifyContent(draft.subtitle)}`);
  if (draft.purpose) parts.push(`Purpose: ${stringifyContent(draft.purpose)}`);
  if (draft.description) parts.push(`Description: ${stringifyContent(draft.description)}`);
  if (draft.startTime) parts.push(`Start: ${draft.startTime}`);
  if (draft.endTime) parts.push(`End: ${draft.endTime}`);
  if (draft.locationText) parts.push(`Location: ${draft.locationText}`);
  if (draft.ticketTypes && draft.ticketTypes.length) {
    const summary = draft.ticketTypes
      .map((ticket) => `${stringifyContent(ticket.name)} ¥${ticket.price ?? 0}`)
      .join(', ');
    parts.push(`Ticketing: ${summary}`);
  }
  if (draft.requirements && draft.requirements.length) {
    parts.push(`Requirements: ${draft.requirements.map((req) => req.label).join(', ')}`);
  }
  if (draft.config?.riskNoticeEnabled) parts.push('Risk notice is enabled.');
  return parts.length ? parts.join('\n') : 'Draft exists but has no descriptive fields yet.';
}

function stringifyContent(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'original' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).original ?? '');
  }
  return JSON.stringify(value);
}

function missingFieldReport(draft?: Partial<EventDraft>): string {
  if (!draft) return 'All fields missing.';
  const missing = REQUIRED_FIELDS.filter((field) => {
    const value = draft[field];
    if (value == null) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'string') return value.trim().length === 0;
    return false;
  });
  if (!missing.length) return 'Required fields are present.';
  return `Fields still missing: ${missing.join(', ')}`;
}

export function buildEventAssistantPrompt(options: BuildEventAssistantPromptOptions) {
  const stage = options.explicitStage ?? determineEventAssistantStage(options.draft);
  const localeLine =
    options.locale === 'zh'
      ? '回答は簡体字中文でもよいですが、ユーザーの入力言語に合わせてください。'
      : options.locale === 'en'
        ? 'Respond in English unless the organizer prefers Japanese.'
        : '回答は日本語をベースに、ユーザーの言語に合わせてカスタマイズしてください。';

  const actorContext = [
    options.userName ? `Organizer: ${options.userName}` : null,
    options.communityName ? `Community: ${options.communityName}` : null,
    options.lastUserUtterance ? `Latest user message: ${options.lastUserUtterance}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = [
    BASE_PROMPT,
    localeLine,
    STAGE_PROMPTS[stage],
    `Draft context:\n${summarizeDraft(options.draft)}`,
    missingFieldReport(options.draft),
    OUTPUT_INSTRUCTIONS,
  ]
    .concat(actorContext ? [`\nContext:\n${actorContext}`] : [])
    .join('\n\n');

  return { stage, prompt };
}
