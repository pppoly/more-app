export type AssistantLogMessage = {
  id?: string | null;
  clientMessageId?: string | null;
  role?: string | null;
  type?: string | null;
  content?: string | null;
  contentText?: string | null;
  contentJson?: unknown | null;
  createdAt?: string | null;
  serverCreatedAt?: string | null;
  status?: 'pending' | 'sent' | 'failed' | string | null;
  action?: string | null;
  payload?: unknown;
  thinkingSteps?: string[] | null;
  coachPrompts?: string[] | null;
  editorChecklist?: string[] | null;
  writerSummary?: unknown;
  confirmQuestions?: string[] | null;
};

const statusRank: Record<string, number> = {
  pending: 0,
  failed: 1,
  sent: 2,
};

const toArray = (value: unknown): AssistantLogMessage[] => (Array.isArray(value) ? (value as AssistantLogMessage[]) : []);

const normalizeMessage = (message: AssistantLogMessage, nowIso: string): AssistantLogMessage => {
  const normalized: AssistantLogMessage = { ...message };
  if (!normalized.id && normalized.clientMessageId) {
    normalized.id = normalized.clientMessageId;
  }
  if (!normalized.contentText && normalized.content) {
    normalized.contentText = normalized.content;
  }
  if (!normalized.content && normalized.contentText) {
    normalized.content = normalized.contentText;
  }
  if (!normalized.createdAt) {
    normalized.createdAt = nowIso;
  }
  if (!normalized.serverCreatedAt) {
    normalized.serverCreatedAt = nowIso;
  }
  return normalized;
};

const pickStatus = (a?: string | null, b?: string | null) => {
  if (!a && !b) return undefined;
  if (!a) return b ?? undefined;
  if (!b) return a ?? undefined;
  return (statusRank[b] ?? -1) >= (statusRank[a] ?? -1) ? b : a;
};

const mergeMessage = (base: AssistantLogMessage, incoming: AssistantLogMessage, nowIso: string) => {
  const merged: AssistantLogMessage = {
    ...base,
    ...incoming,
  };
  const baseContentText = base.contentText ?? base.content ?? '';
  const incomingContentText = incoming.contentText ?? incoming.content ?? '';
  if (incomingContentText.length >= baseContentText.length) {
    merged.contentText = incomingContentText;
    merged.content = incomingContentText;
  } else {
    merged.contentText = baseContentText;
    merged.content = baseContentText;
  }
  if (incoming.contentJson !== undefined && incoming.contentJson !== null) {
    merged.contentJson = incoming.contentJson;
  } else if (base.contentJson !== undefined) {
    merged.contentJson = base.contentJson;
  }
  merged.status = pickStatus(base.status, incoming.status);
  merged.serverCreatedAt = base.serverCreatedAt || incoming.serverCreatedAt || nowIso;
  merged.createdAt = base.createdAt || incoming.createdAt || nowIso;
  return merged;
};

const messageKey = (message: AssistantLogMessage) => {
  return (
    message.id ||
    message.clientMessageId ||
    `${message.role ?? 'unknown'}:${message.createdAt ?? ''}:${(message.contentText ?? message.content ?? '').slice(
      0,
      48,
    )}`
  );
};

export const mergeAssistantMessages = (
  existing: unknown,
  incoming: unknown,
  now = new Date(),
): AssistantLogMessage[] => {
  const nowIso = now.toISOString();
  const mergedMap = new Map<string, AssistantLogMessage>();
  const upsert = (msg: AssistantLogMessage) => {
    const normalized = normalizeMessage(msg, nowIso);
    const key = messageKey(normalized);
    const current = mergedMap.get(key);
    if (!current) {
      mergedMap.set(key, normalized);
      return;
    }
    mergedMap.set(key, mergeMessage(current, normalized, nowIso));
  };
  toArray(existing).forEach((msg) => upsert(msg));
  toArray(incoming).forEach((msg) => upsert(msg));
  return Array.from(mergedMap.values()).sort((a, b) => {
    const ta = Date.parse(a.serverCreatedAt ?? a.createdAt ?? '');
    const tb = Date.parse(b.serverCreatedAt ?? b.createdAt ?? '');
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) {
      return ta - tb;
    }
    return messageKey(a).localeCompare(messageKey(b));
  });
};
