export type RouterResult = {
  route: 'EVENT_INFO' | 'HELP_SYSTEM' | 'HELP_WHAT_NEXT' | 'HELP_HOWTO' | 'CANCEL' | 'OTHER';
  confidence: number;
  language: 'ja' | 'zh' | 'en';
};

export const ROUTER_SCHEMA = {
  name: 'assistant_router',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      route: {
        type: 'string',
        enum: ['EVENT_INFO', 'HELP_SYSTEM', 'HELP_WHAT_NEXT', 'HELP_HOWTO', 'CANCEL', 'OTHER'],
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
      },
      language: {
        type: 'string',
        enum: ['ja', 'zh', 'en'],
      },
    },
    required: ['route', 'confidence', 'language'],
  },
} as const;

export const buildRouterPrompt = (params: {
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>;
  userText: string;
}) => {
  const systemPrompt =
    'You are a routing classifier for an event assistant. ' +
    'Decide ONLY the route, confidence, and language. ' +
    'Do NOT output any event fields (title/time/price/etc). ' +
    'Route definitions: ' +
    'EVENT_INFO = user provides event details or answers a field question. ' +
    'HELP_SYSTEM = user asks what this feature/system is or how it works. ' +
    'HELP_HOWTO = user asks how to use or what to do next. ' +
    'HELP_WHAT_NEXT = user asks what to do next or why they must choose (legacy label). ' +
    'CANCEL = user wants to stop/exit/cancel. ' +
    'OTHER = none of the above. ' +
    'Return strict JSON per schema.';
  const userPayload = {
    userText: params.userText,
    conversation: params.conversation.slice(-6).map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  };
  return { systemPrompt, userPayload, schema: ROUTER_SCHEMA };
};
