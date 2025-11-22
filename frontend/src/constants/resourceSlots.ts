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
    label: '品牌 Logo',
    page: '全局导航',
    pageId: 'global-nav',
    position: '移动端顶部品牌标识',
    description: '显示在移动端顶部栏左侧的品牌标识，可放置透明底 PNG 或 SVG。',
    helper: '建议高 44px 以内，自动按比例缩放。',
    type: 'image',
    defaultValue: '',
  },
  {
    id: 'icon.tab.events',
    label: 'Tab 图标 · 活动',
    page: '移动端底部导航',
    pageId: 'mobile-tabbar',
    position: '活动 Tab 图标',
    description: '支持任意图标类名，例如 i-lucide 系列。',
    type: 'icon',
    defaultValue: 'i-lucide-calendar-days',
  },
  {
    id: 'icon.tab.console',
    label: 'Tab 图标 · Console',
    page: '移动端底部导航',
    pageId: 'mobile-tabbar',
    position: 'Console Tab 图标',
    description: '适用于主理人/管理员可见的 Console Tab。',
    type: 'icon',
    defaultValue: 'i-lucide-layout-dashboard',
  },
  {
    id: 'icon.tab.me',
    label: 'Tab 图标 · 我的',
    page: '移动端底部导航',
    pageId: 'mobile-tabbar',
    position: '我的 Tab 图标',
    type: 'icon',
    defaultValue: 'i-lucide-user-round',
  },
  {
    id: 'icon.tab.admin',
    label: 'Tab 图标 · 管理',
    page: '移动端底部导航',
    pageId: 'mobile-tabbar',
    position: '管理员 Tab 图标',
    type: 'icon',
    defaultValue: 'i-lucide-shield',
  },
  {
    id: 'global.defaultAvatar',
    label: '默认头像',
    page: '全局用户/社区',
    pageId: 'global-avatar',
    position: '参与者、社区徽标的占位头像',
    description: '当用户或社区没有上传头像时，使用该图片作为兜底。',
    helper: '建议 128×128 正方形 PNG/SVG。',
    type: 'image',
    defaultValue: 'https://raw.githubusercontent.com/moreard/dev-assets/main/socialmore/default-avatar.png',
  },
  {
    id: 'mobile.eventDetail.heroFallback',
    label: '活动详情封面',
    page: '移动端 · 活动详情',
    pageId: 'mobile-event-detail',
    position: '顶部封面占位图',
    description: '活动未上传封面时使用，可为 JPG/PNG/GIF 或静态插画。',
    helper: '建议 16:9，至少 1200×675。',
    type: 'image',
    defaultValue: 'https://placehold.co/640x360?text=Event',
  },
  {
    id: 'mobile.eventList.cardFallbacks',
    label: '活动列表封面合集',
    page: '移动端 · 活动列表/我的活动',
    pageId: 'mobile-event-list',
    position: '活动卡片封面轮换',
    description: '当活动无封面时，从列表中按顺序选一张作为展示背景。',
    helper: '每行一个图片地址，支持任意数量。',
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
    label: 'Console 成员头像',
    page: '移动端 · Console',
    pageId: 'mobile-console',
    position: '活动管理参与者占位头像',
    description: 'Console 中展示成员列表时使用的兜底头像。',
    type: 'image',
    defaultValue: 'https://placehold.co/64x64?text=Member',
  },
  {
    id: 'mobile.communityPortal.heroImage',
    label: '社群门户 Hero 背景',
    page: '移动端 · 社群门户',
    pageId: 'mobile-community-portal',
    position: '顶部背景图',
    description: '当社群未上传专属封面时使用。系统会自动叠加品牌渐变。',
    helper: '建议 1400×800，视觉主体居中。',
    type: 'image',
    defaultValue: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1400&q=80',
  },
  {
    id: 'mobile.communityPortal.highlightImage',
    label: '社群精彩瞬间',
    page: '移动端 · 社群门户',
    pageId: 'mobile-community-portal',
    position: '精彩瞬间占位图',
    description: '展示“精彩瞬间”模块时，当没有真实图片可用的默认素材。',
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
