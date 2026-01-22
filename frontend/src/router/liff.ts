import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import MobileEvents from '../views/mobile/MobileEvents.vue';
import MobileEventDetail from '../views/mobile/MobileEventDetail.vue';
import MobileMe from '../views/mobile/MobileMe.vue';
import Login from '../views/auth/Login.vue';
import OrganizerApply from '../views/account/OrganizerApply.vue';
import { adminRoutes } from './adminRoutes';
import { consoleMobileRoutes, consoleMobileStandaloneRoutes } from './consoleMobileRoutes';
import {
  beginNav,
  beginNavPending,
  clearPopstateBackPending,
  endNavPending,
} from '../composables/useNavStack';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/events' },
  {
    path: '/events',
    name: 'liff-events',
    component: MobileEvents,
    meta: { hideShellHeader: true, hideTabbar: false, flushContent: true },
  },
  {
    path: '/events/:eventId',
    name: 'liff-event-detail',
    component: MobileEventDetail,
    props: true,
    meta: { hideShellHeader: true, hideTabbar: true, flushContent: true },
  },
  {
    path: '/events/:eventId/register',
    name: 'MobileEventRegister',
    component: () => import('../views/mobile/MobileEventRegister.vue'),
    meta: {
      title: 'イベント申込',
      layout: 'mobile-user',
      stackKey: 'mobile',
      mobileOnly: true,
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      devPageName: 'イベント申込',
    },
    props: true,
  },
  {
    path: '/events/:eventId/register/confirm',
    name: 'MobileEventCheckout',
    component: () => import('../views/mobile/MobileEventCheckout.vue'),
    meta: {
      title: '申込確認',
      layout: 'mobile-user',
      stackKey: 'mobile',
      mobileOnly: true,
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      devPageName: '申込確認',
    },
    props: true,
  },
  {
    path: '/events/:eventId/register/success',
    name: 'MobileEventSuccess',
    component: () => import('../views/mobile/MobileEventSuccess.vue'),
    meta: {
      title: '参加完了',
      layout: 'mobile-user',
      stackKey: 'mobile',
      mobileOnly: true,
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      devPageName: '申込完了',
    },
    props: true,
  },
  {
    path: '/me',
    name: 'liff-me',
    component: MobileMe,
    meta: { hideShellHeader: true, hideTabbar: false, flushContent: true },
  },
  {
    path: '/me/events',
    name: 'my-events',
    component: () => import('../views/me/MyEvents.vue'),
    meta: {
      title: 'マイチケット',
      devPageName: 'マイチケット',
      stackKey: 'mobile',
      hideTabbar: true,
      hideShellHeader: true,
      flushContent: true,
      forceNavDir: 'forward',
    },
  },
  {
    path: '/me/payments',
    name: 'my-payments',
    component: () => import('../views/me/MyPayments.vue'),
    meta: {
      title: '支払い履歴',
      devPageName: '支払い履歴',
      stackKey: 'mobile',
      hideTabbar: true,
      hideShellHeader: true,
      flushContent: true,
      forceNavDir: 'forward',
    },
  },
  {
    path: '/settings',
    name: 'MobileSettings',
    component: () => import('../views/mobile/MobileSettings.vue'),
    meta: {
      title: '設定',
      layout: 'mobile-user',
      stackKey: 'mobile',
      mobileOnly: true,
      hideTabbar: true,
      hideShellHeader: true,
      flushContent: true,
      devPageName: '設定',
      forceNavDir: 'forward',
    },
  },
  {
    path: '/communities',
    name: 'MobileCommunities',
    component: () => import('../views/mobile/MobileCommunities.vue'),
    meta: {
      title: 'コミュニティ',
      layout: 'mobile-user',
      stackKey: 'mobile',
      mobileOnly: true,
      hideTabbar: true,
      hideShellHeader: true,
      flushContent: true,
      keepAlive: true,
      devPageName: 'コミュニティ広場',
      forceNavDir: 'forward',
    },
  },
  {
    path: '/favorites',
    name: 'favorites',
    redirect: '/me',
  },
  {
    path: '/login',
    name: 'liff-login',
    component: Login,
    meta: { hideShellHeader: true, hideTabbar: true, flushContent: true },
  },
  {
    path: '/auth/login',
    name: 'auth-login',
    component: Login,
    meta: {
      layout: 'mobile-user',
      stackKey: 'mobile',
      mobileOnly: true,
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      devPageName: 'ログイン',
    },
  },
  {
    path: '/auth/setup',
    name: 'auth-setup',
    component: () => import('../views/auth/SetupProfile.vue'),
    meta: {
      title: 'アカウント設定',
      layout: 'mobile-user',
      stackKey: 'mobile',
      mobileOnly: true,
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      devPageName: 'プロフィール設定',
    },
  },
  {
    path: '/organizer/apply',
    name: 'organizer-apply',
    component: OrganizerApply,
    meta: {
      devPageName: '主催者申請',
      layout: 'mobile-user',
      stackKey: 'mobile',
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      forceNavDir: 'forward',
    },
  },
  consoleMobileRoutes,
  ...consoleMobileStandaloneRoutes,
  ...adminRoutes,
];

const router = createRouter({
  history: createWebHistory('/liff'),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) return savedPosition;
    return { left: 0, top: 0 };
  },
});

let replacePending = false;
const originalReplace = router.replace.bind(router);
router.replace = ((to) => {
  replacePending = true;
  return originalReplace(to);
}) as typeof router.replace;
const originalPush = router.push.bind(router);
router.push = ((to) => {
  clearPopstateBackPending();
  if (typeof to === 'object' && to && 'replace' in to && (to as any).replace) {
    replacePending = true;
  }
  return originalPush(to);
}) as typeof router.push;

router.beforeEach((to, from, next) => {
  endNavPending();
  const isReplaceNav = replacePending;
  replacePending = false;
  beginNav(to, from, { replaced: isReplaceNav });
  beginNavPending();
  next();
});

router.beforeResolve(() => {
  endNavPending();
});

router.afterEach(() => {
  endNavPending();
});

router.onError(() => {
  endNavPending();
});

export default router;
