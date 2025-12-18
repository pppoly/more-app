import { computed, reactive, ref } from 'vue';
import {
  devLogin as apiDevLogin,
  fetchMe,
  lineLiffProfileLogin,
  lineLiffTokenLogin,
  onUnauthorized,
  setAccessToken as applyClientToken,
  setRequestHeaderProvider,
} from '../api/client';
import type { UserProfile } from '../types/api';
import { resolveAssetUrl } from '../utils/assetUrl';
import { useLocale } from './useLocale';
import { API_BASE_URL, APP_TARGET, LIFF_ID } from '../config';
import { isLiffReady, loadLiff } from '../utils/liff';
import { reportError } from '../utils/reporting';
import { useConsoleCommunityStore } from '../stores/consoleCommunity';
import { trackEvent } from '../utils/analytics';
import { isLineBrowser } from '../utils/device';

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  initializing: boolean;
}

const TOKEN_KEY = 'moreapp_access_token';
const debugAuth = import.meta.env.DEV || import.meta.env.MODE === 'staging' || import.meta.env.MODE === 'test';
const logDevAuth = (...args: any[]) => {
  if (!debugAuth) return;
  // eslint-disable-next-line no-console
  console.log('[liff-auth]', ...args);
};

const state = reactive<AuthState>({
  user: null,
  accessToken: null,
  initializing: false,
});

let initialized = false;
let handlingUnauthorized = false;
let liffLoginPromise: Promise<void> | null = null;
let liffProfilePromise: Promise<void> | null = null;
let liffBootstrapPromise: Promise<void> | null = null;
const LIFF_LOGIN_INFLIGHT_UNTIL_KEY = 'liff_login_inflight_until';
const { setLocale } = useLocale();
const consoleCommunityStore = useConsoleCommunityStore();
const backendBase = API_BASE_URL.replace(/\/$/, '').replace(/\/api\/v1$/, '');
const needsLiffOpen = ref(false);
const liffAuthHardStopped = ref(false);

function isLiffLoginInflight() {
  if (!hasWindow()) return false;
  const raw = window.localStorage.getItem(LIFF_LOGIN_INFLIGHT_UNTIL_KEY);
  if (!raw) return false;
  const until = Number(raw);
  if (Number.isNaN(until)) return false;
  return Date.now() < until;
}

function markLiffLoginInflight(ttlMs = 60_000) {
  if (!hasWindow()) return;
  const until = Date.now() + ttlMs;
  window.localStorage.setItem(LIFF_LOGIN_INFLIGHT_UNTIL_KEY, String(until));
}

function clearLiffLoginInflight() {
  if (!hasWindow()) return;
  window.localStorage.removeItem(LIFF_LOGIN_INFLIGHT_UNTIL_KEY);
}

