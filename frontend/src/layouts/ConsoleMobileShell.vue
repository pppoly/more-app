<template>
  <div class="mobile-shell console-shell" :class="{ 'mobile-shell--fixed': isFixedPage }">
    <header v-if="showHeader" class="mobile-shell__header" :style="headerSafeAreaStyle"></header>

    <main
      :class="[
        'mobile-shell__content',
        showTabbar ? 'mobile-shell__content--tabbed' : 'mobile-shell__content--plain',
        isFixedPage ? 'mobile-shell__content--fixed' : '',
        isFlush ? 'mobile-shell__content--flush' : '',
      ]"
    >
      <div :class="['mobile-shell__view', isFixedPage ? 'mobile-shell__view--fixed' : '']">
        <RouterView v-slot="{ Component, route: viewRoute }">
          <Transition :name="getTransitionName(viewRoute)">
            <div
              :key="viewRoute.fullPath"
              ref="pageStageRef"
              class="page-stage"
            >
              <KeepAlive v-if="shouldKeepAlive(viewRoute)">
                <component :is="Component" :key="viewRoute.fullPath" v-bind="resolveRouteProps(viewRoute)" />
              </KeepAlive>
              <component v-else :is="Component" :key="viewRoute.fullPath" v-bind="resolveRouteProps(viewRoute)" />
            </div>
          </Transition>
        </RouterView>
        <div v-if="navPending" class="nav-loading" role="status" aria-live="polite" aria-busy="true">
          <div class="entry-loading">
            <span class="entry-loading__spinner" aria-hidden="true"></span>
            <p class="entry-loading__text">読み込み中…</p>
          </div>
        </div>
      </div>
    </main>

    <nav v-if="showTabbar" class="mobile-shell__tabbar" :style="tabbarSafeAreaStyle">
      <div class="tabbar">
        <button
          v-for="tab in tabs"
          :key="tab.path"
          class="tabbar__item"
          :class="{ 'tabbar__item--active': activeTab === tab.id }"
          @click="go(tab.path)"
        >
          <img
            :src="activeTab === tab.id ? tab.icon.active : tab.icon.inactive"
            alt=""
            class="tabbar__icon-img"
            loading="lazy"
          />
          <span class="tabbar__label">{{ tab.label }}</span>
        </button>
      </div>
    </nav>

    <CommunitySwitchSheet v-if="showCommunitySheet" @close="showCommunitySheet = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../composables/useAuth';
import { useResourceConfig } from '../composables/useResourceConfig';
import { useConsoleCommunityStore } from '../stores/consoleCommunity';
import CommunitySwitchSheet from '../components/console/CommunitySwitchSheet.vue';
import { getTransitionName, restoreScroll, saveScroll, useNavPending } from '../composables/useNavStack';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const store = useConsoleCommunityStore();
const { user } = useAuth();
const resourceConfig = useResourceConfig();
const pageStageRef = ref<HTMLElement | null>(null);
const lastRouteSnapshot = ref<{ fullPath: string; meta?: Record<string, unknown> } | null>(null);
const navPending = useNavPending();

const showCommunitySheet = ref(false);

const activeCommunity = computed(() => {
  const id = store.activeCommunityId.value;
  return store.communities.value.find((community) => community.id === id) || null;
});

const activeCommunityName = computed(() => activeCommunity.value?.name ?? '');

const openCommunityPicker = () => {
  showCommunitySheet.value = true;
};

const handleExternalPickerOpen = () => {
  showCommunitySheet.value = true;
};

const go = (path: string) => {
  if (route.path === path) return;
  router.push(path);
};

const tabIcons = {
  events: {
    active: new URL('../assets/home-clicked.svg', import.meta.url).href,
    inactive: new URL('../assets/home.svg', import.meta.url).href,
  },
  console: {
    active: new URL('../assets/console-clicked.svg', import.meta.url).href,
    inactive: new URL('../assets/console.svg', import.meta.url).href,
  },
  me: {
    active: new URL('../assets/me-clicked.svg', import.meta.url).href,
    inactive: new URL('../assets/me.svg', import.meta.url).href,
  },
  admin: {
    active: new URL('../assets/admin-clicked.svg', import.meta.url).href,
    inactive: new URL('../assets/admin.svg', import.meta.url).href,
  },
};

const tabs = computed(() => {
  const base = [
    { id: 'events', label: t('nav.events'), path: '/events', icon: tabIcons.events },
    { id: 'me', label: t('nav.me'), path: '/me', icon: tabIcons.me },
  ];
  if (user.value?.isOrganizer || user.value?.isAdmin) {
    base.splice(1, 0, { id: 'console', label: t('nav.console'), path: '/console', icon: tabIcons.console });
  }
  if (user.value?.isAdmin) {
    base.splice(base.length - 1, 0, { id: 'admin', label: t('nav.admin'), path: '/admin', icon: tabIcons.admin });
  }
  return base;
});

const activeTab = computed(() => {
  const path = route.path;
  if (path === '/' || path.startsWith('/events')) return 'events';
  if (path.startsWith('/console')) return 'console';
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/me')) return 'me';
  return 'events';
});

const isFixedPage = computed(() => Boolean(route.meta?.fixedPage));
const isFlush = computed(() => Boolean(route.meta?.flushContent));
const isLiffMode = computed(
  () => typeof window !== 'undefined' && !!(window as any).liff,
);
const showHeader = computed(() => {
  if (isLiffMode.value) return false;
  return !route.meta?.hideShellHeader;
});

  // Console 内では二重のボトムナビを描画しない（全体ナビとの重複防止）
const showTabbar = computed(() => false);

