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

const scheduleSchema: JsonSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    date: { type: 'string' },
    startTime: { type: 'string' },
    endTime: { type: 'string' },
    location: { type: 'string' },
    duration: { type: 'string' },
  },
};

const publicDraftSchema: JsonSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    title: { type: 'string' },
    shortDescription: { type: 'string' },
    detailedDescription: { type: 'string' },
    schedule: scheduleSchema,
    price: { type: 'string' },
    capacity: { type: 'string' },
    signupNotes: { type: 'string' },
    registrationForm: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          type: { type: 'string' },
          required: { type: 'boolean' },
        },
        required: ['label', 'type'],
      },
    },
    visibility: { type: 'string' },
    requireApproval: { type: 'boolean' },
    enableWaitlist: { type: 'boolean' },
    requireCheckin: { type: 'boolean' },
    refundPolicy: { type: 'string' },
    riskNotice: { type: 'string' },
  },
  required: [
    'title',
    'shortDescription',
    'detailedDescription',
    'schedule',
    'price',
    'capacity',
    'signupNotes',
  ],
};

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

const uiMessageSchema: JsonSchema = { type: 'string' };

const uiCollectingSchema: JsonSchema = baseObject(
  {
    message: uiMessageSchema,
    question: uiQuestionSchema,
  },
  [],
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
  },
  ['message'],
);

const uiReadySchema: JsonSchema = baseObject({
  message: uiMessageSchema,
});

const slotUpdateSchema: JsonSchema = baseObject(
  {
    value: { type: 'string' },
    normalizedValue: { type: 'string' },
    confidenceDelta: { type: 'number' },
    evidenceText: { type: 'string' },
  },
  [],
);

const slotUpdatesSchema: JsonSchema = baseObject(
  {
    title: slotUpdateSchema,
    time: slotUpdateSchema,
    location: slotUpdateSchema,
    price: slotUpdateSchema,
    capacity: slotUpdateSchema,
    details: slotUpdateSchema,
    visibility: slotUpdateSchema,
    registrationForm: slotUpdateSchema,
    requireApproval: slotUpdateSchema,
    enableWaitlist: slotUpdateSchema,
    requireCheckin: slotUpdateSchema,
    refundPolicy: slotUpdateSchema,
    riskNotice: slotUpdateSchema,
  },
  [],
);

const slotAmbiguitySchema: JsonSchema = baseObject(
  {
    slotKey: { type: 'string' },
    candidates: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
    questionSuggestion: { type: 'string' },
  },
  ['slotKey', 'candidates'],
);

export const SLOT_NORMALIZER_SCHEMA: JsonSchemaWrapper = {
  name: 'EventAssistantSlotNormalizer',
  schema: baseObject(
    {
      intent: { type: 'string' },
      updates: slotUpdatesSchema,
      ambiguities: { type: 'array', items: slotAmbiguitySchema },
      shouldCloseSlot: { type: 'boolean' },
    },
    ['intent', 'updates', 'ambiguities', 'shouldCloseSlot'],
  ),
};

const COLLECT_OUTPUT_SCHEMA: JsonSchemaWrapper = {
  name: 'EventAssistantCollect',
  schema: baseObject(
    {
      ui: uiCollectingSchema,
      thinkingSteps: thinkingStepsSchema,
      coachPrompt: coachPromptSchema,
      writerSummary: writerSummarySchema,
    },
    ['ui'],
  ),
};

export const EVENT_ASSISTANT_OUTPUT_SCHEMA_BY_PHASE: Record<
  Exclude<EventAssistantPromptPhase, 'parse'>,
  JsonSchemaWrapper
> = {
  collect: COLLECT_OUTPUT_SCHEMA,
  ready: {
    name: 'EventAssistantReady',
    schema: baseObject(
      {
        ui: uiReadySchema,
        publicActivityDraft: publicDraftSchema,
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
        publicActivityDraft: publicDraftSchema,
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

export const getEventAssistantOutputSchema = (phase: EventAssistantPromptPhase): JsonSchemaWrapper => {
  if (phase === 'parse') return COLLECT_OUTPUT_SCHEMA;
  return EVENT_ASSISTANT_OUTPUT_SCHEMA_BY_PHASE[phase];
};

export const validateAssistantOutput = (
  phase: EventAssistantPromptPhase,
  payload: unknown,
): { valid: boolean; errors: string[] } => {
  const schema = getEventAssistantOutputSchema(phase)?.schema;
  if (!schema || !isObject(payload)) {
    return { valid: false, errors: ['payload_not_object'] };
  }
  const properties = schema.properties ?? {};
  const errors: string[] = [];
  Object.keys(payload).forEach((key) => {
    if (!properties[key]) errors.push(`unknown_field:${key}`);
  });
  const validateRequired = (schemaNode: JsonSchema, value: unknown, path: string) => {
    if (!schemaNode.required || !Array.isArray(schemaNode.required)) return;
    if (!isObject(value)) {
      schemaNode.required.forEach((req) => errors.push(`missing_required:${path}.${req}`));
      return;
    }
    schemaNode.required.forEach((req) => {
      if (!(req in value)) errors.push(`missing_required:${path}.${req}`);
    });
  };
  (schema.required ?? []).forEach((req) => {
    if (!(req in payload)) errors.push(`missing_required:${req}`);
  });
  Object.entries(properties).forEach(([key, node]) => {
    if (!node || typeof node !== 'object') return;
    const value = payload[key];
    validateRequired(node, value, key);
  });
  return { valid: errors.length === 0, errors };
};