function applyUserLocale(profile: UserProfile | null) {
  const locale = profile?.preferredLocale;
  // UI 基础语言固定为日语，忽略非日语的偏好设置
  if (locale === 'ja' || !locale) {
    setLocale('ja');
  }
}

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function setToken(token: string | null) {
  state.accessToken = token;
  applyClientToken(token);
  if (!token) {
    consoleCommunityStore.resetCommunities();
  }
  if (!hasWindow()) return;
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

setRequestHeaderProvider(() => ({
  'X-App-Target': APP_TARGET,
}));

function redirectToLineOauth() {
  // 在 LIFF 模式下禁用 Web OAuth 跳转，避免循环
  if (APP_TARGET === 'liff') {
    logDevAuth('redirectToLineOauth skipped in LIFF mode');
    return;
  }
  if (typeof window === 'undefined') return;
  const redirectUri = window.location.href;
  const url = `${backendBase}/api/v1/auth/line/redirect?redirect=${encodeURIComponent(redirectUri)}`;
  window.location.href = url;
}

async function bootstrapLiffAuth(force = false) {
  if (APP_TARGET !== 'liff' || !hasWindow()) return;
  if (state.accessToken && !force) return;
  if (!LIFF_ID) {
    console.warn('LIFF_ID is not configured; skip LIFF login.');
    liffAuthHardStopped.value = true;
    needsLiffOpen.value = true;
    return;
  }
  if (liffAuthHardStopped.value) {
    logDevAuth('liff auth hard-stopped');
    return;
  }
  if (liffBootstrapPromise) return liffBootstrapPromise;
  liffBootstrapPromise = (async () => {
    state.initializing = true;
    try {
      const search = window.location.search || '';
      const isCallback =
        /(?:^|[?&])(code|state|liff\.state)=/.test(search);
      const liffStateParam = new URLSearchParams(search).get('liff.state');

      // 回调阶段：禁止再次触发 login，直接做 token exchange
      if (isCallback) {
        logDevAuth('callback branch entered');
        markLiffLoginInflight();
        const liff = await loadLiff(LIFF_ID);
        // 等待 ready，最长 8 秒，超时视为失败但不再触发 login
        try {
          const ready = (liff as any).ready;
          if (ready && typeof ready.then === 'function') {
            await Promise.race([
              ready,
              new Promise((_, reject) => setTimeout(() => reject(new Error('liff.ready timeout')), 8000)),
            ]);
          }
        } catch (err) {
          logDevAuth('callback: liff ready timeout/fail', err);
          // 即便 ready 超时，继续尝试获取 token，禁止再 login
        }
        const idToken = typeof liff.getIDToken === 'function' ? liff.getIDToken() : undefined;
        const accessToken = typeof liff.getAccessToken === 'function' ? liff.getAccessToken() : undefined;
        logDevAuth('callback tokens', { hasIdToken: !!idToken, hasAccessToken: !!accessToken });
        const profile = await liff.getProfile().catch(() => null);
        if (idToken) {
          logDevAuth('callback exchange with /auth/line/liff-login');
          const response = await lineLiffLogin({
            idToken,
            displayName: profile?.displayName,
            pictureUrl: profile?.pictureUrl,
          });
          setToken(response.accessToken);
          state.user = normalizeUser(response.user);
          applyUserLocale(state.user);
          trackEvent('liff_login_success');
        } else if (accessToken) {
          logDevAuth('callback exchange with /auth/line/liff (access token)');
          const response = await lineLiffTokenLogin({
            accessToken,
            displayName: profile?.displayName,
            pictureUrl: profile?.pictureUrl,
          });
          setToken(response.accessToken);
          state.user = normalizeUser(response.user);
          applyUserLocale(state.user);
          trackEvent('liff_login_success');
        } else {
          logDevAuth('callback fatal: no token available');
          return;
        }
        clearLiffLoginInflight();
        const cleanTarget = liffStateParam ? decodeURIComponent(liffStateParam) : '/events';
        window.history.replaceState({}, document.title, cleanTarget);
        return;
      }

      const liff = await loadLiff(LIFF_ID);
      if (!isLiffReady.value) {
        logDevAuth('liff not ready');
        return;
      }
      const inClient = typeof liff.isInClient === 'function' ? liff.isInClient() : false;
      const loggedIn = typeof liff.isLoggedIn === 'function' ? liff.isLoggedIn() : false;
      logDevAuth('bootstrap', { inClient, loggedIn, apiBase: API_BASE_URL });
      if (!inClient) {
        logDevAuth('not in liff client; skip login');
        return;
      }
      if (!loggedIn) {
        if (isLiffLoginInflight()) {
          logDevAuth('login inflight (localStorage TTL); skip new login');
          return;
        }
        markLiffLoginInflight();
        const cleanRedirect = `${window.location.origin}${window.location.pathname}`;
        logDevAuth('calling liff.login', { reason: 'NOT_LOGGED_IN', redirect: cleanRedirect });
        liff.login({ redirectUri: cleanRedirect });
        return;
      }
      clearLiffLoginInflight();
      const idToken = typeof liff.getIDToken === 'function' ? liff.getIDToken() : undefined;
      logDevAuth('idToken exists', !!idToken, idToken ? String(idToken).slice(0, 20) : '');
      if (!idToken) {
        logDevAuth('no idToken after login; abort exchange');
        return;
      }
      let profile: any = null;
      try {
        profile = await liff.getProfile();
      } catch {
        profile = null;
      }
      logDevAuth('exchanging token with backend /auth/line/liff-login');
      const response = await lineLiffLogin({
        idToken,
        displayName: profile?.displayName,
        pictureUrl: profile?.pictureUrl,
      });
      logDevAuth('token exchange ok', { userId: response?.user?.id, hasAccessToken: !!response?.accessToken });
      setToken(response.accessToken);
      state.user = normalizeUser(response.user);
      applyUserLocale(state.user);
      trackEvent('liff_login_success');
      clearLiffLoginInflight();
      // 清理 URL 上的 code/state（如果有），避免后续重复判断
      if (typeof window !== 'undefined' && window.location.search) {
        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (error) {
      logDevAuth('bootstrap error', error);
      reportError('liff:login_failed', { message: error instanceof Error ? error.message : String(error) });
    } finally {
      state.initializing = false;
      liffBootstrapPromise = null;
    }
  })();
  return liffBootstrapPromise;
}

async function loginWithLiffProfile(isLiffEntry: boolean) {
  if (!isLiffEntry || state.accessToken) return;
  if (!LIFF_ID) return;
  if (liffProfilePromise) return liffProfilePromise;
  liffProfilePromise = (async () => {
    try {
      const liff = await loadLiff(LIFF_ID);
      if (!isLiffReady.value) {
        needsLiffOpen.value = true;
        return;
      }
      if (!liff.isInClient || !liff.isInClient()) {
        needsLiffOpen.value = true;
        return;
      }
      const profile = await liff.getProfile().catch(() => null);
      if (!profile?.userId) {
        needsLiffOpen.value = true;
        return;
      }
      const response = await lineLiffProfileLogin({
        lineUserId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl,
      });
      setToken(response.accessToken);
      state.user = normalizeUser(response.user);
      applyUserLocale(state.user);
      needsLiffOpen.value = false;
    } catch (error) {
      console.warn('LIFF profile login failed', error);
      needsLiffOpen.value = true;
    } finally {
      liffProfilePromise = null;
    }
  })();
  return liffProfilePromise;
}

async function ensureLiffLogin() {
  await bootstrapLiffAuth();
}

function handleUnauthorized(context?: { status?: number; url?: string }) {
  logDevAuth('handleUnauthorized', { status: context?.status, url: context?.url, inflight: isLiffLoginInflight() });
  if (handlingUnauthorized) return;
  handlingUnauthorized = true;
  setToken(null);
  state.user = null;
  if (APP_TARGET === 'liff') {
    if (isLiffLoginInflight()) {
      handlingUnauthorized = false;
      return;
    }
    bootstrapLiffAuth(true)
      .catch((error) => logDevAuth('bootstrapLiffAuth error after 401', error))
      .finally(() => {
        handlingUnauthorized = false;
      });
    return;
  }
  if (typeof window !== 'undefined') {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    const loginUrl = `/auth/login?redirect=${redirect}`;
    if (window.location.pathname !== '/auth/login') {
      window.location.href = loginUrl;
    }
  }
  setTimeout(() => {
    handlingUnauthorized = false;
  }, 500);
}

onUnauthorized((context) => handleUnauthorized(context));

async function restoreSession() {
  if (initialized) return;
  initialized = true;
  if (!hasWindow()) return;
  const stored = window.localStorage.getItem(TOKEN_KEY);
  if (!stored) {
    if (APP_TARGET === 'liff') {
      await bootstrapLiffAuth();
    }
    return;
  }
  setToken(stored);
  try {
    state.initializing = true;
    state.user = await fetchMe();
    applyUserLocale(state.user);
  } catch (error) {
    console.error('Failed to restore session', error);
    setToken(null);
    state.user = null;
    if (APP_TARGET === 'liff') {
      await bootstrapLiffAuth(true);
    }
  } finally {
    state.initializing = false;
  }
}

export function useAuth() {
  restoreSession();

  const loginDev = async (name: string, language?: string) => {
    state.initializing = true;
    try {
      const response = await apiDevLogin(name, language);
      setToken(response.accessToken);
      state.user = normalizeUser(response.user);
      applyUserLocale(state.user);
      consoleCommunityStore.loadCommunities(true).catch(() => undefined);
    } finally {
      state.initializing = false;
    }
  };

  const fetchCurrentUser = async () => {
    if (!state.accessToken) return;
    const profile = await fetchMe();
    state.user = normalizeUser(profile);
    applyUserLocale(state.user);
  };

  const setUserProfile = (profile: UserProfile | null) => {
    state.user = normalizeUser(profile);
    applyUserLocale(state.user);
  };

  const logout = () => {
    setToken(null);
    state.user = null;
    consoleCommunityStore.resetCommunities();
  };

  const loginWithLiff = async () => bootstrapLiffAuth(true);

  return {
    user: computed(() => state.user),
    accessToken: computed(() => state.accessToken),
    initializing: computed(() => state.initializing),
    loginDev,
    fetchCurrentUser,
    setUserProfile,
    logout,
    setToken,
    loginWithLiff,
    loginWithLiffProfile,
    needsLiffOpen: computed(() => needsLiffOpen.value),
  };
}

function normalizeUser(user: UserProfile | null): UserProfile | null {
  if (!user) return null;
  const normalized: UserProfile = {
    ...user,
    avatarUrl: user.avatarUrl ? resolveAssetUrl(user.avatarUrl) : undefined,
  };
  if (user.name?.toLowerCase() === 'admin') {
    normalized.isAdmin = true;
    normalized.isOrganizer = true;
  }
  return normalized;
}
