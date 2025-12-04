import { computed, reactive } from 'vue';
import {
  devLogin as apiDevLogin,
  fetchMe,
  lineLiffLogin,
  onUnauthorized,
  setAccessToken as applyClientToken,
  setRequestHeaderProvider,
} from '../api/client';
import type { UserProfile } from '../types/api';
import { resolveAssetUrl } from '../utils/assetUrl';
import { useLocale } from './useLocale';
import { APP_TARGET, LIFF_ID } from '../config';
import { loadLiff } from '../utils/liff';
import { reportError } from '../utils/reporting';

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
const { setLocale } = useLocale();

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

async function ensureLiffLogin() {
  if (APP_TARGET !== 'liff' || !hasWindow()) return;
  if (!LIFF_ID) {
    console.warn('LIFF_ID is not configured; skip LIFF login.');
    return;
  }
  if (liffLoginPromise) return liffLoginPromise;
  liffLoginPromise = (async () => {
    state.initializing = true;
    try {
      const liff = await loadLiff(LIFF_ID);
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        return;
      }
      const idToken = liff.getIDToken();
      if (!idToken) {
        liff.login({ redirectUri: window.location.href });
        return;
      }
      const profile = await liff.getProfile().catch(() => null);
      const response = await lineLiffLogin({
        idToken,
        displayName: profile?.displayName,
        pictureUrl: profile?.pictureUrl,
      });
      setToken(response.accessToken);
      state.user = normalizeUser(response.user);
      applyUserLocale(state.user);
    } catch (error) {
      console.error('LIFF login failed', error);
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
