export const EVENT_CATEGORY_OPTIONS = [
  { value: 'sport', label: 'スポーツ・健康・アウトドア' },
  { value: 'campus', label: '大学サークル / キャンパス' },
  { value: 'social', label: '交流・趣味' },
  { value: 'business', label: 'ビジネス・起業・キャリア' },
  { value: 'tech', label: 'テック / IT / AI' },
  { value: 'art', label: 'アート / 文化 / デザイン' },
  { value: 'music', label: '音楽 / パフォーマンス / エンタメ' },
  { value: 'food', label: '美食 / 飲み物' },
  { value: 'family', label: '家庭 / 親子 / 教育' },
  { value: 'language', label: '語学 / 学習 / 研修' },
  { value: 'public', label: '公益 / コミュニティ支援' },
  { value: 'mind', label: '宗教 / マインド / 成長' },
  { value: 'online', label: 'オンライン / ワークショップ / その他' },
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
