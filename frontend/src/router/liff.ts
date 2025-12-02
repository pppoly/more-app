import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import MobileEvents from '../views/mobile/MobileEvents.vue';
import MobileEventDetail from '../views/mobile/MobileEventDetail.vue';
import MobileMe from '../views/mobile/MobileMe.vue';
import Login from '../views/auth/Login.vue';

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

export default router;
