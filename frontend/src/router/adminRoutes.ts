import type { RouteRecordRaw } from 'vue-router';
import AdminHome from '../views/admin/AdminHome.vue';
import AdminResourceManager from '../views/admin/AdminResourceManager.vue';
import AdminResourceGroup from '../views/admin/AdminResourceGroup.vue';

export const adminRoutes: RouteRecordRaw[] = [
  {
    path: '/admin',
    name: 'admin-home',
    component: AdminHome,
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      hideShellHeader: true,
      flushContent: true,
      devPageName: '管理者ホーム',
    },
  },
  {
    path: '/admin/resources',
    name: 'admin-resource-manager',
    component: AdminResourceManager,
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      hideShellHeader: true,
      flushContent: true,
      devPageName: 'リソース設定',
    },
  },
  {
    path: '/admin/resources/:groupId',
    name: 'admin-resource-group',
    component: AdminResourceGroup,
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      hideShellHeader: true,
      devPageName: 'リソース設定詳細',
    },
    props: true,
  },
  {
    path: '/admin/ai',
    name: 'admin-ai-overview',
    component: () => import('../views/admin/AdminAiOverview.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, hideShellHeader: true, flushContent: true, devPageName: 'AI 利用概要' },
  },
  {
    path: '/admin/ai/console',
    name: 'admin-ai-console',
    component: () => import('../views/admin/AdminAiConsole.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      hideShellHeader: true,
      flushContent: true,
      devPageName: 'AI コンソール',
    },
  },
  {
    path: '/admin/ai/prompts',
    name: 'admin-ai-prompts',
    component: () => import('../views/admin/AdminAiPrompts.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      hideShellHeader: true,
      flushContent: true,
      devPageName: 'AI Prompt 管理',
    },
  },
  {
    path: '/admin/ai/:moduleId',
    name: 'admin-ai-detail',
    component: () => import('../views/admin/AdminAiModuleDetail.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, hideShellHeader: true, flushContent: true, devPageName: 'AI 利用詳細' },
    props: true,
  },
  {
    path: '/admin/events/reviews',
    name: 'admin-event-reviews',
    component: () => import('../views/admin/AdminEventReviews.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, hideShellHeader: true, flushContent: true, devPageName: 'イベント審査' },
  },
  {
    path: '/admin/payments',
    name: 'admin-payments',
    component: () => import('../views/admin/AdminPayments.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, hideShellHeader: true, flushContent: true, devPageName: '決済モニター' },
  },
  {
    path: '/admin/settlements',
    name: 'admin-settlements',
    component: () => import('../views/admin/AdminSettlements.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, hideShellHeader: true, flushContent: true, devPageName: '結算モニター' },
  },
  {
    path: '/admin/settlements/:batchId',
    name: 'admin-settlement-batch',
    component: () => import('../views/admin/AdminSettlementBatchDetail.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      hideShellHeader: true,
      flushContent: true,
      devPageName: '結算バッチ詳細',
    },
    props: true,
  },
  {
    path: '/admin/users',
    name: 'admin-users',
    component: () => import('../views/admin/AdminUsers.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, hideShellHeader: true, flushContent: true, devPageName: 'ユーザー管理' },
  },
  {
    path: '/admin/events',
    name: 'admin-events',
    component: () => import('../views/admin/AdminEvents.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, hideShellHeader: true, flushContent: true, devPageName: 'イベント管理' },
  },
  {
    path: '/admin/communities',
    name: 'admin-communities',
    component: () => import('../views/admin/AdminCommunities.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, hideShellHeader: true, flushContent: true, devPageName: 'コミュニティ管理' },
  },
];
