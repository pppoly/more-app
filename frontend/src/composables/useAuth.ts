import { computed, reactive, ref } from 'vue';
import {
  devLogin as apiDevLogin,
  fetchMe,
  isBusinessError,
  isNetworkError,
  isServerError,
  lineLiffLogin,
  lineLiffTokenLogin,
  lineLiffProfileLogin,
  onUnauthorized,
  setAccessToken as applyClientToken,
  setRequestHeaderProvider,
  sendAnalyticsEvents,
} from '../api/client';
import type { UserProfile } from '../types/api';
import { resolveAssetUrl } from '../utils/assetUrl';
import { useLocale } from './useLocale';
import { API_BASE_URL, APP_TARGET, requireLiffId } from '../config';
import { isLineInAppBrowser, isLiffReady, loadLiff } from '../utils/liff';
import { reportError } from '../utils/reporting';
import { useConsoleCommunityStore } from '../stores/consoleCommunity';
import { trackEvent } from '../utils/analytics';
import { isLiffClient } from '../utils/device';
import { useAuthSheets } from './useAuthSheets';
import { useToast } from './useToast';
import { LOGIN_REDIRECT_STORAGE_KEY } from '../constants/auth';

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  initializing: boolean;
}

type LiffAuthFailReason =
  | 'missing_id'
  | 'init_failed'
  | 'not_in_client'
  | 'login_redirect'
  | 'no_token'
  | 'token_exchange_failed'
  | 'unknown';

type LiffAuthResult = { ok: true } | { ok: false; reason: LiffAuthFailReason };

const TOKEN_KEY = 'moreapp_access_token';
const debugAuth = import.meta.env.DEV || import.meta.env.MODE === 'staging' || import.meta.env.MODE === 'test';
const isTestEnv = import.meta.env.MODE === 'test';
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
let liffBootstrapPromise: Promise<LiffAuthResult> | null = null;
const LIFF_LOGIN_INFLIGHT_UNTIL_KEY = 'liff_login_inflight_until';
const { setLocale } = useLocale();
const consoleCommunityStore = useConsoleCommunityStore();
const backendBase = API_BASE_URL.replace(/\/$/, '').replace(/\/api\/v1$/, '');
const needsLiffOpen = ref(false);
const authSheets = useAuthSheets();
const liffAuthHardStopped = ref(false);
const backendUnavailable = ref(false);
const fatalError = ref<Error | null>(null);
const toast = useToast();

const resolveLiffId = () => {
  try {
    return requireLiffId();
  } catch (error) {
    console.error('LIFF_ID is required for LIFF login.', error);
    return '';
  }
};

function sanitizeLiffState(raw: string | null): string {
  if (!raw) return '/events';
  try {
    return decodeURIComponent(raw);
  } catch {
    return '/events';
  }
}

async function emitLiffDebug(stage: string, payload: Record<string, any> = {}) {
  // Always log to console for callback visibility; payload must be token-safe.
  // eslint-disable-next-line no-console
  console.info('[liff-callback]', stage, payload);
  logDevAuth(`debug:${stage}`, payload);
  if (!isTestEnv || typeof window === 'undefined') return;
  const safePayload = {
    ...payload,
    stage,
    path: window.location.pathname + window.location.search,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  };
  try {
    await sendAnalyticsEvents([
      {
        eventName: 'liff_debug',
        timestamp: new Date().toISOString(),
        sessionId: 'liff-debug',
        path: safePayload.path,
        isLiff: true,
        userAgent: safePayload.userAgent,
        payload: safePayload,
      },
    ]);
  } catch (err) {
    logDevAuth('liff_debug send failed', err);
  }
}

