import { ref } from 'vue';

export type NavDir = 'forward' | 'back' | 'replace';
export type NavType = 'page' | 'modal';

type RouteLike = {
  fullPath: string;
  meta?: Record<string, unknown>;
  redirectedFrom?: unknown;
};

let lastPos: number | null = null;
let dir: NavDir = 'forward';
let popstateBackPending = false;
let popstateBound = false;
const scrollMap = new Map<string, number>();
const MAX_SCROLL_ENTRIES = 50;
const navPending = ref(false);
let navPendingTimer: ReturnType<typeof setTimeout> | null = null;
const NAV_PENDING_DELAY_MS = 120;

const readHistoryPos = () => {
  if (typeof window === 'undefined') return null;
  const raw = window.history.state?.position;
  return typeof raw === 'number' ? raw : null;
};

const readHistoryBack = () => {
  if (typeof window === 'undefined') return null;
  const raw = window.history.state?.back;
  return typeof raw === 'string' ? raw : null;
};

const isBackTarget = (to: RouteLike) => {
  const back = readHistoryBack();
  if (!back) return false;
  if (back === to.fullPath) return true;
  return back.split('?')[0] === to.fullPath.split('?')[0];
};

export const setupPopstateListener = () => {
  if (popstateBound || typeof window === 'undefined') return;
  window.addEventListener('popstate', () => {
    // Mark the next navigation as a back action when history position is unavailable.
    popstateBackPending = true;
  });
  popstateBound = true;
};

export const beginNav = (
  to: RouteLike,
  from: RouteLike | null,
  info: { replaced?: boolean } = {},
) => {
  const replaced = Boolean(info.replaced);
  const redirected = Boolean(to.redirectedFrom);
  const toPos = readHistoryPos();

  if (replaced || redirected) {
    dir = 'replace';
    lastPos = toPos ?? lastPos;
    popstateBackPending = false;
    return;
  }

  if (typeof toPos === 'number' && typeof lastPos === 'number') {
    if (toPos > lastPos) dir = 'forward';
    else if (toPos < lastPos) dir = 'back';
    else if (popstateBackPending || isBackTarget(to)) {
      // Some WebViews keep position constant on pop; honor explicit back intent.
      dir = 'back';
    } else if (from && to.fullPath !== from.fullPath) {
      // Fallback when history position does not change on push.
      dir = 'forward';
    } else {
      dir = 'replace';
    }
    lastPos = toPos;
    popstateBackPending = false;
    return;
  }

  if (popstateBackPending || isBackTarget(to)) {
    dir = 'back';
    popstateBackPending = false;
  } else {
    dir = 'forward';
  }
  lastPos = toPos ?? lastPos;
};

export const getDir = () => dir;

export const beginNavPending = (delayMs: number = NAV_PENDING_DELAY_MS) => {
  if (navPendingTimer) {
    clearTimeout(navPendingTimer);
    navPendingTimer = null;
  }
  if (delayMs <= 0) {
    navPending.value = true;
    return;
  }
  navPendingTimer = setTimeout(() => {
    navPending.value = true;
    navPendingTimer = null;
  }, delayMs);
};

export const endNavPending = () => {
  if (navPendingTimer) {
    clearTimeout(navPendingTimer);
    navPendingTimer = null;
  }
  navPending.value = false;
};

export const useNavPending = () => navPending;

export const syncHistoryPos = () => {
  const pos = readHistoryPos();
  if (typeof pos === 'number') {
    lastPos = pos;
  }
};

export const getTransitionName = (route: RouteLike) => {
  if (route.meta?.navType === 'modal') return 'modal-up';
  if (dir === 'back') return 'page-pop';
  if (dir === 'forward') return 'page-push';
  return 'page-fade';
};

export const makeScrollKey = (route: RouteLike) => route.fullPath;

export const saveScroll = (route: RouteLike, el: HTMLElement | null) => {
  if (!el) return;
  if (dir === 'replace') return;
  const key = makeScrollKey(route);
  if (scrollMap.has(key)) {
    scrollMap.delete(key);
  }
  scrollMap.set(key, el.scrollTop);
  while (scrollMap.size > MAX_SCROLL_ENTRIES) {
    const oldestKey = scrollMap.keys().next().value;
    if (typeof oldestKey === 'string') {
      scrollMap.delete(oldestKey);
    } else {
      break;
    }
  }
};

export const restoreScroll = (route: RouteLike, el: HTMLElement | null) => {
  if (!el) return;
  if (dir === 'replace') return;
  const top = scrollMap.get(makeScrollKey(route)) ?? 0;
  const key = makeScrollKey(route);
  if (scrollMap.has(key)) {
    // Touch key to keep LRU order on restore.
    const value = scrollMap.get(key) ?? 0;
    scrollMap.delete(key);
    scrollMap.set(key, value);
  }
  // Two RAFs to ensure layout is settled before restoring scrollTop.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.scrollTop = top;
    });
  });
};
