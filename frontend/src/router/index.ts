import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import CommunityPortal from '../views/community/CommunityPortal.vue';
import MyEvents from '../views/me/MyEvents.vue';
import MyPayments from '../views/me/MyPayments.vue';
import AuthCallback from '../views/auth/AuthCallback.vue';
import CommunityList from '../views/console/CommunityList.vue';
import CommunityForm from '../views/console/CommunityForm.vue';
import CommunityEvents from '../views/console/CommunityEvents.vue';
import CommunityFinance from '../views/console/CommunityFinance.vue';
import EventForm from '../views/console/EventForm.vue';
import EventRegistrations from '../views/console/EventRegistrations.vue';
import OrganizerApply from '../views/account/OrganizerApply.vue';
import ConsoleAccessLayout from '../views/console/ConsoleAccessLayout.vue';
import PaymentSuccess from '../views/payments/PaymentSuccess.vue';
import PaymentCancel from '../views/payments/PaymentCancel.vue';
import PaymentReturn from '../views/payments/PaymentReturn.vue';
import StripeReturn from '../views/console/StripeReturn.vue';
import { useAuth } from '../composables/useAuth';
import { useConsoleCommunityStore } from '../stores/consoleCommunity';
import { isLineInAppBrowser, normalizeLiffStateToPath } from '../utils/liff';
import { isLiffClient } from '../utils/device';
import { useAuthSheets } from '../composables/useAuthSheets';
import { communityRouteGuard, payoutPolicyGuard } from './guards';
import { consoleMobileRoutes, consoleMobileStandaloneRoutes } from './consoleMobileRoutes';
import { adminRoutes } from './adminRoutes';
import {
  beginNav,
  beginNavPending,
  clearPopstateBackPending,
  endNavPending,
  syncHistoryPos,
} from '../composables/useNavStack';
import { MANUAL_LOGOUT_STORAGE_KEY } from '../constants/auth';

function isMobile() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return true;
  }
  const ua = navigator.userAgent || '';
  const hasTouch = typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0;
  // モバイル判定を緩め、LIFF / WebView などの内蔵ブラウザに対応
  return hasTouch || window.innerWidth < 1024 || /Mobile|Android|iPhone|iPod|iPad|Line/i.test(ua);
}

const AUTH_TOKEN_KEY = 'moreapp_access_token';

function hasAuthToken() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.sessionStorage.getItem(MANUAL_LOGOUT_STORAGE_KEY) === '1') return false;
    return Boolean(window.localStorage.getItem(AUTH_TOKEN_KEY));
  } catch {
    return false;
  }
}

