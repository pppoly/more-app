import type { EventDraft } from '../api';

/**
 * JSON Schema describing the EventDraft payload shared between the AI assistant,
 * console creation forms, and backend validators. The schema intentionally keeps
 * fields flexible (accepting localized objects or plain strings) so both AI and
 * humans can collaborate on the same draft structure.
 */
export const eventDraftSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.socialmore.app/eventDraft.schema.json',
  title: 'EventDraft',
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'startTime', 'locationText', 'ticketTypes', 'visibility', 'registrationFormSchema'],
  properties: {
    id: { type: 'string' },
    communityId: { type: 'string' },
    status: {
      type: 'string',
      enum: ['draft', 'ready', 'published', 'open', 'closed', 'archived'],
    },
    title: { $ref: '#/definitions/localizedContentOrString' },
    subtitle: { $ref: '#/definitions/localizedContentOrString' },
    purpose: { $ref: '#/definitions/localizedContentOrString' },
    description: { $ref: '#/definitions/localizedContentOrString' },
    descriptionHtml: { type: 'string' },
    targetAudience: { type: 'string' },
    languages: {
      type: 'array',
      items: { type: 'string' },
    },
    format: {
      type: 'string',
      enum: ['online', 'offline', 'hybrid'],
    },
    startTime: { type: 'string', format: 'date-time' },
    endTime: { type: 'string', format: 'date-time' },
    regStartTime: { type: 'string', format: 'date-time' },
    regEndTime: { type: 'string', format: 'date-time' },
    regDeadline: { type: 'string', format: 'date-time' },
    locationText: { type: 'string' },
    locationLat: { type: ['number', 'null'] },
    locationLng: { type: ['number', 'null'] },
    category: { type: 'string' },
    minParticipants: { type: ['number', 'null'], minimum: 0 },
    maxParticipants: { type: ['number', 'null'], minimum: 0 },
    capacity: { type: ['number', 'null'], minimum: 0 },
    vibe: { type: 'string' },
    isFree: { type: 'boolean' },
    ticketTypes: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/definitions/eventTicketDraft' },
    },
    scheduleOutline: {
      type: 'array',
      items: { $ref: '#/definitions/eventScheduleEntry' },
    },
    requirements: {
      type: 'array',
      items: { $ref: '#/definitions/eventRequirement' },
    },
    bringList: {
      type: 'array',
      items: { type: 'string' },
    },
    riskNotice: { type: 'string' },
    refundPolicy: { type: 'string' },
    visibility: {
      type: 'string',
      enum: ['public', 'community-only', 'private'],
    },
    requireApproval: { type: 'boolean' },
    config: { $ref: '#/definitions/eventDraftConfig' },
    registrationFormSchema: {
      type: 'array',
      items: { $ref: '#/definitions/registrationFormField' },
    },
    aiSummary: { type: 'string' },
    versionNotes: { type: 'string' },
  },
  definitions: {
    localizedContent: {
      type: 'object',
      properties: {
        original: { type: 'string' },
      },
      additionalProperties: true,
    },
    localizedContentOrString: {
      anyOf: [{ type: 'string' }, { $ref: '#/definitions/localizedContent' }],
    },
    eventTicketDraft: {
      type: 'object',
      required: ['name', 'price'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        name: { $ref: '#/definitions/localizedContentOrString' },
        type: { type: 'string' },
        price: { type: 'number', minimum: 0 },
        currency: { type: 'string' },
        quota: { type: ['number', 'null'], minimum: 0 },
        description: { type: 'string' },
      },
    },
    eventScheduleEntry: {
      type: 'object',
      required: ['label'],
      additionalProperties: false,
      properties: {
        start: { type: 'string', format: 'date-time' },
        label: { type: 'string' },
        description: { type: 'string' },
      },
    },
    eventRequirement: {
      type: 'object',
      required: ['label'],
      additionalProperties: false,
      properties: {
        label: { type: 'string' },
        type: { type: 'string', enum: ['must', 'nice-to-have'] },
      },
    },
    registrationFormField: {
      type: 'object',
      required: ['label', 'type'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        label: { type: 'string' },
        type: { type: 'string' },
        required: { type: 'boolean' },
        placeholder: { type: 'string' },
        options: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
    eventDraftConfig: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requireCheckin: { type: 'boolean' },
        enableWaitlist: { type: 'boolean' },
        visibleRange: {
          type: 'string',
          enum: ['public', 'community', 'private'],
        },
        notes: { type: 'string' },
        riskNoticeEnabled: { type: 'boolean' },
        riskNoticeText: { type: 'string' },
        refundPolicy: { type: 'string' },
      },
    },
  },
} as const satisfies Record<string, unknown>;

export type EventDraftSchema = typeof eventDraftSchema;

export type EventDraftFromSchema = EventDraft;
