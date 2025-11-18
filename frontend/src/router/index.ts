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
    meta: { desktopOnly: true },
  },
  {
    path: '/desktop-home',
    name: 'legacy-home',
    component: Home,
    meta: { desktopOnly: true },
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
    },
    props: true,
  },
  {
    path: '/organizer/apply',
    name: 'organizer-apply',
    component: OrganizerApply,
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
    },
  },
  {
    path: '/console',
    component: ConsoleMobileShell,
    meta: { requiresAuth: true, requiresOrganizer: true, layout: 'console-mobile' },
    children: [
      {
        path: '',
        name: 'ConsoleMobileHome',
        component: () => import('../views/console/mobile/ConsoleHomeMobile.vue'),
      },
      {
        path: 'communities/:communityId/events',
        name: 'ConsoleMobileCommunityEvents',
        component: () => import('../views/console/mobile/ConsoleCommunityEventsMobile.vue'),
        beforeEnter: communityRouteGuard,
      },
      {
        path: 'events/:eventId/manage',
        name: 'ConsoleMobileEventManage',
        component: () => import('../views/console/mobile/ConsoleEventManageMobile.vue'),
      },
      {
        path: 'settings/payout',
        name: 'ConsoleMobilePayout',
        component: () => import('../views/console/mobile/PayoutSettingsMobile.vue'),
      },
      {
        path: 'subscription',
        name: 'ConsoleMobileSubscription',
        component: () => import('../views/console/mobile/SubscriptionMobile.vue'),
      },
    ],
  },
  {
    path: '/console-desktop',
    component: ConsoleAccessLayout,
    meta: { requiresAuth: true, requiresOrganizer: true },
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
      },
      {
        path: 'communities',
        name: 'console-communities',
        component: CommunityList,
      },
      {
        path: 'communities/new',
        name: 'console-community-create',
        component: CommunityForm,
      },
      {
        path: 'communities/:communityId/edit',
        name: 'console-community-edit',
        component: CommunityForm,
        props: true,
        beforeEnter: communityRouteGuard,
      },
      {
        path: 'communities/:communityId/events',
        name: 'console-community-events',
        component: CommunityEvents,
        props: true,
        beforeEnter: communityRouteGuard,
      },
      {
        path: 'communities/:communityId/finance',
        name: 'console-community-finance',
        component: CommunityFinance,
        props: true,
        beforeEnter: communityRouteGuard,
      },
      {
        path: 'communities/:communityId/events/create',
        name: 'console-event-create',
        component: EventForm,
        props: true,
        beforeEnter: communityRouteGuard,
      },
      {
        path: 'events/:eventId/edit',
        name: 'console-event-edit',
        component: EventForm,
        props: true,
      },
      {
        path: 'events/:eventId/registrations',
        name: 'console-event-registrations',
        component: EventRegistrations,
        props: true,
      },
    ],
  },
  {
    path: '/admin',
    name: 'admin-home',
    component: AdminHome,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/community/:slug',
    name: 'community-portal',
    component: CommunityPortal,
    props: true,
  },
  {
    path: '/me/events',
    name: 'my-events',
    component: MyEvents,
  },
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: AuthCallback,
  },
  {
    path: '/payments/success',
    name: 'payment-success',
    component: PaymentSuccess,
  },
  {
    path: '/payments/cancel',
    name: 'payment-cancel',
    component: PaymentCancel,
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

  if (to.meta.requiresOrganizer && !auth.user.value?.isOrganizer) {
    return next({ name: 'organizer-apply' });
  }

  return next();
});

export default router;
