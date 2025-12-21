import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import Home from '../views/Home.vue';
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
import AdminHome from '../views/admin/AdminHome.vue';
import AdminResourceManager from '../views/admin/AdminResourceManager.vue';
import AdminResourceGroup from '../views/admin/AdminResourceGroup.vue';
import PaymentSuccess from '../views/payments/PaymentSuccess.vue';
import PaymentCancel from '../views/payments/PaymentCancel.vue';
import PaymentReturn from '../views/payments/PaymentReturn.vue';
import StripeReturn from '../views/console/StripeReturn.vue';
import DesktopLanding from '../views/desktop/DesktopLanding.vue';
import { useAuth } from '../composables/useAuth';
import { useConsoleCommunityStore } from '../stores/consoleCommunity';
import ConsoleMobileShell from '../layouts/ConsoleMobileShell.vue';
import { isLineInAppBrowser } from '../utils/liff';
import { useAuthSheets } from '../composables/useAuthSheets';

function isMobile() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return true;
  }
  const ua = navigator.userAgent || '';
  // 更宽容的移动检测，适配 LIFF / WebView 等内嵌浏览器
  return window.innerWidth < 1024 || /Mobile|Android|iPhone|iPod|iPad|Line/i.test(ua);
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
    component: () => import('../views/mobile/MobileEvents.vue'),
    meta: {
      title: 'イベント',
      layout: 'mobile-user',
      hideShellHeader: true,
      hideShellActions: true,
      keepAlive: true,
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
    path: '/promo',
    name: 'promo',
    component: () => import('../views/promo/PromoPage.vue'),
    meta: {
      title: 'ご案内',
      layout: 'mobile-user',
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
      title: '受け取り設定',
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
      devPageName: '主催者申請',
      layout: 'mobile-user',
      mobileOnly: true,
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
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
      flushContent: true,
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
      hideTabbar: true,
      hideShellHeader: true,
      flushContent: true,
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
      hideTabbar: true,
      hideShellHeader: true,
      flushContent: true,
      devPageName: '社群广场',
    },
  },
  {
    path: '/console',
    component: ConsoleMobileShell,
    meta: {
      requiresAuth: true,
      requiresOrganizer: true,
      layout: 'console-mobile',
      devPageName: 'Console 移动壳',
    },
    children: [
      {
        path: '',
        name: 'ConsoleMobileHome',
        component: () => import('../views/console/mobile/ConsoleHomeMobile.vue'),
        meta: {
          title: 'コミュニティ管理',
          devPageName: 'Console-首页',
          hideShellHeader: true,
          flushContent: true,
        },
      },
      {
        path: 'communities/:communityId/events',
        name: 'ConsoleMobileCommunityEvents',
        component: () => import('../views/console/mobile/ConsoleCommunityEventsMobile.vue'),
        beforeEnter: communityRouteGuard,
        meta: {
          title: 'コミュニティイベント',
          devPageName: 'Console-社区活动',
          hideShellHeader: true,
          flushContent: true,
        },
      },
      {
        path: 'classes',
        name: 'ConsoleMobileClasses',
        component: () => import('../views/console/mobile/ConsoleClassesListMobile.vue'),
        meta: {
          title: '教室管理',
          hideShellHeader: true,
          hideTabbar: true,
          layout: 'console-mobile',
          flushContent: true,
          devPageName: 'Console-教室列表',
        },
      },
      {
        path: 'classes/new',
        name: 'ConsoleMobileClassForm',
        component: () => import('../views/console/mobile/ConsoleClassFormMobile.vue'),
        meta: {
          title: '教室を作成',
          hideShellHeader: true,
          hideTabbar: true,
          layout: 'console-mobile',
          flushContent: true,
          devPageName: 'Console-教室表单',
        },
      },
      {
        path: 'classes/:classId/lessons',
        name: 'ConsoleMobileLessons',
        component: () => import('../views/console/mobile/ConsoleLessonsMobile.vue'),
        meta: {
          title: 'レッスン管理',
          hideShellHeader: true,
          hideTabbar: true,
          layout: 'console-mobile',
          flushContent: true,
          devPageName: 'Console-レッスン管理',
        },
        props: true,
      },
      {
        path: 'lessons/:lessonId/registrations',
        name: 'ConsoleMobileLessonRegistrations',
        component: () => import('../views/console/mobile/ConsoleLessonRegistrationsMobile.vue'),
        meta: {
          title: '申込一覧',
          hideShellHeader: true,
          hideTabbar: true,
          layout: 'console-mobile',
          flushContent: true,
          devPageName: 'Console-レッスン申込',
        },
        props: true,
      },
      {
        path: 'communities/new',
        name: 'ConsoleMobileCommunityCreate',
        component: () => import('../views/console/mobile/ConsoleCommunitySettingsMobile.vue'),
        meta: {
          title: 'コミュニティ作成',
          hideTabbar: true,
          hideShellHeader: true,
          layout: 'console-mobile',
          flushContent: true,
          devPageName: 'Console-创建社群',
        },
      },
      {
        path: 'communities/:communityId/events/paste',
        name: 'ConsoleMobileEventPaste',
        component: () => import('../views/console/mobile/ConsoleEventPasteMobile.vue'),
        beforeEnter: communityRouteGuard,
        meta: {
          title: '下書きを貼り付ける',
          hideTabbar: true,
          hideShellHeader: true,
          flushContent: true,
          layout: 'console-mobile',
          devPageName: 'Console-粘贴草案',
        },
      },
      {
        path: 'communities/:communityId/events/create',
        name: 'ConsoleMobileEventCreate',
        component: () => import('../views/console/mobile/ConsoleEventAssistantMobile.vue'),
        beforeEnter: communityRouteGuard,
        meta: {
          title: 'イベント作成',
          hideTabbar: true,
          hideShellHeader: true,
          fixedPage: true,
          layout: 'console-mobile',
          flushContent: true,
          devPageName: 'Console-活动助手',
        },
      },
      {
        path: 'communities/:communityId/event-assistant/dashboard',
        name: 'ConsoleMobileAssistantDashboard',
        component: () => import('../views/console/mobile/ConsoleEventAssistantDashboard.vue'),
        beforeEnter: communityRouteGuard,
        meta: {
          title: 'アシスタントダッシュボード',
          hideTabbar: true,
          hideShellHeader: true,
          flushContent: true,
          devPageName: 'Console-助手面板',
        },
      },
      {
        path: 'communities/:communityId/event-assistant/logs',
        name: 'ConsoleMobileAssistantLogs',
        component: () => import('../views/console/mobile/ConsoleEventAssistantLogsMobile.vue'),
        beforeEnter: communityRouteGuard,
        meta: {
          title: 'アシスタント履歴',
          hideTabbar: true,
          hideShellHeader: true,
          flushContent: true,
          devPageName: 'Console-助手履歴',
        },
      },
      {
        path: 'communities/:communityId/events/form',
        name: 'ConsoleMobileEventForm',
        component: () => import('../views/console/EventForm.vue'),
        beforeEnter: communityRouteGuard,
        meta: {
          title: 'イベント作成',
          hideTabbar: true,
          hideShellHeader: true,
          layout: 'console-mobile',
          flushContent: true,
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
          flushContent: true,
          devPageName: 'Console-活动详情编辑',
        },
      },
      {
        path: 'communities/:communityId/settings',
        name: 'ConsoleMobileCommunitySettings',
        component: () => import('../views/console/mobile/ConsoleCommunitySettingsMobile.vue'),
        beforeEnter: communityRouteGuard,
        meta: {
          title: 'コミュニティ設定',
          hideTabbar: true,
          hideShellHeader: true,
          devPageName: 'Console-社群設定',
          flushContent: true,
        },
      },
      {
        path: 'communities/:communityId/portal',
        name: 'ConsoleMobileCommunityPortal',
        component: () => import('../views/console/mobile/ConsoleCommunityPortalMobile.vue'),
        beforeEnter: communityRouteGuard,
        meta: {
          title: 'ポータル設定',
          hideTabbar: true,
          hideShellHeader: true,
          devPageName: 'Console-门户模板',
          flushContent: true,
          layout: 'console-mobile',
        },
      },
      {
        path: 'events/:eventId/manage',
        name: 'ConsoleMobileEventManage',
        component: () => import('../views/console/mobile/ConsoleEventManageMobile.vue'),
        meta: {
          title: 'イベント管理',
          devPageName: 'Console-活动管理',
          hideShellHeader: true,
          hideTabbar: true,
          flushContent: true,
        },
      },
      {
        path: 'events/:eventId/publish-success',
        name: 'ConsoleMobileEventPublishSuccess',
        component: () => import('../views/console/mobile/ConsoleEventPublishSuccessMobile.vue'),
        meta: {
          title: '公開完了',
          hideTabbar: true,
          hideShellHeader: true,
          layout: 'console-mobile',
          flushContent: true,
          devPageName: 'Console-活动发布成功',
        },
      },
      {
        path: 'settings/payout',
        name: 'ConsoleMobilePayout',
        component: () => import('../views/console/mobile/PayoutSettingsMobile.vue'),
        meta: {
          title: 'コミュニティ財務',
          devPageName: 'Console-收款设置',
          flushContent: true,
          hideShellHeader: true,
          layout: 'console-mobile',
          hideTabbar: true,
        },
      },
      {
        path: 'communities/:communityId/payments',
        name: 'ConsoleMobilePayments',
        component: () => import('../views/console/mobile/ConsolePaymentsMobile.vue'),
        beforeEnter: communityRouteGuard,
        meta: {
          title: '決済履歴',
          devPageName: 'Console-收款流水',
          hideTabbar: true,
          hideShellHeader: true,
          flushContent: true,
          layout: 'console-mobile',
        },
      },
      {
        path: 'subscription',
        name: 'ConsoleMobileSubscription',
        beforeEnter: (_to, _from, next) => next({ name: 'ConsoleMobileSubscriptionStandalone' }),
        component: () => import('../views/console/mobile/SubscriptionMobile.vue'),
        meta: {
          title: 'サブスクリプション',
          devPageName: 'Console-订阅管理',
          hideShellHeader: true,
          hideTabbar: true,
          flushContent: true,
          layout: 'console-mobile',
        },
      },
      {
        path: 'tickets/scanner',
        name: 'ConsoleTicketScanner',
        component: () => import('../views/console/mobile/ConsoleTicketScannerMobile.vue'),
        meta: {
          title: 'チケットスキャン',
          hideTabbar: true,
          hideShellHeader: true,
          layout: 'console-mobile',
          flushContent: true,
          devPageName: 'Console-验票扫码',
        },
      },
    ],
  },
  {
    path: '/console-subscription',
    name: 'ConsoleMobileSubscriptionStandalone',
    component: () => import('../views/console/mobile/SubscriptionMobile.vue'),
    meta: {
      devPageName: 'Console-订阅管理-独立',
      hideTabbar: true,
      hideShellHeader: true,
      layout: 'console-mobile',
      flushContent: true,
    },
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
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      hideShellHeader: true,
      flushContent: true,
      devPageName: '管理员后台',
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
      devPageName: '资源配置',
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
      devPageName: '资源配置详情',
    },
    props: true,
  },
  {
    path: '/admin/ai',
    name: 'admin-ai-overview',
    component: () => import('../views/admin/AdminAiOverview.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, hideShellHeader: true, flushContent: true, devPageName: 'AI 使用概览' },
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
      devPageName: 'AI 控制台',
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
    meta: { requiresAuth: true, requiresAdmin: true, hideShellHeader: true, flushContent: true, devPageName: 'AI 使用详情' },
    props: true,
  },
  {
    path: '/admin/events/reviews',
    name: 'admin-event-reviews',
    component: () => import('../views/admin/AdminEventReviews.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, hideShellHeader: true, flushContent: true, devPageName: '事件審査' },
  },
  {
    path: '/admin/payments',
    name: 'admin-payments',
    component: () => import('../views/admin/AdminPayments.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, hideShellHeader: true, flushContent: true, devPageName: '決済モニター' },
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
      flushContent: true,
      devPageName: '社群门户',
    },
  },
  {
    path: '/community/:slug/classes',
    name: 'community-classes',
    component: () => import('../views/community/CommunityClassesList.vue'),
    meta: {
      layout: 'mobile-user',
      hideShellHeader: true,
      hideTabbar: true,
      mobileOnly: true,
      flushContent: true,
      devPageName: '社区教室列表',
    },
    props: true,
  },
  {
    path: '/community/:slug/classes/:classId',
    name: 'community-class-detail',
    component: () => import('../views/community/ClassDetail.vue'),
    meta: {
      layout: 'mobile-user',
      hideShellHeader: true,
      hideTabbar: true,
      mobileOnly: true,
      flushContent: true,
      devPageName: '社区教室详情',
    },
    props: true,
  },
  {
    path: '/me/events',
    name: 'my-events',
    component: MyEvents,
    meta: {
      title: 'マイイベント',
      devPageName: '我的活动',
      hideTabbar: true,
      hideShellHeader: true,
      flushContent: true,
    },
  },
  {
    path: '/me/payments',
    name: 'my-payments',
    component: MyPayments,
    meta: {
      title: '支払い履歴',
      devPageName: '支払い履歴',
      hideTabbar: true,
      hideShellHeader: true,
      flushContent: true,
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
      devPageName: '登录回调',
    },
  },
  {
    path: '/payments/success',
    name: 'payment-success',
    component: PaymentSuccess,
    meta: {
      devPageName: '支付成功',
      title: '申込完了',
    },
  },
  {
    path: '/payments/cancel',
    name: 'payment-cancel',
    component: PaymentCancel,
    meta: {
      devPageName: '支付取消',
      title: '申込未完了',
    },
  },
  {
    path: '/payments/return',
    name: 'payment-return',
    component: PaymentReturn,
    meta: {
      devPageName: '支付返回',
      title: 'お支払い結果',
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      layout: 'mobile-user',
    },
  },
  {
    path: '/liff/payments/return',
    name: 'payment-return-liff',
    component: PaymentReturn,
    meta: {
      devPageName: '支付返回(LIFF)',
      title: 'お支払い結果',
      hideShellHeader: true,
      hideTabbar: true,
      flushContent: true,
      layout: 'mobile-user',
    },
  },
  {
    path: '/console/stripe-return',
    name: 'console-stripe-return',
    component: StripeReturn,
    meta: {
      devPageName: 'Stripe 返回页',
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
  const disableLiffTitle = import.meta.env.DISABLE_LIFF_TITLE !== 'false'; // 默认禁用，显式设置 false 才启用
  document.title = isLineInAppBrowser() ? pageTitle : `${pageTitle} | ${APP_NAME}`;
  if (disableLiffTitle) return;
  if (isLineInAppBrowser()) {
    try {
      const { loadLiff } = await import('../utils/liff');
      const liffInstance = await loadLiff();
      liffInstance?.setTitle?.(pageTitle);
    } catch (error) {
      console.warn('Failed to set LIFF title; continuing with document.title only.', error);
    }
  }
};

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async (to, from, next) => {
  const auth = useAuth();
  const sheets = useAuthSheets();
  const mobile = isMobile();
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
    const isTest =
      import.meta.env.MODE === 'test' ||
      (typeof window !== 'undefined' && window.location.hostname.includes('test.socialmore.jp'));
    const isMobileUA = mobile;
    const promoCandidate = to.path !== '/promo';
    if (isTest && !isMobileUA && promoCandidate) {
      return next({ path: '/promo', query: { from: to.fullPath } });
    }
    const showed = sheets.showLoginSheet({ returnTo: to.fullPath });
    if (showed) return next(false);
    return next({ name: 'auth-login', query: { redirect: to.fullPath } });
  }

  if (to.meta.requiresAdmin && !auth.user.value?.isAdmin) {
    const showed = sheets.showForbiddenSheet({ reason: 'NOT_ADMIN', returnTo: to.fullPath });
    if (showed) return next(false);
    return next({ name: 'home' });
  }

  if (to.meta.requiresOrganizer && !auth.user.value?.isOrganizer && !auth.user.value?.isAdmin) {
    // コンソール配下のみ主理人チェックを強制。ユーザー側動線は通す。
    if (to.path.startsWith('/console')) {
      const showed = sheets.showForbiddenSheet({ reason: 'NOT_ORGANIZER', returnTo: to.fullPath });
      if (showed) return next(false);
      return next({ name: 'home' });
    }
    return next();
  }

  return next();
});

router.afterEach((to, from) => {
  const enableDebug = () => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('router_debug') === '1';
  };
  if (import.meta.env.DEV && enableDebug()) {
    // eslint-disable-next-line no-console
    console.log('[router] nav', { from: from.fullPath, to: to.fullPath, name: to.name });
  }
});

router.afterEach((to) => {
  void applyPageTitle(to);
});

export default router;
