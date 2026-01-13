import type { Slots } from './ai.service';
import { SLOT_NORMALIZER_SCHEMA } from './event-assistant.schemas';

export type SlotNormalizerUpdate = {
  value?: string;
  normalizedValue?: string;
  confidenceDelta?: number;
  evidenceText?: string;
};

export type SlotNormalizerAmbiguity = {
  slotKey: keyof Slots;
  candidates: string[];
  questionSuggestion?: string;
};

export type SlotNormalizerResult = {
  intent: 'answer' | 'complaint' | 'change_request' | 'meta';
  updates: Partial<Record<keyof Slots, SlotNormalizerUpdate>>;
  ambiguities: SlotNormalizerAmbiguity[];
  shouldCloseSlot: boolean;
};

export const buildSlotNormalizerPrompt = (params: {
  rawUserText: string;
  currentSlots: Slots;
  currentNextQuestionKey?: keyof Slots | null;
  recentTurns: Array<{ key: string; answer: string }>;
}) => {
  const systemPrompt =
    'You are a slot normalizer for an event assistant. ' +
    'Only normalize/interpret the user input for the current slot. ' +
    'Do NOT decide conversation flow. ' +
    'Return JSON that strictly matches the schema. ' +
    'If user is complaining/confused, set intent=complaint or meta. ' +
    'Normalize values for price/time/location/visibility. ' +
    'Price: normalize to "無料" or "{number}円". ' +
    'Time: keep human-friendly text, prefer "8:00-12:00" format. ' +
    'Location: map online/zoom/line to "オンライン". ' +
    'Visibility: map to "公開"/"コミュニティ内限定"/"招待制"/"非公開".';
  const userPayload = {
    rawUserText: params.rawUserText,
    currentNextQuestionKey: params.currentNextQuestionKey ?? null,
    currentSlots: params.currentSlots,
    recentTurns: params.recentTurns,
  };
  return { systemPrompt, userPayload, schema: SLOT_NORMALIZER_SCHEMA };
};