async function exchangeLiffToken(
  endpoint: '/api/v1/auth/line/liff-login' | '/api/v1/auth/line/liff',
  body: Record<string, any>,
) {
  const url = `${backendBase}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Target': APP_TARGET },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  const status = response.status;
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    // ignore parse error; data stays null
  }
  if (!response.ok) {
    const error = new Error(`exchange failed: ${status}`);
    (error as any).status = status;
    throw error;
  }
  return { data, status };
}

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
  // UI の基本言語は日本語に固定し、日本語以外の設定は無視する
  if (locale === 'ja' || !locale) {
    setLocale('ja');
  }
}

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function getStoredRedirect(): string | null {
  if (!hasWindow()) return null;
  const raw = window.localStorage.getItem(LOGIN_REDIRECT_STORAGE_KEY);
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

function clearStoredRedirect() {
  if (!hasWindow()) return;
  window.localStorage.removeItem(LOGIN_REDIRECT_STORAGE_KEY);
}

function isLiffHost(): boolean {
  if (!hasWindow()) return false;
  const host = window.location.hostname;
  return host.includes('miniapp.line.me') || host.includes('liff.line.me');
}

function shouldAttemptLiffAuth(): boolean {
  if (!hasWindow()) return false;
  if (APP_TARGET === 'liff') return true;
  if (isLiffHost()) return true;
  return isLiffClient() || isLineInAppBrowser();
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
  // In LIFF client, block web OAuth redirect to avoid loops.
  if (isLiffClient() || isLiffHost() || isLineInAppBrowser()) {
    logDevAuth('redirectToLineOauth skipped in LIFF client');
    return;
  }
  if (typeof window === 'undefined') return;
  const redirectUri = window.location.href;
  const url = `${backendBase}/api/v1/auth/line/redirect?redirect=${encodeURIComponent(redirectUri)}`;
  window.location.href = url;
}

async function bootstrapLiffAuth(force = false): Promise<LiffAuthResult> {
  if (!hasWindow()) return { ok: false, reason: 'not_in_client' };
  if (!shouldAttemptLiffAuth()) return { ok: false, reason: 'not_in_client' };
  if (state.accessToken && !force) return { ok: true };
  const resolvedLiffId = resolveLiffId();
  if (!resolvedLiffId) {
    console.warn('LIFF_ID is not configured; skip LIFF login.');
    liffAuthHardStopped.value = true;
    needsLiffOpen.value = true;
    if (force) {
      toast.show('LINE 設定が未完了です。管理者に連絡してください。', 'error');
    }
    return { ok: false, reason: 'missing_id' };
  }
  if (liffAuthHardStopped.value) {
    logDevAuth('liff auth hard-stopped');
    return { ok: false, reason: 'unknown' };
  }
  if (liffBootstrapPromise) return liffBootstrapPromise;
  liffBootstrapPromise = (async () => {
    state.initializing = true;
    const notify = force;
    const fail = (reason: LiffAuthFailReason, message?: string, type: 'error' | 'info' = 'error'): LiffAuthResult => {
      if (notify && message) {
        toast.show(message, type);
      }
      return { ok: false, reason };
    };
    try {
      const search = window.location.search || '';
      const isCallback =
        /(?:^|[?&])(code|state|liff\.state)=/.test(search);
      const liffStateParam = new URLSearchParams(search).get('liff.state');

      // 回调阶段：禁止再次触发 login，直接做 token exchange
      if (isCallback) {
        emitLiffDebug('callback_enter');
        markLiffLoginInflight();
        const liff = await loadLiff(resolvedLiffId);
        // ready を待機（最大 8 秒）。タイムアウトは失敗扱いだが login は再実行しない
        try {
          emitLiffDebug('callback_wait_ready');
          const ready = (liff as any).ready;
          if (ready && typeof ready.then === 'function') {
            await Promise.race([
              ready,
              new Promise((_, reject) => setTimeout(() => reject(new Error('liff.ready timeout')), 8000)),
            ]);
          }
          emitLiffDebug('callback_ready_ok');
        } catch (err) {
          await emitLiffDebug('callback_ready_timeout', { error: err instanceof Error ? err.message : String(err) });
          reportError('liff:ready_timeout', { message: err instanceof Error ? err.message : String(err) });
          // 即便 ready 超时，继续尝试获取 token，禁止再 login
        }
        const idToken = typeof liff.getIDToken === 'function' ? liff.getIDToken() : undefined;
        const accessToken = typeof liff.getAccessToken === 'function' ? liff.getAccessToken() : undefined;
        await emitLiffDebug('callback_tokens', { hasIdToken: !!idToken, hasAccessToken: !!accessToken });
        const profile = await liff.getProfile().catch(() => null);
        let exchangeEndpoint:
          | '/api/v1/auth/line/liff-login'
          | '/api/v1/auth/line/liff'
          | '/api/v1/auth/line/liff-profile'
          | null = null;
        let exchangeStatus: number | null = null;
        if (idToken) {
          exchangeEndpoint = '/api/v1/auth/line/liff-login';
          await emitLiffDebug('callback_exchange_start', { endpoint: exchangeEndpoint });
          const { data, status } = await exchangeLiffToken(exchangeEndpoint, {
            idToken,
            displayName: profile?.displayName,
            pictureUrl: profile?.pictureUrl,
          });
          exchangeStatus = status;
          setToken(data?.accessToken);
          state.user = normalizeUser(data?.user);
          applyUserLocale(state.user);
          trackEvent('liff_login_success');
        } else if (accessToken) {
          exchangeEndpoint = '/api/v1/auth/line/liff';
          await emitLiffDebug('callback_exchange_start', { endpoint: exchangeEndpoint });
          const { data, status } = await exchangeLiffToken(exchangeEndpoint, {
            accessToken,
            displayName: profile?.displayName,
            pictureUrl: profile?.pictureUrl,
          });
          exchangeStatus = status;
          setToken(data?.accessToken);
          state.user = normalizeUser(data?.user);
          applyUserLocale(state.user);
          trackEvent('liff_login_success');
        } else if (profile?.userId) {
          exchangeEndpoint = '/api/v1/auth/line/liff-profile';
          await emitLiffDebug('callback_exchange_start', { endpoint: exchangeEndpoint });
          const response = await lineLiffProfileLogin({
            lineUserId: profile.userId,
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl,
          });
          exchangeStatus = 200;
          setToken(response?.accessToken);
          state.user = normalizeUser(response?.user ?? null);
          applyUserLocale(state.user);
          trackEvent('liff_login_success');
        } else {
          await emitLiffDebug('callback_no_token');
          return fail('no_token', 'LINE ログインに失敗しました。もう一度お試しください。');
        }
        clearStoredRedirect();
        await emitLiffDebug('callback_exchange_done', {
          endpoint: exchangeEndpoint,
          status: exchangeStatus,
          hasUser: !!state.user,
          hasAccessToken: !!state.accessToken,
        });
        clearLiffLoginInflight();
        const cleanTarget = sanitizeLiffState(liffStateParam);
        window.history.replaceState({}, document.title, cleanTarget);
        return { ok: true };
      }

      const liff = await loadLiff(resolvedLiffId);
      if (!isLiffReady.value) {
        logDevAuth('liff not ready');
        return fail('init_failed', 'LINE ログインの初期化に失敗しました。');
      }
      try {
        const ready = (liff as any).ready;
        if (ready && typeof ready.then === 'function') {
          await Promise.race([
            ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error('liff.ready timeout')), 4000)),
          ]);
        }
      } catch (err) {
        logDevAuth('liff.ready timeout (non-callback)', err);
      }
      const inClient = typeof liff.isInClient === 'function' ? liff.isInClient() : false;
      const loggedIn = typeof liff.isLoggedIn === 'function' ? liff.isLoggedIn() : false;
      logDevAuth('bootstrap', { inClient, loggedIn, apiBase: API_BASE_URL });
      if (!inClient) {
        logDevAuth('not in liff client; skip login');
        needsLiffOpen.value = true;
        return fail('not_in_client', 'LINE アプリ内で開いてください。');
      }
      const path = window.location.pathname.startsWith('/liff') ? window.location.pathname : '/liff';
      const storedRedirect = getStoredRedirect();
      const toPath = window.location.pathname.startsWith('/liff')
        ? window.location.pathname.replace(/^\/liff/, '') || '/'
        : window.location.pathname;
      const toQuery = window.location.search || '';
      const toValue = storedRedirect || `${toPath}${toQuery}`;
      const cleanRedirect = `${window.location.origin}${path}?to=${encodeURIComponent(toValue)}`;
      if (!loggedIn) {
        logDevAuth('not logged in inside LIFF client');
        needsLiffOpen.value = true;
        if (force && !isLiffLoginInflight() && typeof liff.login === 'function') {
          markLiffLoginInflight();
          liff.login({ redirectUri: cleanRedirect });
          return fail('login_redirect');
        }
        return fail('login_redirect');
      }
      clearLiffLoginInflight();
      let profile: any = null;
      try {
        profile = await liff.getProfile();
      } catch {
        profile = null;
      }
      const idToken = typeof liff.getIDToken === 'function' ? liff.getIDToken() : undefined;
      const accessToken = typeof liff.getAccessToken === 'function' ? liff.getAccessToken() : undefined;
      logDevAuth('idToken exists', !!idToken, idToken ? String(idToken).slice(0, 20) : '');
      if (!idToken && accessToken) {
        logDevAuth('exchanging accessToken with backend /auth/line/liff');
        const response = await lineLiffTokenLogin({
          accessToken,
          displayName: profile?.displayName,
          pictureUrl: profile?.pictureUrl,
        });
        logDevAuth('token exchange ok', { userId: response?.user?.id, hasAccessToken: !!response?.accessToken });
        setToken(response.accessToken);
        state.user = normalizeUser(response.user);
        applyUserLocale(state.user);
        trackEvent('liff_login_success');
        clearLiffLoginInflight();
      } else if (!idToken && profile?.userId) {
        logDevAuth('no token; fallback to profile login');
        const response = await lineLiffProfileLogin({
          lineUserId: profile.userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
        });
        logDevAuth('profile login ok', { userId: response?.user?.id, hasAccessToken: !!response?.accessToken });
        setToken(response.accessToken);
        state.user = normalizeUser(response.user);
        applyUserLocale(state.user);
        trackEvent('liff_login_success');
        clearLiffLoginInflight();
      } else if (!idToken) {
        logDevAuth('no token after login; cannot proceed');
        needsLiffOpen.value = true;
        return fail('no_token', 'LINE ログインに失敗しました。もう一度お試しください。');
      } else {
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
      }
      clearStoredRedirect();
      // URL の code/state を削除して、後続の重複判定を回避
      if (typeof window !== 'undefined' && window.location.search) {
        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, cleanUrl);
      }
      return { ok: true };
    } catch (error) {
      logDevAuth('bootstrap error', error);
      reportError('liff:login_failed', { message: error instanceof Error ? error.message : String(error) });
      return fail('token_exchange_failed', 'LINE ログインに失敗しました。もう一度お試しください。');
    } finally {
      state.initializing = false;
      liffBootstrapPromise = null;
    }
  })();
  return liffBootstrapPromise;
}

async function loginWithLiffProfile(isLiffEntry: boolean) {
  if (!isLiffEntry || state.accessToken) return;
  if (!shouldAttemptLiffAuth()) return;
  const resolvedLiffId = resolveLiffId();
  if (!resolvedLiffId) return;
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/liff')) {
    logDevAuth('skip profile login outside /liff endpoint');
    return;
  }
  if (liffProfilePromise) return liffProfilePromise;
  liffProfilePromise = (async () => {
    try {
      const liff = await loadLiff(resolvedLiffId);
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
      authSheets.hideLoginSheet();
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
  if (shouldAttemptLiffAuth()) {
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
  const showed = authSheets.showLoginSheet();
  if (!showed && typeof window !== 'undefined') {
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
    if (shouldAttemptLiffAuth()) {
      await bootstrapLiffAuth();
    }
    return;
  }
  setToken(stored);
  try {
    state.initializing = true;
    backendUnavailable.value = false;
    fatalError.value = null;
    state.user = await fetchMe();
    applyUserLocale(state.user);
  } catch (error) {
    console.error('Failed to restore session', error);
    if (isNetworkError(error)) {
      backendUnavailable.value = true;
      fatalError.value = error instanceof Error ? error : new Error('Network unavailable');
      return;
    }
    if (isBusinessError(error)) {
      setToken(null);
      state.user = null;
      if (shouldAttemptLiffAuth()) {
        await bootstrapLiffAuth(true);
      }
      return;
    }
    if (isServerError(error)) {
      return;
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
      authSheets.hideLoginSheet();
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
    authSheets.hideLoginSheet();
    applyUserLocale(state.user);
  };

  const setUserProfile = (profile: UserProfile | null) => {
    state.user = normalizeUser(profile);
    if (state.user) {
      authSheets.hideLoginSheet();
    }
    applyUserLocale(state.user);
  };

  const logout = () => {
    setToken(null);
    state.user = null;
    consoleCommunityStore.resetCommunities();
  };

  const loginWithLiff = async (): Promise<LiffAuthResult> => bootstrapLiffAuth(true);

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
    backendUnavailable: computed(() => backendUnavailable.value),
    fatalError: computed(() => fatalError.value),
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
