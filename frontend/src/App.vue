<template>
  <MaintenanceView v-if="maintenanceMode" :error="maintenanceError" />
  <div
    v-else
    class="app-shell"
    :class="{ 'app-shell--mobile': isMobile }"
    :data-liff-ready="liffReady"
  >
    <div v-if="showDevPageName" class="dev-page-overlay">
      {{ currentPageName }}
    </div>
    <AppToast />
    <AppConfirm />
    <LiffOpenPrompt />
    <LiffDebugPanel :visible="false" />
    <LoginRequiredSheet
      :visible="authSheets.state.login.visible"
      :pending-action="authSheets.state.login.pendingAction"
      @login="authSheets.goLogin"
      @close="authSheets.hideLoginSheet"
    />
    <ForbiddenSheet
      :visible="authSheets.state.forbidden.visible"
      :reason="authSheets.state.forbidden.reason"
      @primary="onForbiddenPrimary"
      @close="authSheets.hideForbiddenSheet"
    />
    <button
      v-if="showLiffOpenButton"
      type="button"
      class="liff-open-inline"
      @click="openInLine"
    >
      LINEミニアプリで開く
    </button>
    <template v-if="showLiffGuide">
      <LineRedirectOverlay :allow-web-continue="false" />
    </template>
    <template v-else-if="showLiffLoginRecovery">
      <div class="liff-recovery">
        <div class="liff-recovery__backdrop"></div>
        <div class="liff-recovery__card">
          <p class="liff-recovery__title">LINEログインが完了していません</p>
          <p class="liff-recovery__text">LINEアプリを再起動して、もう一度開き直してください。</p>
          <button type="button" class="liff-recovery__button" @click="reloadPage">再読み込み</button>
        </div>
      </div>
    </template>
    <template v-else-if="isMobile && showLineModal && !allowWebContinue">
      <LineRedirectOverlay @continue-web="continueWeb" />
    </template>

    <template v-if="isMobile && (showBrandBar || allowWebContinue || (!showLineModal && !uaLine))">
      <AppShell
        :show-brand-top-bar="brandBarForRoute"
        :logo-src="brandLogo"
        :debug-text="showBrandDebug ? brandDebugText : undefined"
        :debug-flag="debugParam"
        :is-liff-client="isLiffClientMode"
        :ua-line="uaLine"
        :is-liff-entry="isLiffEntry"
      >
        <MobileShell
          :force-hide-header="hideLegacyHeader"
          :show-brand-top-bar="brandBarForRoute"
          :show-brand-debug="showBrandDebug"
          :brand-debug-text="brandDebugText"
          :root-nav-route="isRootNavRoute"
          :is-liff="isLiffClientMode"
        />
      </AppShell>
    </template>
    <template v-else>
      <header v-if="!showBrandBar && !hideDesktopNav" class="app-header">
        <div class="brand">
          <h1>SOCIALMORE</h1>
          <nav>
            <RouterLink to="/">Home</RouterLink>
            <RouterLink to="/events">Events</RouterLink>
            <RouterLink
              v-if="user?.isOrganizer"
              :to="{ name: 'console-communities' }"
            >
              Console
            </RouterLink>
            <RouterLink v-else-if="user" to="/organizer/apply">主催者申請</RouterLink>
            <RouterLink v-if="user?.isAdmin" to="/admin">Admin</RouterLink>
            <RouterLink v-if="user" to="/me/events">My Events</RouterLink>
          </nav>
        </div>
        <div class="auth-panel">
          <div class="locale-switcher">
            <label for="locale-select">Lang</label>
            <select
              id="locale-select"
              :value="currentLocale"
              @change="(e) => setLocale((e.target as HTMLSelectElement).value)"
            >
              <option v-for="loc in supportedLocales" :key="loc" :value="loc">
                {{ loc }}
              </option>
            </select>
          </div>
          <span v-if="initializing">Checking session...</span>
          <template v-else>
            <div v-if="user" class="logged-in">
              <span>ようこそ, {{ user.name }}</span>
              <RouterLink
                v-if="!user.isOrganizer"
                class="apply-link"
                to="/organizer/apply"
              >
                主催者申請
              </RouterLink>
              <button type="button" @click="logout">Logout</button>
            </div>
            <div v-else class="login-buttons">
              <button type="button" @click="goToLogin">Login / Register</button>
            </div>
          </template>
        </div>
      </header>
      <main class="desktop-main">
        <RouterView />
      </main>
    </template>
  </div>
  <div v-if="debugParam" class="build-version" aria-hidden="true">build: {{ BUILD_VERSION }}</div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileShell from './layouts/MobileShell.vue';
