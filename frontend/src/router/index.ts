import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import Home from '../views/Home.vue';
import CommunityPortal from '../views/community/CommunityPortal.vue';
import MyEvents from '../views/me/MyEvents.vue';
import AuthCallback from '../views/auth/AuthCallback.vue';
import CommunityList from '../views/console/CommunityList.vue';
import CommunityForm from '../views/console/CommunityForm.vue';
import CommunityEvents from '../views/console/CommunityEvents.vue';
import CommunityFinance from '../views/console/CommunityFinance.vue';
import EventForm from '../views/console/EventForm.vue';
import EventRegistrations from '../views/console/EventRegistrations.vue';
import OrganizerApply from '../views/account/OrganizerApply.vue';
import ConsoleAccessLayout from '../views/console/ConsoleAccessLayout.vue';
import AdminHome from '../views/admin/AdminHome.vue';
import PaymentSuccess from '../views/payments/PaymentSuccess.vue';
import PaymentCancel from '../views/payments/PaymentCancel.vue';
import StripeReturn from '../views/console/StripeReturn.vue';
import DesktopLanding from '../views/desktop/DesktopLanding.vue';
import { useAuth } from '../composables/useAuth';
import { useConsoleCommunityStore } from '../stores/consoleCommunity';
import ConsoleMobileShell from '../layouts/ConsoleMobileShell.vue';

function isMobile() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return true;
  }
  return window.innerWidth < 768 || /Mobile|Android|iPhone/i.test(navigator.userAgent);
}

const loadMobileOrDesktop = (
  mobileImport: () => Promise<unknown>,
  desktopImport: () => Promise<unknown>,
) => {
  return () => (isMobile() ? mobileImport() : desktopImport());
};

