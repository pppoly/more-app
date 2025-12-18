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

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  initializing: boolean;
}

const TOKEN_KEY = 'moreapp_access_token';

const state = reactive<AuthState>({
  user: null,
  accessToken: null,
  initializing: false,
});

let initialized = false;
let handlingUnauthorized = false;
let liffLoginPromise: Promise<void> | null = null;
let liffProfilePromise: Promise<void> | null = null;
const LIFF_LOGIN_COOLDOWN_MS = 30_000;
const MAX_LIFF_LOGIN_ATTEMPTS = 3;
const LIFF_LOGIN_TS_KEY = 'moreapp_liff_last_login_at';
const LIFF_LOGIN_ATTEMPTS_KEY = 'moreapp_liff_login_attempts';
let lastLiffLoginAttempt = 0;
let liffLoginAttempts = 0;
const { setLocale } = useLocale();
const consoleCommunityStore = useConsoleCommunityStore();
const backendBase = API_BASE_URL.replace(/\/$/, '').replace(/\/api\/v1$/, '');
const needsLiffOpen = ref(false);
const liffAuthHardStopped = ref(false);

function loadLiffLoginState() {
  if (!hasWindow()) return;
  const ts = window.sessionStorage.getItem(LIFF_LOGIN_TS_KEY);
  const attempts = window.sessionStorage.getItem(LIFF_LOGIN_ATTEMPTS_KEY);
  lastLiffLoginAttempt = ts ? Number(ts) || 0 : 0;
  liffLoginAttempts = attempts ? Number(attempts) || 0 : 0;
}

function recordLiffLoginAttempt() {
  if (!hasWindow()) return;
  lastLiffLoginAttempt = Date.now();
  liffLoginAttempts += 1;
  window.sessionStorage.setItem(LIFF_LOGIN_TS_KEY, String(lastLiffLoginAttempt));
  window.sessionStorage.setItem(LIFF_LOGIN_ATTEMPTS_KEY, String(liffLoginAttempts));
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
  if (typeof window === 'undefined') return;
  const redirectUri = window.location.href;
  const url = `${backendBase}/api/v1/auth/line/redirect?redirect=${encodeURIComponent(redirectUri)}`;
  window.location.href = url;
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
  if (APP_TARGET !== 'liff' || !hasWindow()) return;
  loadLiffLoginState();
  if (!LIFF_ID) {
    console.warn('LIFF_ID is not configured; skip LIFF login.');
    liffAuthHardStopped.value = true;
    needsLiffOpen.value = true;
    return;
  }
  if (liffAuthHardStopped.value) {
    console.warn('LIFF login hard-stopped due to previous failures.');
    return;
  }
  if (liffLoginAttempts >= MAX_LIFF_LOGIN_ATTEMPTS) {
    liffAuthHardStopped.value = true;
    console.warn('Reached max LIFF login attempts; stop retrying to avoid loops.');
    needsLiffOpen.value = true;
    return;
  }
  const now = Date.now();
  if (lastLiffLoginAttempt && now - lastLiffLoginAttempt < LIFF_LOGIN_COOLDOWN_MS) {
    console.warn('Skipping LIFF login to avoid rapid retries.');
    return;
  }
  recordLiffLoginAttempt();
  if (liffLoginPromise) return liffLoginPromise;
  liffLoginPromise = (async () => {
    state.initializing = true;
    try {
      const liff = await loadLiff(LIFF_ID);
      if (!isLiffReady.value) {
        console.warn('LIFF init not ready; skip LIFF one-tap login.');
        return;
      }
      if (!liff.isInClient || !liff.isInClient()) {
        console.warn('Not in LIFF client; skip LIFF one-tap login.');
        return;
      }
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        return;
      }
      const idToken = liff.getIDToken() || undefined;
      const accessToken = typeof liff.getAccessToken === 'function' ? liff.getAccessToken() : undefined;
      if (!idToken && !accessToken) {
        recordLiffLoginAttempt();
        liff.login({ redirectUri: window.location.href });
        return;
      }
      const profile = await liff.getProfile().catch(() => null);
      try {
        const response = await lineLiffTokenLogin({
          idToken,
          accessToken,
          displayName: profile?.displayName,
          pictureUrl: profile?.pictureUrl,
        });
        setToken(response.accessToken);
        state.user = normalizeUser(response.user);
        applyUserLocale(state.user);
        trackEvent('liff_login_success');
      } catch (apiError) {
        console.warn('LIFF token login failed, fallback to LINE OAuth.', apiError);
        trackEvent('liff_login_fail');
        redirectToLineOauth();
      }
    } catch (error) {
      console.error('LIFF login failed', error);
      if (liffLoginAttempts >= MAX_LIFF_LOGIN_ATTEMPTS) {
        liffAuthHardStopped.value = true;
        needsLiffOpen.value = true;
      }
      window.sessionStorage.setItem(LIFF_LOGIN_TS_KEY, String(Date.now()));
      trackEvent('liff_login_fail');
      reportError('liff:login_failed', { message: error instanceof Error ? error.message : String(error) });
    } finally {
      state.initializing = false;
      liffLoginPromise = null;
    }
  })();
  return liffLoginPromise;
}

function handleUnauthorized() {
  if (handlingUnauthorized) return;
  handlingUnauthorized = true;
  setToken(null);
  state.user = null;
  if (APP_TARGET === 'liff') {
    loadLiffLoginState();
    const now = Date.now();
    if (lastLiffLoginAttempt && now - lastLiffLoginAttempt < LIFF_LOGIN_COOLDOWN_MS) {
      handlingUnauthorized = false;
      return;
    }
    if (liffAuthHardStopped.value) {
      handlingUnauthorized = false;
      needsLiffOpen.value = true;
      return;
    }
    ensureLiffLogin().finally(() => {
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

onUnauthorized(() => handleUnauthorized());

async function restoreSession() {
  if (initialized) return;
  initialized = true;
  if (!hasWindow()) return;
  const stored = window.localStorage.getItem(TOKEN_KEY);
  if (!stored) {
    if (APP_TARGET === 'liff') {
      await ensureLiffLogin();
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
      await ensureLiffLogin();
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

  const loginWithLiff = async () => ensureLiffLogin();

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
