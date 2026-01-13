import type { EventAssistantPromptPhase } from './prompt.config';

export type JsonSchema = {
  type: string;
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  minItems?: number;
  maxItems?: number;
};

export type JsonSchemaWrapper = {
  name: string;
  schema: JsonSchema;
};

const baseObject = (properties: Record<string, JsonSchema>, required?: string[]): JsonSchema => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: required ?? [],
});

const thinkingStepsSchema: JsonSchema = {
  type: 'array',
  items: { type: 'string' },
  minItems: 2,
  maxItems: 6,
};

const coachPromptSchema: JsonSchema = { type: 'string' };
const writerSummarySchema: JsonSchema = { type: 'string' };

const draftSchema: JsonSchema = {
  type: 'object',
  additionalProperties: true,
};

const uiQuestionSchema: JsonSchema = baseObject(
  {
    key: { type: 'string' },
    text: { type: 'string' },
  },
  ['key', 'text'],
);

const uiOptionSchema: JsonSchema = baseObject(
  {
    label: { type: 'string' },
    value: { type: 'string' },
    recommended: { type: 'boolean' },
  },
  ['label', 'value'],
);

const uiMessageSchema: JsonSchema = { type: 'string' };

const uiCollectingSchema: JsonSchema = baseObject(
  {
    message: uiMessageSchema,
    question: uiQuestionSchema,
  },
  ['question'],
);

const uiDecisionSchema: JsonSchema = baseObject(
  {
    message: uiMessageSchema,
  },
  [],
);

const uiCompareSchema: JsonSchema = baseObject(
  {
    message: uiMessageSchema,
    options: {
      type: 'array',
      minItems: 2,
      maxItems: 3,
      items: uiOptionSchema,
    },
  },
  ['message', 'options'],
);

const uiReadySchema: JsonSchema = baseObject({
  message: uiMessageSchema,
});

export const EVENT_ASSISTANT_OUTPUT_SCHEMA_BY_PHASE: Record<
  EventAssistantPromptPhase,
  JsonSchemaWrapper
> = {
  collecting: {
    name: 'EventAssistantCollecting',
    schema: baseObject(
      {
        ui: uiCollectingSchema,
        thinkingSteps: thinkingStepsSchema,
        coachPrompt: coachPromptSchema,
        writerSummary: writerSummarySchema,
      },
      ['ui'],
    ),
  },
  decision: {
    name: 'EventAssistantDecision',
    schema: baseObject(
      {
        ui: uiDecisionSchema,
        thinkingSteps: thinkingStepsSchema,
        coachPrompt: coachPromptSchema,
        writerSummary: writerSummarySchema,
      },
      [],
    ),
  },
  compare: {
    name: 'EventAssistantCompare',
    schema: baseObject(
      {
        ui: uiCompareSchema,
        thinkingSteps: thinkingStepsSchema,
        writerSummary: writerSummarySchema,
      },
      ['ui'],
    ),
  },
  ready: {
    name: 'EventAssistantReady',
    schema: baseObject(
      {
        ui: uiReadySchema,
        publicActivityDraft: draftSchema,
        internalExecutionPlan: draftSchema,
        writerSummary: writerSummarySchema,
        coachPrompt: coachPromptSchema,
      },
      ['publicActivityDraft', 'internalExecutionPlan'],
    ),
  },
  operate: {
    name: 'EventAssistantOperate',
    schema: baseObject(
      {
        ui: uiReadySchema,
        publicActivityDraft: draftSchema,
        internalExecutionPlan: draftSchema,
        writerSummary: writerSummarySchema,
        coachPrompt: coachPromptSchema,
      },
      ['publicActivityDraft', 'internalExecutionPlan'],
    ),
  },
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const getEventAssistantOutputSchema = (phase: EventAssistantPromptPhase): JsonSchemaWrapper =>
  EVENT_ASSISTANT_OUTPUT_SCHEMA_BY_PHASE[phase];

export const validateAssistantOutput = (
  phase: EventAssistantPromptPhase,
  payload: unknown,
): { valid: boolean; errors: string[] } => {
  const schema = EVENT_ASSISTANT_OUTPUT_SCHEMA_BY_PHASE[phase]?.schema;
  if (!schema || !isObject(payload)) {
    return { valid: false, errors: ['payload_not_object'] };
  }
  const properties = schema.properties ?? {};
  const errors: string[] = [];
  Object.keys(payload).forEach((key) => {
    if (!properties[key]) errors.push(`unknown_field:${key}`);
  });
  (schema.required ?? []).forEach((req) => {
    if (!(req in payload)) errors.push(`missing_required:${req}`);
  });
  return { valid: errors.length === 0, errors };
};