async function communityRouteGuard(to: any, from: any, next: any) {
  const store = useConsoleCommunityStore();
  await store.loadCommunities();
  const communityId = to.params.communityId as string | undefined;
  if (!communityId || !store.hasCommunity(communityId)) {
    store.ensureActiveCommunity();
    if (store.activeCommunityId.value) {
      return next({
        name: 'console-community-events',
        params: { communityId: store.activeCommunityId.value },
      });
    }
    return next({ name: 'console-community-create' });
  }
  store.setActiveCommunity(communityId);
  return next();
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: DesktopLanding,
    meta: { desktopOnly: true, devPageName: '桌面首页' },
  },
  {
    path: '/desktop-home',
    name: 'legacy-home',
    component: Home,
    meta: { desktopOnly: true, devPageName: '旧版桌面' },
  },
  {
    path: '/events',
    name: 'events',
    component: loadMobileOrDesktop(
      () => import('../views/mobile/MobileEvents.vue'),
      () => import('../views/events/EventList.vue'),
    ),
    meta: {
      title: 'イベント',
      layout: 'mobile-user',
      devPageName: '活动列表',
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
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      devPageName: '活动详情',
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
      mobileOnly: true,
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      devPageName: '活动报名',
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
      mobileOnly: true,
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      devPageName: '活动报名确认',
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
      mobileOnly: true,
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      devPageName: '活动报名成功',
    },
    props: true,
  },
  {
    path: '/auth/login',
    name: 'auth-login',
    component: () => import('../views/auth/Login.vue'),
    meta: {
      layout: 'mobile-user',
      mobileOnly: true,
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      devPageName: '登录',
    },
  },
  {
    path: '/auth/setup',
    name: 'auth-setup',
    component: () => import('../views/auth/SetupProfile.vue'),
    meta: {
      layout: 'mobile-user',
      mobileOnly: true,
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      devPageName: '资料确认',
    },
  },
  {
    path: '/staff',
    name: 'MobileStaff',
    component: () => import('../views/mobile/MobileStaff.vue'),
    meta: {
      title: '员工管理',
      layout: 'mobile-user',
      mobileOnly: true,
      requiresAdmin: true,
      devPageName: '员工管理',
    },
  },
  {
    path: '/organizer/apply',
    name: 'organizer-apply',
    component: OrganizerApply,
    meta: {
      devPageName: '主理人申请',
    },
  },
  {
    path: '/me',
    name: 'MobileMe',
    component: () => import('../views/mobile/MobileMe.vue'),
    meta: {
      title: 'マイページ',
      layout: 'mobile-user',
      mobileOnly: true,
      fixedPage: true,
      hideShellHeader: true,
      devPageName: '我的主页',
    },
  },
  {
    path: '/settings',
    name: 'MobileSettings',
    component: () => import('../views/mobile/MobileSettings.vue'),
    meta: {
      title: '設定',
      layout: 'mobile-user',
      mobileOnly: true,
      devPageName: '设置',
    },
  },
  {
    path: '/communities',
    name: 'MobileCommunities',
    component: () => import('../views/mobile/MobileCommunities.vue'),
    meta: {
      title: 'コミュニティ',
      layout: 'mobile-user',
      mobileOnly: true,
      devPageName: '社群广场',
    },
  },
  {
    path: '/console',
    component: ConsoleMobileShell,
    meta: { requiresAuth: true, requiresOrganizer: true, layout: 'console-mobile', devPageName: 'Console 移动壳' },
    children: [
      {
        path: '',
        name: 'ConsoleMobileHome',
        component: () => import('../views/console/mobile/ConsoleHomeMobile.vue'),
        meta: { devPageName: 'Console-首页' },
      },
      {
        path: 'communities/:communityId/events',
        name: 'ConsoleMobileCommunityEvents',
        component: () => import('../views/console/mobile/ConsoleCommunityEventsMobile.vue'),
        beforeEnter: communityRouteGuard,
        meta: { devPageName: 'Console-社区活动' },
      },
      {
        path: 'communities/new',
        name: 'ConsoleMobileCommunityCreate',
        component: () => import('../views/console/mobile/ConsoleCommunityCreateMobile.vue'),
        meta: {
          hideTabbar: true,
          hideShellHeader: true,
          layout: 'console-mobile',
          devPageName: 'Console-创建社群',
        },
      },
      {
        path: 'communities/:communityId/events/create',
        name: 'ConsoleMobileEventCreate',
        component: () => import('../views/console/mobile/ConsoleEventAssistantMobile.vue'),
        beforeEnter: communityRouteGuard,
        meta: {
          hideTabbar: true,
          hideShellHeader: true,
          fixedPage: true,
          layout: 'console-mobile',
          devPageName: 'Console-活动助手',
        },
      },
      {
        path: 'communities/:communityId/event-assistant/dashboard',
        name: 'ConsoleMobileAssistantDashboard',
        component: () => import('../views/console/mobile/ConsoleEventAssistantDashboard.vue'),
        beforeEnter: communityRouteGuard,
        meta: { hideTabbar: true, hideShellHeader: true, devPageName: 'Console-助手面板' },
      },
      {
        path: 'communities/:communityId/events/form',
        name: 'ConsoleMobileEventForm',
        component: () => import('../views/console/EventForm.vue'),
        beforeEnter: communityRouteGuard,
        meta: {
          hideTabbar: true,
          hideShellHeader: true,
          layout: 'console-mobile',
          devPageName: 'Console-活动表单',
        },
      },
      {
        path: 'communities/:communityId/events/note-editor',
        name: 'ConsoleMobileEventNoteEditor',
        component: () => import('../views/console/mobile/ConsoleEventNoteEditorMobile.vue'),
        beforeEnter: communityRouteGuard,
        meta: {
          hideTabbar: true,
          hideShellHeader: true,
          layout: 'console-mobile',
          devPageName: 'Console-活动详情编辑',
        },
      },
      {
        path: 'communities/:communityId/settings',
        name: 'ConsoleMobileCommunitySettings',
        component: () => import('../views/console/mobile/ConsoleCommunitySettingsMobile.vue'),
        beforeEnter: communityRouteGuard,
        meta: { hideTabbar: true, hideShellHeader: true, devPageName: 'Console-社群設定' },
      },
      {
        path: 'communities/:communityId/portal',
        name: 'ConsoleMobileCommunityPortal',
        component: () => import('../views/console/mobile/ConsoleCommunityPortalMobile.vue'),
        beforeEnter: communityRouteGuard,
        meta: { hideTabbar: true, hideShellHeader: true, devPageName: 'Console-门户模板' },
      },
      {
        path: 'events/:eventId/manage',
        name: 'ConsoleMobileEventManage',
        component: () => import('../views/console/mobile/ConsoleEventManageMobile.vue'),
        meta: { devPageName: 'Console-活动管理' },
      },
      {
        path: 'events/:eventId/publish-success',
        name: 'ConsoleMobileEventPublishSuccess',
        component: () => import('../views/console/mobile/ConsoleEventPublishSuccessMobile.vue'),
        meta: {
          hideTabbar: true,
          hideShellHeader: true,
          layout: 'console-mobile',
          devPageName: 'Console-活动发布成功',
        },
      },
      {
        path: 'settings/payout',
        name: 'ConsoleMobilePayout',
        component: () => import('../views/console/mobile/PayoutSettingsMobile.vue'),
        meta: { devPageName: 'Console-收款设置' },
      },
      {
        path: 'subscription',
        name: 'ConsoleMobileSubscription',
        component: () => import('../views/console/mobile/SubscriptionMobile.vue'),
        meta: { devPageName: 'Console-订阅管理' },
      },
      {
        path: 'tickets/scanner',
        name: 'ConsoleTicketScanner',
        component: () => import('../views/console/mobile/ConsoleTicketScannerMobile.vue'),
        meta: {
          hideTabbar: true,
          hideShellHeader: true,
          layout: 'console-mobile',
          devPageName: 'Console-验票扫码',
        },
      },
    ],
  },
  {
    path: '/console-desktop',
    component: ConsoleAccessLayout,
    meta: { requiresAuth: true, requiresOrganizer: true, devPageName: 'Console 桌面壳' },
    children: [
      {
        path: '',
        name: 'console-home',
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
        meta: { devPageName: 'Console 桌面首页' },
      },
      {
        path: 'communities',
        name: 'console-communities',
        component: CommunityList,
        meta: { devPageName: 'Console-社群列表' },
      },
      {
        path: 'communities/new',
        name: 'console-community-create',
        component: CommunityForm,
        meta: { devPageName: 'Console-创建社群' },
      },
      {
        path: 'communities/:communityId/edit',
        name: 'console-community-edit',
        component: CommunityForm,
        props: true,
        beforeEnter: communityRouteGuard,
        meta: { devPageName: 'Console-编辑社群' },
      },
      {
        path: 'communities/:communityId/events',
        name: 'console-community-events',
        component: CommunityEvents,
        props: true,
        beforeEnter: communityRouteGuard,
        meta: { devPageName: 'Console-活动列表' },
      },
      {
        path: 'communities/:communityId/finance',
        name: 'console-community-finance',
        component: CommunityFinance,
        props: true,
        beforeEnter: communityRouteGuard,
        meta: { devPageName: 'Console-财务' },
      },
      {
        path: 'communities/:communityId/events/create',
        name: 'console-event-create',
        component: EventForm,
        props: true,
        beforeEnter: communityRouteGuard,
        meta: { devPageName: 'Console-创建活动' },
      },
      {
        path: 'events/:eventId/edit',
        name: 'console-event-edit',
        component: EventForm,
        props: true,
        meta: { devPageName: 'Console-编辑活动' },
      },
      {
        path: 'events/:eventId/registrations',
        name: 'console-event-registrations',
        component: EventRegistrations,
        props: true,
        meta: { devPageName: 'Console-报名列表' },
      },
    ],
  },
  {
    path: '/admin',
    name: 'admin-home',
    component: AdminHome,
    meta: { requiresAuth: true, requiresAdmin: true, devPageName: '管理员后台' },
  },
  {
    path: '/admin/ai',
    name: 'admin-ai-overview',
    component: () => import('../views/admin/AdminAiOverview.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, devPageName: 'AI 使用概览' },
  },
  {
    path: '/admin/ai/:moduleId',
    name: 'admin-ai-detail',
    component: () => import('../views/admin/AdminAiModuleDetail.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, hideTabbar: true, devPageName: 'AI 使用详情' },
    props: true,
  },
  {
    path: '/community/:slug',
    name: 'community-portal',
    component: CommunityPortal,
    props: true,
    meta: {
      layout: 'mobile-user',
      hideShellHeader: true,
      hideTabbar: true,
      mobileOnly: true,
      devPageName: '社群门户',
    },
  },
  {
    path: '/me/events',
    name: 'my-events',
    component: MyEvents,
    meta: {
      devPageName: '我的活动',
      hideTabbar: true,
      hideShellHeader: true,
      flushContent: true,
    },
  },
  {
    path: '/favorites',
    name: 'favorites',
    component: () => import('../views/favorites/FavoritesList.vue'),
    meta: {
      devPageName: 'お気に入り',
      hideTabbar: true,
      hideShellHeader: true,
    },
  },
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: AuthCallback,
    meta: {
      devPageName: '登录回调',
    },
  },
  {
    path: '/payments/success',
    name: 'payment-success',
    component: PaymentSuccess,
    meta: {
      devPageName: '支付成功',
    },
  },
  {
    path: '/payments/cancel',
    name: 'payment-cancel',
    component: PaymentCancel,
    meta: {
      devPageName: '支付取消',
    },
  },
  {
    path: '/console/stripe-return',
    name: 'console-stripe-return',
    component: StripeReturn,
    meta: {
      devPageName: 'Stripe 返回页',
    },
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async (to, from, next) => {
  const auth = useAuth();
  const mobile = isMobile();

  if (mobile && to.meta.desktopOnly) {
    return next({ name: 'events' });
  }

  if (!mobile && to.meta.mobileOnly) {
    return next({ name: 'home' });
  }

  if (mobile && to.path === '/') {
    return next({ name: 'events' });
  }

  if (!auth.user.value && auth.accessToken.value) {
    try {
      await auth.fetchCurrentUser();
    } catch (error) {
      console.warn('Failed to restore user session', error);
      auth.logout();
    }
  }

  if (to.meta.requiresAuth && !auth.user.value) {
    return next({ name: 'organizer-apply' });
  }

  if (to.meta.requiresAdmin && !auth.user.value?.isAdmin) {
    return next({ name: 'home' });
  }

  if (to.meta.requiresOrganizer && !auth.user.value?.isOrganizer && !auth.user.value?.isAdmin) {
    return next({ name: 'organizer-apply' });
  }

  return next();
});

export default router;
