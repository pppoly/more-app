export type EventStatusState = 'open' | 'before' | 'closed' | 'full' | 'ended' | 'cancelled';

export type EventStatusSource = {
  status?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  regStartTime?: string | null;
  regEndTime?: string | null;
  regDeadline?: string | null;
  maxParticipants?: number | null;
  config?: Record<string, any> | null;
};

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getConfig = (source: EventStatusSource) => {
  if (source.config && typeof source.config === 'object') {
    return source.config as Record<string, any>;
  }
  return {};
};

const getCapacity = (source: EventStatusSource, config: Record<string, any>) => {
  const configCapacity =
    typeof config.capacity === 'number'
      ? config.capacity
      : typeof config.maxParticipants === 'number'
        ? config.maxParticipants
        : null;
  const capacity =
    typeof source.maxParticipants === 'number'
      ? source.maxParticipants
      : typeof configCapacity === 'number'
        ? configCapacity
        : null;
  return typeof capacity === 'number' && Number.isFinite(capacity) ? capacity : null;
};

const getCurrentParticipants = (config: Record<string, any>) => {
  const candidates = [
    config.currentParticipants,
    config.currentAttendees,
    config.regCount,
    config.participantCount,
  ];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  if (Array.isArray(config.participants)) return config.participants.length;
  if (Array.isArray(config.attendeeAvatars)) return config.attendeeAvatars.length;
  return 0;
};

export const resolveEventStatusState = (source: EventStatusSource, now = new Date()): EventStatusState => {
  const status = source.status ?? null;
  if (status === 'cancelled') return 'cancelled';

  const endTime = parseDate(source.endTime);
  if (endTime && now > endTime) return 'ended';

  if (status && status !== 'open') return 'closed';

  const regStartTime = parseDate(source.regStartTime);
  if (regStartTime && now < regStartTime) return 'before';

  const regEndTime = parseDate(source.regEndTime ?? source.regDeadline);
  if (regEndTime && now > regEndTime) return 'closed';

  const config = getConfig(source);
  const capacity = getCapacity(source, config);
  const currentParticipants = getCurrentParticipants(config);
  if (capacity !== null && capacity > 0 && currentParticipants >= capacity) return 'full';

  return 'open';
};

export const getEventStatusLabel = (state: EventStatusState) => {
  switch (state) {
    case 'open':
      return '受付中';
    case 'before':
      return '受付前';
    case 'closed':
      return '受付終了';
    case 'full':
      return '満席';
    case 'ended':
      return '終了';
    case 'cancelled':
      return '中止';
    default:
      return '受付終了';
  }
};

export const getEventStatus = (source: EventStatusSource, now = new Date()) => {
  const state = resolveEventStatusState(source, now);
  return { state, label: getEventStatusLabel(state) };
};
