import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import Home from '../views/Home.vue';
import EventList from '../views/events/EventList.vue';
import EventDetail from '../views/events/EventDetail.vue';
import CommunityPortal from '../views/community/CommunityPortal.vue';
import MyEvents from '../views/me/MyEvents.vue';
import AuthCallback from '../views/auth/AuthCallback.vue';
import CommunityList from '../views/console/CommunityList.vue';
import CommunityForm from '../views/console/CommunityForm.vue';
import CommunityEvents from '../views/console/CommunityEvents.vue';
import EventForm from '../views/console/EventForm.vue';
import EventRegistrations from '../views/console/EventRegistrations.vue';

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
    redirect: '/console/communities',
  },
  {
    path: '/console/communities',
    name: 'console-communities',
    component: CommunityList,
  },
  {
    path: '/console/communities/new',
    name: 'console-community-create',
    component: CommunityForm,
  },
  {
    path: '/console/communities/:communityId/edit',
    name: 'console-community-edit',
    component: CommunityForm,
    props: true,
  },
  {
    path: '/console/communities/:communityId/events',
    name: 'console-community-events',
    component: CommunityEvents,
    props: true,
  },
  {
    path: '/console/communities/:communityId/events/create',
    name: 'console-event-create',
    component: EventForm,
    props: true,
  },
  {
    path: '/console/events/:eventId/edit',
    name: 'console-event-edit',
    component: EventForm,
    props: true,
  },
  {
    path: '/console/events/:eventId/registrations',
    name: 'console-event-registrations',
    component: EventRegistrations,
    props: true,
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
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
