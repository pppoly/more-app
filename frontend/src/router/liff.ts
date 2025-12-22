import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import MobileEvents from '../views/mobile/MobileEvents.vue';
import MobileEventDetail from '../views/mobile/MobileEventDetail.vue';
import MobileMe from '../views/mobile/MobileMe.vue';
import Login from '../views/auth/Login.vue';
import { beginNav, beginNavPending, endNavPending } from '../composables/useNavStack';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/events' },
  {
    path: '/events',
    name: 'liff-events',
    component: MobileEvents,
    meta: { hideShellHeader: true, hideTabbar: true, flushContent: true },
  },
  {
    path: '/events/:eventId',
    name: 'liff-event-detail',
    component: MobileEventDetail,
    props: true,
    meta: { hideShellHeader: true, hideTabbar: true, flushContent: true },
  },
  {
    path: '/me',
    name: 'liff-me',
    component: MobileMe,
    meta: { hideShellHeader: true, hideTabbar: true, flushContent: true },
  },
  {
    path: '/login',
    name: 'liff-login',
    component: Login,
    meta: { hideShellHeader: true, hideTabbar: true, flushContent: true },
  },
];

const router = createRouter({
  history: createWebHistory('/liff'),
  routes,
});

let replacePending = false;
const originalReplace = router.replace.bind(router);
router.replace = ((to) => {
  replacePending = true;
  return originalReplace(to);
}) as typeof router.replace;
const originalPush = router.push.bind(router);
router.push = ((to) => {
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