const showShellHeader = computed(() => false);
const headerTitle = computed(() => '');
const headerSafeAreaStyle = computed(() => ({ paddingTop: `calc(0px + env(safe-area-inset-top, 0px))` }));

const tabbarSafeAreaStyle = computed(() => ({
  paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
}));

const shouldKeepAlive = (viewRoute: { meta?: Record<string, unknown> }) => viewRoute.meta?.keepAlive === true;

const resolveRouteProps = (viewRoute: RouteLocationNormalizedLoaded) => {
  const matched = viewRoute.matched[viewRoute.matched.length - 1];
  if (!matched || !matched.props || !matched.props.default) {
    return {};
  }
  const config = matched.props.default;
  if (config === true) {
    return viewRoute.params;
  }
  if (typeof config === 'function') {
    return config(viewRoute);
  }
  return config ?? {};
};

const getScrollContainer = () => {
  // Only restore scroll for explicitly-marked containers.
  const stage = pageStageRef.value;
  if (!stage) return null;
  return stage.querySelector('[data-scroll="main"]') as HTMLElement | null;
};

const snapshotRoute = (viewRoute: RouteLocationNormalizedLoaded) => ({
  fullPath: viewRoute.fullPath,
  meta: viewRoute.meta ?? {},
});

const saveScrollForRoute = (snapshot: { fullPath: string; meta?: Record<string, unknown> } | null) => {
  if (!snapshot || !shouldKeepAlive(snapshot)) return;
  const scroller = getScrollContainer();
  if (!scroller) return;
  saveScroll(snapshot, scroller);
};

const restoreScrollForRoute = (snapshot: { fullPath: string; meta?: Record<string, unknown> } | null) => {
  if (!snapshot || !shouldKeepAlive(snapshot)) return;
  const scroller = getScrollContainer();
  if (!scroller) return;
  restoreScroll(snapshot, scroller);
};

const goBack = () => {
  // Default back behavior: if we're in console scope (or no history), return to console home
  const path = route.path;
  const prefersConsoleHome = path.startsWith('/console') || window.history.length <= 1;
  if (prefersConsoleHome) {
    router.push('/console');
    return;
  }
  router.back();
};

onMounted(() => {
  window.addEventListener('console:open-community-picker', handleExternalPickerOpen);
  const currentSnapshot = snapshotRoute(route);
  lastRouteSnapshot.value = currentSnapshot;
  nextTick(() => {
    restoreScrollForRoute(currentSnapshot);
  });
});

onUnmounted(() => {
  window.removeEventListener('console:open-community-picker', handleExternalPickerOpen);
});

onActivated(() => {
  // Restore cached list scroll when returning via KeepAlive.
  restoreScrollForRoute(snapshotRoute(route));
});

onDeactivated(() => {
  saveScrollForRoute(snapshotRoute(route));
});

watch(
  () => route.fullPath,
  async () => {
    saveScrollForRoute(lastRouteSnapshot.value);
    const currentSnapshot = snapshotRoute(route);
    lastRouteSnapshot.value = currentSnapshot;
    await nextTick();
    restoreScrollForRoute(currentSnapshot);
    const active = document.activeElement as HTMLElement | null;
    if (active?.blur) active.blur();
  },
  { flush: 'pre' },
);
</script>

<style scoped>
.mobile-shell {
  min-height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: #f3f4f6;
}
.mobile-shell--fixed {
  height: 100vh;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.mobile-shell__header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  padding: 12px calc(12px + min(env(safe-area-inset-left, 0px), 12px));
  background: #ffffff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  position: sticky;
  top: 0;
  z-index: 12;
}
.header-back {
  border: none;
  background: transparent;
  color: #0f172a;
  font-weight: 700;
  font-size: 14px;
  padding: 8px 4px;
}
.header-back--right {
  justify-self: end;
}
.header-title {
  margin: 0;
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}
.header-actions {
  width: 44px;
  height: 44px;
}
.mobile-shell__content {
  flex: 1;
  background: #f3f4f6;
  color: #0f172a;
  overflow: visible;
}

.mobile-shell__content--tabbed {
  padding: 0 0 90px;
}

.mobile-shell__content--plain {
  padding: 0;
}

.mobile-shell__content--flush {
  padding: 0;
}
.console-shell {
  background: #f8fafc;
}
.console-shell .mobile-shell__content {
  background: #f8fafc;
}

.mobile-shell__content--fixed {
  overflow-y: visible;
  overscroll-behavior: contain;
  height: 100vh;
}

.mobile-shell__content--flush {
  padding: 0;
}
.mobile-shell__view {
  height: 100%;
}
.mobile-shell__view--fixed {
  height: 100%;
  overflow: hidden;
}
:deep(.mobile-shell__view--fixed > *) {
  height: 100%;
  overflow: hidden;
}
.console-shell {
  background: #f8fafc;
}
.console-shell .mobile-shell__content {
  background: #f8fafc;
}
.mobile-shell__tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  padding: 0 calc(10px + env(safe-area-inset-right, 0px)) calc(8px + env(safe-area-inset-bottom, 0px))
    calc(10px + env(safe-area-inset-left, 0px));
  background: #ffffff;
  border-top: none;
  box-shadow: none;
}
.tabbar {
  margin: 0;
  width: 100%;
  display: flex;
  gap: 8px;
  background: #ffffff;
  padding: 10px 0;
  border-radius: 0;
}
.tabbar__item {
  flex: 1;
  border: none;
  background: transparent;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
}
.tabbar__item--active {
  background: transparent;
  color: #111827;
  box-shadow: none;
}
.tabbar__icon {
  color: #94a3b8;
}
.tabbar__icon-img {
  width: 22px;
  height: 22px;
}
</style>
