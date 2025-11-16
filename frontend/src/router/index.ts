import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import Home from '../views/Home.vue';
import EventList from '../views/events/EventList.vue';
import EventDetail from '../views/events/EventDetail.vue';
import ConsoleHome from '../views/console/ConsoleHome.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: Home,
  },
  {
    path: '/events',
    name: 'events',
    component: EventList,
  },
  {
    path: '/events/:eventId',
    name: 'event-detail',
    component: EventDetail,
    props: true,
  },
  {
    path: '/console',
    name: 'console-home',
    component: ConsoleHome,
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
