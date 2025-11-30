<template>
  <div class="mobile-shell console-shell" :class="{ 'mobile-shell--fixed': isFixedPage }">
    <header v-if="showShellHeader" class="mobile-shell__header" :style="headerSafeAreaStyle">
      <button class="header-back" type="button" @click="goBack">{{ t('nav.back') }}</button>
      <div class="header-title">{{ headerTitle }}</div>
      <div class="header-actions" />
    </header>

    <main
      :class="[
        'mobile-shell__content',
        showTabbar ? 'mobile-shell__content--tabbed' : 'mobile-shell__content--plain',
        isFixedPage ? 'mobile-shell__content--fixed' : '',
        isFlush ? 'mobile-shell__content--flush' : '',
      ]"
    >
      <div :class="['mobile-shell__view', isFixedPage ? 'mobile-shell__view--fixed' : '']">
        <RouterView />
      </div>
    </main>

    <CommunitySwitchSheet v-if="showCommunitySheet" @close="showCommunitySheet = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../composables/useAuth';
import { useResourceConfig } from '../composables/useResourceConfig';
import { useConsoleCommunityStore } from '../stores/consoleCommunity';
import CommunitySwitchSheet from '../components/console/CommunitySwitchSheet.vue';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const store = useConsoleCommunityStore();
const { user } = useAuth();
const resourceConfig = useResourceConfig();
const scrollPositions = new Map<string, number>();
const contentEl = ref<HTMLElement | null>(null);

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

const iconDefaults = computed(() => {
  const { slotMap } = resourceConfig;
  return {
    events: resourceConfig.getStringValue('icon.tab.events') || (slotMap['icon.tab.events'].defaultValue as string),
    console: resourceConfig.getStringValue('icon.tab.console') || (slotMap['icon.tab.console'].defaultValue as string),
    me: resourceConfig.getStringValue('icon.tab.me') || (slotMap['icon.tab.me'].defaultValue as string),
    admin: resourceConfig.getStringValue('icon.tab.admin') || (slotMap['icon.tab.admin'].defaultValue as string),
  };
});

const tabs = computed(() => {
  const icons = iconDefaults.value;
  const base = [
    { id: 'events', label: t('nav.events'), path: '/events', icon: icons.events },
    { id: 'me', label: t('nav.me'), path: '/me', icon: icons.me },
  ];
  if (user.value?.isOrganizer || user.value?.isAdmin) {
    base.splice(1, 0, { id: 'console', label: t('nav.console'), path: '/console', icon: icons.console });
  }
  if (user.value?.isAdmin) {
    base.splice(base.length - 1, 0, { id: 'admin', label: t('nav.admin'), path: '/admin', icon: icons.admin });
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

const showTabbar = computed(() => false);

const showShellHeader = computed(() => {
  if (route.meta?.hideShellHeader) return false;
  if (route.name === 'ConsoleMobileEventForm') return true;
  return activeTab.value === 'console';
});
const headerTitle = computed(() => {
  if (route.name === 'ConsoleMobileEventForm') return t('header.createEvent');
  return activeTab.value === 'console' ? t('header.console') : t('header.default');
});
const headerSafeAreaStyle = computed(() => ({ paddingTop: `calc(8px + env(safe-area-inset-top, 0px))` }));

const tabbarSafeAreaStyle = computed(() => ({
  paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
}));

const saveScrollPosition = (path: string) => {
  if (!path) return;
  const top = contentEl.value ? contentEl.value.scrollTop : window.scrollY;
  scrollPositions.set(path, top);
};

const restoreScrollPosition = (path: string) => {
  const saved = scrollPositions.get(path) ?? 0;
  if (contentEl.value) {
    contentEl.value.scrollTo({ top: saved, behavior: 'auto' });
  }
  window.scrollTo({ top: saved, behavior: 'auto' });
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

const go = (path: string) => {
  if (route.path === path) return;
  router.push(path);
};

onMounted(() => {
  contentEl.value = document.querySelector('.mobile-shell__content');
  window.addEventListener('console:open-community-picker', handleExternalPickerOpen);
});

onUnmounted(() => {
  window.removeEventListener('console:open-community-picker', handleExternalPickerOpen);
});

watch(
  () => route.fullPath,
  async (to, from) => {
    if (from) saveScrollPosition(from);
    await nextTick();
    restoreScrollPosition(to);
    const active = document.activeElement as HTMLElement | null;
    if (active?.blur) active.blur();
  },
  { flush: 'post' },
);
</script>

<style scoped>
.mobile-shell {
  min-height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f7fb;
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
  background: #f5f7fb;
  color: #0f172a;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.mobile-shell__content--tabbed {
  padding: 1.25rem 1rem 5.5rem;
}

.mobile-shell__content--plain {
  padding: 1.25rem 1rem 1.5rem;
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
  overflow-y: auto;
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
  z-index: 10;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  background: #ffffff;
  border-top: none;
  box-shadow: none;
}
.tabbar {
  margin: 0 auto;
  max-width: 520px;
  display: flex;
  gap: 12px;
  background: #ffffff;
  padding: 0;
}
.tabbar__item {
  flex: 1;
  border: none;
  background: transparent;
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 10px 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--m-color-text-tertiary, #666);
}
.tabbar__item--active {
  background: #0090d9;
  color: #fff;
  box-shadow: none;
}
.tabbar__icon {
  color: var(--m-color-text-tertiary, #666);
}
.tabbar__item--active .tabbar__icon {
  color: #fff;
}
</style>
