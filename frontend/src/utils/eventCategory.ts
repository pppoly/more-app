export const EVENT_CATEGORY_OPTIONS = [
  { value: 'sport', label: 'スポーツ・外遊び' },
  { value: 'campus', label: '大学・キャンパス' },
  { value: 'social', label: '交流・趣味' },
  { value: 'business', label: '仕事・キャリア' },
  { value: 'tech', label: 'テック' },
  { value: 'art', label: 'アート・カルチャー' },
  { value: 'music', label: '音楽・ライブ' },
  { value: 'food', label: 'たべもの・のみもの' },
  { value: 'family', label: '親子・子育て' },
  { value: 'language', label: '語学・学び' },
  { value: 'public', label: 'ボランティア・地域' },
  { value: 'mind', label: '心と成長' },
  { value: 'online', label: 'オンライン・WS' },
] as const;

export type EventCategoryId = (typeof EVENT_CATEGORY_OPTIONS)[number]['value'];

const CATEGORY_ID_SET = new Set(EVENT_CATEGORY_OPTIONS.map((cat) => cat.value));
const LEGACY_CATEGORY_MAP: Record<string, EventCategoryId> = {
  hiking: 'sport',
  running: 'sport',
  cycling: 'sport',
  camping: 'sport',
  water: 'sport',
  kids: 'family',
  other: 'online',
  sports: 'sport',
  career: 'business',
};

export const normalizeEventCategory = (value?: string | null) => {
  if (!value) return '';
  const key = value.trim().toLowerCase();
  if (CATEGORY_ID_SET.has(key as EventCategoryId)) return key;
  const mapped = LEGACY_CATEGORY_MAP[key];
  if (mapped) return mapped;
  return value.trim();
};

export const getEventCategoryLabel = (value?: string | null, fallback = '') => {
  const normalized = normalizeEventCategory(value);
  const found = EVENT_CATEGORY_OPTIONS.find((cat) => cat.value === normalized);
  if (found) return found.label;
  if (normalized) return normalized;
  return fallback;
};