import { setupPopstateListener } from './composables/useNavStack';
import { useAuth } from './composables/useAuth';
import AppToast from './components/common/AppToast.vue';
import AppConfirm from './components/common/AppConfirm.vue';
import { useLocale } from './composables/useLocale';
import LiffOpenPrompt from './components/common/LiffOpenPrompt.vue';
import { useAppShellMode } from './composables/useAppShellMode';
import { isLineBrowser } from './utils/device';
import { buildLiffUrl, isLineInAppBrowser } from './utils/liff';
import { APP_TARGET } from './config';
import { BUILD_VERSION } from './version';
import AppShell from './layouts/AppShell.vue';
import logo1 from './assets/images/logo1.svg';
import LineRedirectOverlay from './components/common/LineRedirectOverlay.vue';
import LiffDebugPanel from './components/common/LiffDebugPanel.vue';
import LoginRequiredSheet from './components/auth/LoginRequiredSheet.vue';
import ForbiddenSheet from './components/auth/ForbiddenSheet.vue';
import { useAuthSheets, injectAuthSheetsContext } from './composables/useAuthSheets';
import { useAppState } from './composables/useAppState';
import MaintenanceView from './views/MaintenanceView.vue';

const { user, initializing, logout, loginWithLiffProfile, needsLiffOpen } = useAuth();
const isMobile = ref(false);
const liffReady = inject('isLiffReady', ref(false));
const {
  isLiffClientMode,
  showBrandBar,
  showBrandDebug,
  brandDebugText,
  debugParam,
  uaLine,
  isLiffEntry,
} = useAppShellMode();
const brandLogo = logo1;
const allowWebContinue = ref(false);
const showLineModal = ref(false);
const showLiffGuide = computed(
  () =>
    needsLiffOpen.value &&
    !isLiffClientMode.value &&
    (APP_TARGET === 'liff' || isLineInAppBrowser()),
);
const showLiffLoginRecovery = computed(
  () => isLiffClientMode.value && needsLiffOpen.value,
);
const rootNavPaths = ['/', '/events', '/console', '/me', '/admin'];
const isRootNavRoute = computed(() => rootNavPaths.includes(currentRoute.path));
const brandBarForRoute = computed(() => showBrandBar.value && currentRoute.path === '/events');
const hideLegacyHeader = computed(() => isLiffClientMode.value || showBrandBar.value);
const hideDesktopNav = computed(() => Boolean(currentRoute.meta?.hideDesktopNav));
const mediaQuery =
  typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)') : null;
const router = useRouter();
const currentRoute = useRoute();
injectAuthSheetsContext(router, currentRoute);
const showDevPageName = computed(() => debugParam.value && !isLiffClientMode.value);
const { currentLocale, supportedLocales, setLocale } = useLocale();
const authSheets = useAuthSheets();
const { maintenanceMode, maintenanceError } = useAppState();
const currentPageName = computed(() => {
  const metaName = currentRoute.meta?.devPageName as string | undefined;
  if (metaName) return metaName;
  const metaTitle = currentRoute.meta?.title as string | undefined;
  if (metaTitle) return metaTitle;
  if (typeof currentRoute.name === 'string') return currentRoute.name;
  return '未設定のページ';
});

const allowWebKey = 'allowWebInLine';
const showLiffOpenButton = computed(
  () => isLiffEntry.value && needsLiffOpen.value && !isLiffClientMode.value,
);

const isFromLiffEntry = () => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.has('liff.state') || params.has('liff.referrer')) return true;
  const from = params.get('from');
  const src = params.get('src');
  if ((from && from.toLowerCase() === 'liff') || (src && src.toLowerCase() === 'liff')) return true;
  if (
    document.referrer &&
    (document.referrer.includes('liff.line.me') || document.referrer.includes('miniapp.line.me'))
  )
    return true;
  return false;
};

const waitForLiffClient = (timeoutMs = 800) =>
  new Promise<boolean>((resolve) => {
    if (isLiffClientMode.value) {
      resolve(true);
      return;
    }
    const timer = window.setTimeout(() => {
      stop();
      resolve(isLiffClientMode.value);
    }, timeoutMs);
    const stop = watch(
      () => isLiffClientMode.value,
      (val) => {
        if (val) {
          window.clearTimeout(timer);
          stop();
          resolve(true);
        }
      },
    );
  });

if (mediaQuery) {
  isMobile.value = mediaQuery.matches;
}

const handleViewportChange = () => {
  if (!mediaQuery) return;
  isMobile.value = mediaQuery.matches;
};

const continueWeb = () => {
  allowWebContinue.value = true;
  showLineModal.value = false;
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(allowWebKey, '1');
  }
};

