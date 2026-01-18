import { reactive } from 'vue';
import type { Router, RouteLocationNormalizedLoaded } from 'vue-router';

type ForbiddenReason = 'NOT_ORGANIZER' | 'NOT_COMMUNITY_MANAGER' | 'NOT_ADMIN' | string;

const state = reactive({
  login: {
    visible: false,
    returnTo: '/',
    pendingAction: '',
  },
  forbidden: {
    visible: false,
    reason: '' as ForbiddenReason,
    communityId: '' as string | undefined,
    returnTo: '/',
  },
});

const isMobileLike = () => {
  if (typeof window === 'undefined') return true;
  return window.innerWidth < 1024 || /Mobile|Android|iPhone|iPod|iPad|Line/i.test(navigator.userAgent || '');
};

let cachedRouter: Router | null = null;
let cachedRoute: RouteLocationNormalizedLoaded | null = null;

export function injectAuthSheetsContext(router?: Router, route?: RouteLocationNormalizedLoaded) {
  if (router) cachedRouter = router;
  if (route) cachedRoute = route;
}

export function useAuthSheets(router?: Router, route?: RouteLocationNormalizedLoaded) {
  if (router) cachedRouter = router;
  if (route) cachedRoute = route;

  const currentReturnTo = () => {
    if (cachedRoute?.fullPath) return cachedRoute.fullPath;
    if (typeof window === 'undefined') return '/';
    return window.location.pathname + window.location.search;
  };

  const showLoginSheet = (opts?: { returnTo?: string; pendingAction?: string }) => {
    state.login.visible = isMobileLike();
    state.login.returnTo = opts?.returnTo || currentReturnTo();
    state.login.pendingAction = opts?.pendingAction || '';
    return state.login.visible;
  };

  const hideLoginSheet = () => {
    state.login.visible = false;
  };

  const showForbiddenSheet = (opts: { reason: ForbiddenReason; communityId?: string; returnTo?: string }) => {
    state.forbidden.visible = isMobileLike();
    state.forbidden.reason = opts.reason;
    state.forbidden.communityId = opts.communityId;
    state.forbidden.returnTo = opts.returnTo || currentReturnTo();
    return state.forbidden.visible;
  };

  const hideForbiddenSheet = () => {
    state.forbidden.visible = false;
  };

  const goLogin = () => {
    hideLoginSheet();
    if (cachedRouter) {
      cachedRouter.push({ name: 'auth-login', query: { redirect: state.login.returnTo || '/' } });
    } else if (typeof window !== 'undefined') {
      window.location.href = `/auth/login?redirect=${encodeURIComponent(state.login.returnTo || '/')}`;
    }
  };

  const goOrganizerApply = () => {
    hideForbiddenSheet();
    if (cachedRouter) {
      cachedRouter.push({ name: 'organizer-apply', query: { redirect: state.forbidden.returnTo || '/' } });
    }
  };

  return {
    state,
    showLoginSheet,
    hideLoginSheet,
    showForbiddenSheet,
    hideForbiddenSheet,
    goLogin,
    goOrganizerApply,
  };
}
