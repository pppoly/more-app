export type ResourceValueType = 'image' | 'image-list' | 'icon';

export type ResourceGroupId =
  | 'global-nav'
  | 'mobile-tabbar'
  | 'global-avatar'
  | 'mobile-event-detail'
  | 'mobile-event-list'
  | 'mobile-console'
  | 'mobile-community-portal';

export interface ResourceSlot {
  id: ResourceKey;
  label: string;
  page: string;
  pageId: ResourceGroupId;
  position: string;
  description?: string;
  helper?: string;
  type: ResourceValueType;
  defaultValue: string | string[];
}

export const RESOURCE_SLOTS = [
  {
    id: 'brand.logo',
    label: 'ブランドロゴ',
    page: 'グローバルナビ',
    pageId: 'global-nav',
    position: 'モバイル上部のブランド表示',
    description: 'モバイル上部バー左側に表示するブランドロゴ。透過 PNG / SVG に対応。',
    helper: '高さ 44px 以内推奨。自動で比率調整。',
    type: 'image',
    defaultValue: '',
  },
  {
    id: 'icon.tab.events',
    label: 'タブアイコン・イベント',
    page: 'モバイル下部ナビ',
    pageId: 'mobile-tabbar',
    position: 'イベントタブのアイコン',
    description: '任意のアイコンクラス名に対応（例: i-lucide 系）。',
    type: 'icon',
    defaultValue: 'i-lucide-calendar-days',
  },
  {
    id: 'icon.tab.console',
    label: 'タブアイコン・Console',
    page: 'モバイル下部ナビ',
    pageId: 'mobile-tabbar',
    position: 'Consoleタブのアイコン',
    description: '主催者/管理者向けのConsoleタブに使用。',
    type: 'icon',
    defaultValue: 'i-lucide-layout-dashboard',
  },
  {
    id: 'icon.tab.me',
    label: 'タブアイコン・マイページ',
    page: 'モバイル下部ナビ',
    pageId: 'mobile-tabbar',
    position: 'マイページタブのアイコン',
    type: 'icon',
    defaultValue: 'i-lucide-user-round',
  },
  {
    id: 'icon.tab.admin',
    label: 'タブアイコン・管理',
    page: 'モバイル下部ナビ',
    pageId: 'mobile-tabbar',
    position: '管理者タブのアイコン',
    type: 'icon',
    defaultValue: 'i-lucide-shield',
  },
  {
    id: 'global.defaultAvatar',
    label: 'デフォルトアバター',
    page: 'ユーザー/コミュニティ共通',
    pageId: 'global-avatar',
    position: '参加者・コミュニティのプレースホルダー',
    description: 'ユーザー/コミュニティが未設定の場合の表示に使用。',
    helper: '128×128 正方形 PNG/SVG 推奨。',
    type: 'image',
    defaultValue: '/assets/default-avatar.png',
  },
  {
    id: 'mobile.eventDetail.heroFallback',
    label: 'イベント詳細カバー',
    page: 'モバイル・イベント詳細',
    pageId: 'mobile-event-detail',
    position: '上部カバーのプレースホルダー',
    description: 'イベントにカバー未設定の場合の表示。JPG/PNG/GIF/静止画対応。',
    helper: '16:9推奨、1200×675以上。',
    type: 'image',
    defaultValue: 'https://placehold.co/640x360?text=Event',
  },
  {
    id: 'mobile.eventList.cardFallbacks',
    label: 'イベント一覧カバーセット',
    page: 'モバイル・イベント一覧/マイイベント',
    pageId: 'mobile-event-list',
    position: 'イベントカードのカバー循環',
    description: 'イベントにカバー未設定の場合、リストから順番に背景として使用。',
    helper: '1行に1つの画像URL、件数制限なし。',
    type: 'image-list',
    defaultValue: [
      'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1448932223592-d1fc686e76ea?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1515168833906-d2a3b82b302a?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1454165205744-3b78555e5572?auto=format&fit=crop&w=1200&q=80',
    ],
  },
  {
    id: 'mobile.console.memberAvatar',
    label: 'Console メンバーアバター',
    page: 'モバイル・Console',
    pageId: 'mobile-console',
    position: 'イベント管理の参加者プレースホルダー',
    description: 'Consoleでメンバー一覧を表示する際のデフォルト画像。',
    type: 'image',
    defaultValue: 'https://placehold.co/64x64?text=Member',
  },
  {
    id: 'mobile.communityPortal.heroImage',
    label: 'コミュニティポータル Hero 背景',
    page: 'モバイル・コミュニティポータル',
    pageId: 'mobile-community-portal',
    position: '上部背景',
    description: 'コミュニティに専用カバーがない場合に使用。ブランドグラデを自動合成。',
    helper: '1400×800推奨、主題は中央。',
    type: 'image',
    defaultValue: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1400&q=80',
  },
  {
    id: 'mobile.communityPortal.highlightImage',
    label: 'コミュニティのハイライト',
    page: 'モバイル・コミュニティポータル',
    pageId: 'mobile-community-portal',
    position: 'ハイライトのプレースホルダー',
    description: '「ハイライト」表示時、画像がない場合のデフォルト。',
    type: 'image',
    defaultValue: 'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=800&q=80',
  },
] as const;

export type ResourceSlotDefinition = (typeof RESOURCE_SLOTS)[number];
export type ResourceKey = ResourceSlotDefinition['id'];

export type ResourceValue = string | string[];

export const RESOURCE_SLOT_MAP = RESOURCE_SLOTS.reduce(
  (acc, slot) => {
    acc[slot.id] = slot;
    return acc;
  },
  {} as Record<ResourceKey, ResourceSlotDefinition>,
);