onMounted(() => {
  setupPopstateListener();
  handleViewportChange();
  mediaQuery?.addEventListener('change', handleViewportChange);
  if (debugParam.value) {
    console.info('[build]', BUILD_VERSION);
  }
  // Decide overlay logic
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const deepLinkRaw = params ? params.get('to') || params.get('liff.state') : null;
  const continueWeb = (params?.get('continueWeb') || '').toLowerCase();
  const forceContinueWeb = continueWeb === '1' || continueWeb === 'true';
  let deepLinkDecoded = deepLinkRaw || '';
  try {
    deepLinkDecoded = deepLinkRaw ? decodeURIComponent(deepLinkRaw) : '';
  } catch {
    deepLinkDecoded = deepLinkRaw || '';
  }
  const isShareDeepLink = deepLinkDecoded.includes('from=line_share');
  const allowSession = typeof window !== 'undefined' && window.sessionStorage.getItem(allowWebKey) === '1';
  if (forceContinueWeb) {
    allowWebContinue.value = true;
    return;
  }
  if (allowSession) {
    if (isShareDeepLink) {
      // Share links should still guide users to open the Mini App unless explicitly bypassed.
    } else {
      allowWebContinue.value = true;
      return;
    }
  }
  if (isFromLiffEntry()) {
    allowWebContinue.value = true;
    return;
  }
  const hasDeepLink = Boolean(deepLinkRaw);
  if (isLineBrowser() && hasDeepLink) {
    void waitForLiffClient().then((isLiff) => {
      if (isLiff) {
        allowWebContinue.value = true;
        return;
      }
      showLineModal.value = true;
    });
    return;
  }
  if (!uaLine.value) return;
  void waitForLiffClient().then((isLiff) => {
    if (isLiff) {
      allowWebContinue.value = true;
      return;
    }
    showLineModal.value = true;
  });
});

watch(
  () => isLiffEntry.value,
  (val) => {
    if (val) {
      void loginWithLiffProfile(true);
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  mediaQuery?.removeEventListener('change', handleViewportChange);
});

const goToLogin = () => {
  const redirect = currentRoute.fullPath || '/';
  router.push({ name: 'auth-login', query: { redirect } });
};

const onForbiddenPrimary = () => {
  if (authSheets.state.forbidden.reason === 'NOT_ORGANIZER') {
    authSheets.goOrganizerApply();
    return;
  }
  authSheets.hideForbiddenSheet();
};

const openInLine = () => {
  if (typeof window === 'undefined') return;
  const current = currentRoute.fullPath || window.location.pathname + window.location.search;
  const url = buildLiffUrl(current);
  if (!url) {
    console.error('LIFF_ID is not configured; cannot open in LINE.');
    return;
  }
  window.location.href = url;
};

const reloadPage = () => {
  if (typeof window === 'undefined') return;
  window.location.reload();
};

</script>

<style scoped>
.app-shell {
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #1f2933;
  min-height: 100vh;
  background: #f6f8fb;
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
}

.dev-page-overlay {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.85);
  color: #fff;
  font-size: 13px;
  letter-spacing: 0.05em;
  z-index: 9999;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.35);
  pointer-events: none;
}

.build-version {
  position: fixed;
  bottom: 8px;
  right: 12px;
  font-size: 11px;
  color: #94a3b8;
  z-index: 900;
  pointer-events: none;
}

.liff-open-inline {
  position: fixed;
  bottom: 72px;
  right: 12px;
  z-index: 1300;
  background: #00c300;
  color: #0b1b03;
  border: none;
  border-radius: 16px;
  padding: 10px 14px;
  font-weight: 700;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.18);
}

.liff-recovery {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1600;
  padding: 20px;
}

.liff-recovery__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(2px);
}

.liff-recovery__card {
  position: relative;
  width: min(460px, 100%);
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.1);
  padding: 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.liff-recovery__title {
  margin: 0;
  font-size: 16px;
  color: #0f172a;
  font-weight: 700;
}

.liff-recovery__text {
  margin: 0;
  font-size: 14px;
  color: #475569;
  line-height: 1.5;
}

.liff-recovery__button {
  border: none;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  background: #0f172a;
  color: #fff;
}

.app-header {
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 1rem 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.app-header h1 {
  margin: 0;
  font-size: 1.4rem;
}

nav {
  display: flex;
  gap: 1rem;
}

nav a {
  text-decoration: none;
  color: #2f5bea;
  font-weight: 600;
}

.auth-panel {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.locale-switcher {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #475569;
  font-size: 0.9rem;
}

.locale-switcher select {
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
}

.logged-in {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.auth-panel button {
  border: none;
  background: #2563eb;
  color: #fff;
  padding: 0.4rem 0.9rem;
  border-radius: var(--app-border-radius);
  cursor: pointer;
}
.apply-link {
  text-decoration: none;
  color: #2563eb;
  font-weight: 600;
}

.desktop-main {
  padding: 2rem;
}

.app-shell--mobile {
  min-height: 100vh;
  background: #020617;
}
</style>