function isManualLogoutRequested() {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(MANUAL_LOGOUT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function isLiffContext() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  if (host.includes('miniapp.line.me') || host.includes('liff.line.me')) return true;
  if (isLineInAppBrowser()) return true;
  return isLiffClient();
}

function isLiffPublicRoute(to: any) {
  const path = to.path || '';
  if (path === '/' || path === '/liff' || path === '/events') return true;
  if (path.startsWith('/events/') && !path.includes('/register')) return true;
  if (path.startsWith('/community')) return true;
  if (path.startsWith('/promo')) return true;
  if (path.startsWith('/auth') || path === '/login') return true;
  if (path.startsWith('/experience')) return true;
  if (path.startsWith('/payments/return') || path.startsWith('/liff/payments/return')) return true;
  if (path.startsWith('/legal')) return true;
  return false;
}

const loadMobileOrDesktop = (
  mobileImport: () => Promise<unknown>,
  desktopImport: () => Promise<unknown>,
) => {
  return () => (isMobile() ? mobileImport() : desktopImport());
};

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    redirect: (to) => {
      const raw = Array.isArray(to.query.to) ? to.query.to[0] : to.query.to;
      if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) {
        return raw;
      }
      const liffStateRaw = Array.isArray(to.query['liff.state']) ? to.query['liff.state'][0] : to.query['liff.state'];
      if (typeof liffStateRaw === 'string') {
        const liffPath = normalizeLiffStateToPath(liffStateRaw);
        if (liffPath) return liffPath;
      }
      return isMobile()
        ? { name: 'events' }
        : { path: '/promo', query: { from: to.fullPath } };
    },
    meta: { devPageName: 'デスクトップホーム' },
  },
  {
    path: '/liff',
    name: 'liff-entry',
    redirect: (to) => {
      const raw = Array.isArray(to.query.to) ? to.query.to[0] : to.query.to;
      if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) {
        return raw;
      }
      const liffStateRaw = Array.isArray(to.query['liff.state']) ? to.query['liff.state'][0] : to.query['liff.state'];
      if (typeof liffStateRaw === 'string') {
        const liffPath = normalizeLiffStateToPath(liffStateRaw);
        if (liffPath) return liffPath;
      }
      return { name: 'events' };
    },
    meta: { devPageName: 'LIFFエントリー' },
  },
  {
    path: '/desktop-home',
    name: 'legacy-home',
    redirect: (to) =>
      isMobile()
        ? { name: 'events' }
        : { path: '/promo', query: { from: to.fullPath } },
    meta: { devPageName: '旧デスクトップ' },
  },
  {
    path: '/experience',
    name: 'experience-entry',
    component: () => import('../views/mobile/ExperienceEntryMobile.vue'),
    meta: {
      title: 'テスト体験 | MORE',
      layout: 'mobile-user',
      stackKey: 'mobile',
      hideShellHeader: true,
      hideShellActions: true,
      hideTabbar: true,
      flushContent: true,
      devPageName: 'テスト体験エントリー',
    },
  },
  {
    path: '/try',
    redirect: { name: 'experience-entry' },
  },
  {
    path: '/events',
    name: 'events',
    component: () => import('../views/mobile/MobileEvents.vue'),
    meta: {
      title: 'イベント',
      layout: 'mobile-user',
      stackKey: 'mobile',
      hideShellHeader: true,
      hideShellActions: true,
      keepAlive: true,
      devPageName: 'イベント一覧',
      navTransition: 'none',
    },
  },
  {
    path: '/events/:eventId',
    name: 'event-detail',
    component: loadMobileOrDesktop(
      () => import('../views/mobile/MobileEventDetail.vue'),
      () => import('../views/events/EventDetail.vue'),
    ),
    meta: {
      title: 'イベント詳細',
      layout: 'mobile-user',
      stackKey: 'mobile',
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      devPageName: 'イベント詳細',
      forceNavDir: 'forward',
    },
    props: true,
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
      forceNavDir: 'forward',
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
    path: '/auth/login',
    name: 'auth-login',
    component: () => import('../views/auth/Login.vue'),
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
    path: '/promo',
    name: 'promo',
    component: () => import('../views/promo/PromoPage.vue'),
    meta: {
      title: 'ご案内',
      layout: 'mobile-user',
      stackKey: 'mobile',
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      devPageName: 'プロモページ',
      desktopAllowed: true,
      hideDesktopNav: true,
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
    path: '/staff',
    name: 'MobileStaff',
    component: () => import('../views/mobile/MobileStaff.vue'),
    meta: {
      title: 'スタッフ管理',
      layout: 'mobile-user',
      stackKey: 'mobile',
      mobileOnly: true,
      requiresAdmin: true,
      devPageName: 'スタッフ管理',
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
      mobileOnly: true,
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
    },
  },
  {
    path: '/organizer/payout-policy',
    name: 'organizer-payout-policy',
    component: () => import('../views/organizer/OrganizerPayoutPolicyPage.vue'),
    meta: {
      title: '資金の流れと返金のしくみ',
      requiresAuth: true,
      requiresOrganizer: true,
      organizerOnly: true,
      layout: 'mobile-user',
      stackKey: 'mobile',
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      devPageName: '主催者-資金説明',
    },
  },
  {
    path: '/me',
    name: 'MobileMe',
    component: () => import('../views/mobile/MobileMe.vue'),
    meta: {
      title: 'マイページ',
      layout: 'mobile-user',
      stackKey: 'mobile',
      mobileOnly: true,
      flushContent: true,
      fixedPage: true,
      hideShellHeader: true,
      devPageName: 'マイページ',
      navTransition: 'none',
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
  consoleMobileRoutes,
  ...consoleMobileStandaloneRoutes,
  {
    path: '/console-desktop',
    component: ConsoleAccessLayout,
    meta: { requiresAuth: true, requiresOrganizer: true, devPageName: 'Console デスクトップシェル' },
    children: [
      {
        path: '',
        name: 'console-home',
        component: () => import('../views/console/ConsoleHome.vue'),
        beforeEnter: async (to, from, next) => {
          const store = useConsoleCommunityStore();
          await store.loadCommunities();
          store.ensureActiveCommunity();
          if (!store.communities.value.length) {
            return next({ name: 'console-community-create' });
          }
          if (store.activeCommunityId.value) {
            return next({
              name: 'console-community-events',
              params: { communityId: store.activeCommunityId.value },
            });
          }
          return next();
        },
        meta: { devPageName: 'Console デスクトップホーム' },
      },
      {
        path: 'communities',
        name: 'console-communities',
        component: CommunityList,
        meta: { devPageName: 'Console-コミュニティ一覧' },
      },
      {
        path: 'communities/new',
        name: 'console-community-create',
        component: CommunityForm,
        meta: { devPageName: 'Console-コミュニティ作成' },
      },
      {
        path: 'communities/:communityId/edit',
        name: 'console-community-edit',
        component: CommunityForm,
        props: true,
        beforeEnter: communityRouteGuard,
        meta: { devPageName: 'Console-コミュニティ編集' },
      },
      {
        path: 'communities/:communityId/events',
        name: 'console-community-events',
        component: CommunityEvents,
        props: true,
        beforeEnter: communityRouteGuard,
        meta: { devPageName: 'Console-イベント一覧' },
      },
      {
        path: 'communities/:communityId/finance',
        name: 'console-community-finance',
        component: CommunityFinance,
        props: true,
        beforeEnter: [communityRouteGuard, payoutPolicyGuard],
        meta: { devPageName: 'Console-財務' },
      },
      {
        path: 'communities/:communityId/events/create',
        name: 'console-event-create',
        component: EventForm,
        props: true,
        beforeEnter: communityRouteGuard,
        meta: { devPageName: 'Console-イベント作成' },
      },
      {
        path: 'events/:eventId/edit',
        name: 'console-event-edit',
        component: EventForm,
        props: true,
        meta: { devPageName: 'Console-イベント編集' },
      },
      {
        path: 'events/:eventId/registrations',
        name: 'console-event-registrations',
        component: EventRegistrations,
        props: true,
        meta: { devPageName: 'Console-申込一覧' },
      },
    ],
  },
  ...adminRoutes,
  {
    path: '/community/:slug',
    name: 'community-portal',
    component: CommunityPortal,
    props: true,
    meta: {
      layout: 'mobile-user',
      stackKey: 'mobile',
      hideShellHeader: true,
      hideTabbar: true,
      mobileOnly: true,
      flushContent: true,
      devPageName: 'コミュニティポータル',
    },
  },
  {
    path: '/community/:slug/classes',
    name: 'community-classes',
    component: () => import('../views/community/CommunityClassesList.vue'),
    meta: {
      layout: 'mobile-user',
      stackKey: 'mobile',
      hideShellHeader: true,
      hideTabbar: true,
      mobileOnly: true,
      flushContent: true,
      devPageName: 'コミュニティ教室一覧',
    },
    props: true,
  },
  {
    path: '/community/:slug/classes/:classId',
    name: 'community-class-detail',
    component: () => import('../views/community/ClassDetail.vue'),
    meta: {
      layout: 'mobile-user',
      stackKey: 'mobile',
      hideShellHeader: true,
      hideTabbar: true,
      mobileOnly: true,
      flushContent: true,
      devPageName: 'コミュニティ教室詳細',
    },
    props: true,
  },
  {
    path: '/me/events',
    name: 'my-events',
    component: MyEvents,
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
    component: MyPayments,
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
    path: '/favorites',
    name: 'favorites',
    redirect: '/me',
  },
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: AuthCallback,
    meta: {
      devPageName: 'ログインコールバック',
    },
  },
  {
    path: '/payments/success',
    name: 'payment-success',
    component: PaymentSuccess,
    meta: {
      devPageName: '決済成功',
      title: '申込完了',
    },
  },
  {
    path: '/payments/cancel',
    name: 'payment-cancel',
    component: PaymentCancel,
    meta: {
      devPageName: '決済キャンセル',
      title: '申込未完了',
    },
  },
  {
    path: '/payments/return',
    name: 'payment-return',
    component: PaymentReturn,
    meta: {
      devPageName: '決済結果',
      title: 'お支払い結果',
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      layout: 'mobile-user',
      stackKey: 'mobile',
    },
  },
  {
    path: '/liff/payments/return',
    name: 'payment-return-liff',
    component: PaymentReturn,
    meta: {
      devPageName: '決済結果(LIFF)',
      title: 'お支払い結果',
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      layout: 'mobile-user',
      stackKey: 'mobile',
    },
  },
  {
    path: '/console/stripe-return',
    name: 'console-stripe-return',
    component: StripeReturn,
    meta: {
      devPageName: 'Stripe 戻りページ',
      title: 'Stripe連携',
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
    },
  },
];

const APP_NAME = 'SOCIALMORE';

const resolvePageTitle = (to: any) => {
  const metaTitle = (to.meta?.title as string | undefined) || (to.meta?.liffTitle as string | undefined);
  if (metaTitle && metaTitle.trim()) return metaTitle.trim();
  if (typeof to.name === 'string' && to.name) return to.name;
  return APP_NAME;
};

const applyPageTitle = async (to: any) => {
  if (typeof document === 'undefined') return;
  const pageTitle = resolvePageTitle(to);
  const disableLiffTitle = import.meta.env.DISABLE_LIFF_TITLE !== 'false'; // デフォルトは無効。明示的に false のときのみ有効。
  document.title = isLineInAppBrowser() ? pageTitle : `${pageTitle} | ${APP_NAME}`;
  if (disableLiffTitle) return;
      if (isLineInAppBrowser()) {
        try {
          const { loadLiff } = await import('../utils/liff');
          const liffInstance = await loadLiff();
          (liffInstance as any)?.setTitle?.(pageTitle);
        } catch (error) {
          console.warn('Failed to set LIFF title; continuing with document.title only.', error);
        }
      }
    };

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
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

router.beforeEach(async (to, from, next) => {
  // Reset pending overlay if a previous navigation was aborted.
  endNavPending();
  const auth = useAuth();
  const sheets = useAuthSheets();
  const mobile = isMobile();
  const isReplaceNav = replacePending;
  replacePending = false;
  if (mobile) {
    // Track direction for mobile page transitions.
    beginNav(to, from, { replaced: isReplaceNav });
    beginNavPending();
  }
  const isTestHost = typeof window !== 'undefined' && window.location.hostname.includes('test.socialmore.jp');
  const isTestMode = import.meta.env.MODE === 'test' || isTestHost;
  if (isTestMode && !mobile && to.path !== '/promo' && !to.meta?.desktopAllowed) {
    return next({ path: '/promo', query: { from: to.fullPath } });
  }

  if (mobile && to.meta.desktopOnly) {
    return next({ name: 'events' });
  }

  if (!mobile && to.meta.mobileOnly) {
    return next({ name: 'home' });
  }

  if (!auth.user.value && auth.accessToken.value) {
    try {
      await auth.fetchCurrentUser();
    } catch (error) {
      console.warn('Failed to restore user session', error);
      auth.logout();
    }
  }

  if (
    isLiffContext() &&
    !(auth.accessToken.value || hasAuthToken()) &&
    !isLiffPublicRoute(to) &&
    !isManualLogoutRequested()
  ) {
    try {
      const result = await auth.loginWithLiff();
      if (result.ok) return next();
      if (result.reason === 'login_redirect') {
        endNavPending();
        return next(false);
      }
    } catch (error) {
      console.warn('LIFF login failed in guard', error);
    }
    return next({ name: 'events' });
  }

  if (to.meta.requiresAuth && !auth.user.value) {
    const isTest =
      import.meta.env.MODE === 'test' ||
      (typeof window !== 'undefined' && window.location.hostname.includes('test.socialmore.jp'));
    const isMobileUA = mobile;
    const promoCandidate = to.path !== '/promo';
    if (isTest && !isMobileUA && promoCandidate) {
      return next({ path: '/promo', query: { from: to.fullPath } });
    }
    const showed = sheets.showLoginSheet({ returnTo: to.fullPath });
    if (showed) {
      endNavPending();
      return next(false);
    }
    return next({ name: 'auth-login', query: { redirect: to.fullPath } });
  }

  if (to.meta.requiresAdmin && !auth.user.value?.isAdmin) {
    const showed = sheets.showForbiddenSheet({ reason: 'NOT_ADMIN', returnTo: to.fullPath });
    if (showed) {
      endNavPending();
      return next(false);
    }
    return next({ name: 'home' });
  }

  if (to.meta.organizerOnly && !auth.user.value?.isOrganizer && !auth.user.value?.isAdmin) {
    const showed = sheets.showForbiddenSheet({ reason: 'NOT_ORGANIZER', returnTo: to.fullPath });
    if (showed) {
      endNavPending();
      return next(false);
    }
    return next({ name: 'home' });
  }

  if (to.meta.requiresOrganizer && !auth.user.value?.isOrganizer && !auth.user.value?.isAdmin) {
    // コンソール配下のみ主理人チェックを強制。ユーザー側動線は通す。
    if (to.path.startsWith('/console')) {
      const showed = sheets.showForbiddenSheet({ reason: 'NOT_ORGANIZER', returnTo: to.fullPath });
      if (showed) {
        endNavPending();
        return next(false);
      }
      return next({ name: 'home' });
    }
    return next();
  }

  return next();
});

router.beforeResolve(() => {
  // Components resolved; hide loading overlay before transition starts.
  endNavPending();
});

router.afterEach(() => {
  syncHistoryPos();
  endNavPending();
});

router.afterEach((to) => {
  void applyPageTitle(to);
});

router.onError(() => {
  endNavPending();
});

export default router;
