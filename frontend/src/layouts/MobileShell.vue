<template>
<div class="mobile-shell" :class="{ 'mobile-shell--fixed': isFixedPage, 'mobile-shell--liff': forceHideHeader }">
  <header
    v-if="routeReady && !forceHideHeader && !showBrandTopBar && !route.meta?.hideShellHeader"
    class="mobile-shell__header"
    :style="headerSafeAreaStyle"
  >
    <div :class="['brand-chip', { 'brand-chip--image': Boolean(brandLogo) }]">
      <img v-if="brandLogo" :src="brandLogo" alt="MORE brand logo" />
      <span v-else>創</span>
    </div>
      <div class="header-title">MORE</div>
      <div v-if="showHeaderActions" class="header-actions">
        <button class="lang-entry" @click="openLocaleSheet">
          <span class="i-lucide-globe-2 text-lg"></span>
        </button>
        <button v-if="isAdminUser" class="admin-entry" @click="goAdmin">
          <span class="i-lucide-shield"></span>
        </button>
        <button class="profile-entry" @click="handlePrimaryAction">
          <span class="i-lucide-user-round text-lg"></span>
        </button>
      </div>
    </header>
    <main
      :class="[
        'mobile-shell__content',
        showTabbar ? 'mobile-shell__content--tabbed' : 'mobile-shell__content--plain',
        isFixedPage ? 'mobile-shell__content--fixed' : '',
        isFlush ? 'mobile-shell__content--flush' : '',
      ]"
      :style="contentTopPaddingStyle"
    >
      <div :class="['mobile-shell__view', isFixedPage ? 'mobile-shell__view--fixed' : '']">
        <Transition name="tab-slide" mode="out-in">
          <slot :key="route.path" />
        </Transition>
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
    <teleport to="body">
      <transition name="fade">
        <div v-if="showLocaleSheet" class="locale-sheet__overlay" @click.self="closeLocaleSheet">
          <div class="locale-sheet">
            <div class="locale-sheet__handle"></div>
            <div class="locale-sheet__header">
              <div>
                <p class="locale-sheet__title">{{ t('localeSheet.title') }}</p>
                <p class="locale-sheet__subtitle">{{ t('localeSheet.subtitle') }}</p>
              </div>
              <button type="button" class="locale-sheet__close" @click="closeLocaleSheet">
                <span class="i-lucide-x"></span>
              </button>
            </div>
            <div class="locale-sheet__list">
              <button
                v-for="item in localeOptions"
                :key="item.code"
                type="button"
                class="locale-sheet__item"
                :class="{ 'locale-sheet__item--active': item.code === currentLocale }"
                :disabled="savingLocale"
                @click="selectLocale(item.code)"
              >
                <div class="locale-sheet__item-label">
                  <span class="locale-code">{{ item.code }}</span>
                  <span class="locale-name">{{ item.label }}</span>
                </div>
                <span v-if="item.code === currentLocale" class="locale-active-chip">{{ t('localeSheet.active') }}</span>
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth';
import { useResourceConfig } from '../composables/useResourceConfig';
import { useLocale } from '../composables/useLocale';
import { updateProfile } from '../api/client';
import { useToast } from '../composables/useToast';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  forceHideHeader?: boolean;
  showBrandTopBar?: boolean;
  showBrandDebug?: boolean;
  brandDebugText?: string;
  rootNavRoute?: boolean;
  isLiff?: boolean;
}>();
const route = useRoute();
const router = useRouter();
const { user, setUserProfile } = useAuth();
const resourceConfig = useResourceConfig();
const { currentLocale, supportedLocales, setLocale } = useLocale();
const toast = useToast();
const { t } = useI18n();
const scrollPositions = new Map<string, number>();
const contentEl = ref<HTMLElement | null>(null);

const brandLogo = computed(() => resourceConfig.getStringValue('brand.logo')?.trim());
const contentTopPaddingStyle = computed(() => ({}));

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
const isAdminUser = computed(() => Boolean(user.value?.isAdmin));

const titleMap: Record<string, string> = {
  '/': '開催中のイベント',
  '/events': '開催中のイベント',
  '/me': 'マイページ',
};

const currentTitle = computed(() => {
  const metaTitle = route.meta?.title as string | undefined;
  if (metaTitle) return metaTitle;
  const path = route.path;
  const base = Object.keys(titleMap).find((key) => path === key || path.startsWith(key + '/'));
  return base ? titleMap[base] : '創翔モア';
});

const activeTab = computed(() => {
  const path = route.path;
  if (path === '/' || path.startsWith('/events')) return 'events';
  if (path.startsWith('/console')) return 'console';
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/me')) return 'me';
  return 'events';
});

const primaryActionLabel = computed(() => (user.value ? 'マイページ' : 'ログイン'));
const showTabbar = computed(() => {
  if (route.meta?.hideTabbar) return false;
  // LIFF 時はトップレベルのみタブ表示
  if (props.isLiff && !props.rootNavRoute) return false;
  const topLevelOnly = props.showBrandTopBar || props.isLiff;
  const baseMatch = (path: string, tabPath: string) =>
    topLevelOnly ? path === tabPath : path === tabPath || path.startsWith(`${tabPath}/`);
  return tabs.value.some((tab) => baseMatch(route.path, tab.path));
});

const isFixedPage = computed(() => Boolean(route.meta?.fixedPage));
const showHeader = computed(() => {
  // LIFF 内の「マイページ」系は LINE の UI に委ね、アプリ内ヘッダーを非表示
  if (props.isLiff && route.path.startsWith('/me')) return false;
  return !route.meta?.hideShellHeader && !props.forceHideHeader;
});
const isFlush = computed(() => Boolean(route.meta?.flushContent));
const showHeaderActions = computed(() => !route.meta?.hideShellActions);
const routeReady = ref(false);

const handlePrimaryAction = () => {
  if (user.value) {
    router.push('/me');
    return;
  }
  router.push({ name: 'auth-login', query: { redirect: '/me' } });
};

const goAdmin = () => {
  if (!isAdminUser.value) return;
  router.push({ name: 'admin-home' });
};

const go = (path: string) => {
  if (route.path === path) return;
  router.push(path);
};

const headerSafeAreaStyle = computed(() => ({
  paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))',
}));

const tabbarSafeAreaStyle = computed(() => ({
  paddingBottom: 'calc(0.25rem + env(safe-area-inset-bottom, 0px))',
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

const localeLabelMap: Record<string, string> = {
  ja: '日本語',
  en: 'English',
  zh: '简体中文',
  'zh-tw': '繁體中文',
  vi: 'Tiếng Việt',
  ko: '한국어',
  tl: 'Tagalog',
  'pt-br': 'Português (BR)',
  ne: 'नेपाली',
  id: 'Bahasa Indonesia',
  th: 'ไทย',
  my: 'မြန်မာစာ',
};

const localeOptions = computed(() =>
  supportedLocales.map((code) => ({
    code,
    label: localeLabelMap[code] ?? code,
  })),
);

const showLocaleSheet = ref(false);
const savingLocale = ref(false);

const openLocaleSheet = () => {
  showLocaleSheet.value = true;
};

const closeLocaleSheet = () => {
  if (savingLocale.value) return;
  showLocaleSheet.value = false;
};

const selectLocale = async (locale: string) => {
  setLocale(locale);
  showLocaleSheet.value = false;
  if (user.value) {
    savingLocale.value = true;
    try {
      const profile = await updateProfile({ preferredLocale: locale });
      setUserProfile(profile);
      toast.show(t('localeSheet.saved'), 'success');
    } catch (error) {
      console.error('Failed to save preferred locale', error);
      toast.show(t('localeSheet.saveFailed'), 'error');
    } finally {
      savingLocale.value = false;
    }
  } else {
    toast.show(t('localeSheet.saved'), 'success');
  }
};

onMounted(() => {
  contentEl.value = document.querySelector('.mobile-shell__content');
  // 避免首屏闪出默认头部，等待路由就绪后再展示
  router.isReady().then(() => {
    routeReady.value = true;
  });
});

watch(
  () => route.fullPath,
  async (to, from) => {
    if (from) {
      saveScrollPosition(from);
    }
    await nextTick();
    routeReady.value = true;
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
  max-width: 100vw;
  display: flex;
  flex-direction: column;
  background: #f3f4f6;
  color: #0f172a;
  overflow-x: hidden;
  overflow-y: visible;
  box-sizing: border-box;
}
.mobile-shell--fixed {
  height: 100vh;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.mobile-shell__header {
  padding: calc(12px + env(safe-area-inset-top, 0px)) 16px 12px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 30;
}

.brand-chip {
  width: 44px;
  height: 44px;
  border-radius: 16px;
  background: linear-gradient(135deg, #32d2c5, #76e3b3);
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.85rem;
  color: #0f172a;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.1);
}

.brand-chip--image {
  padding: 4px;
  background: #f8fafc;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.25);
}

.brand-chip img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 12px;
}

.header-title {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
}

.admin-entry,
.profile-entry,
.lang-entry {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #0f172a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.06);
}

.admin-entry {
  color: #2563eb;
  border-color: rgba(37, 99, 235, 0.25);
}

.header-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.mobile-shell__content {
  flex: 1;
  background: #f3f4f6;
  color: #0f172a;
  overflow-x: hidden;
  overflow-y: visible;
  width: 100%;
  max-width: 100vw;
  box-sizing: border-box;
}

.mobile-shell__content--tabbed {
  padding: 0 0 5.25rem;
}

.mobile-shell__content--plain {
  padding: 1rem 1rem 1.5rem;
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
  min-height: 100%;
  height: auto;
  overflow-x: hidden;
  overflow-y: visible;
  width: 100%;
  max-width: 100vw;
  box-sizing: border-box;
}

.mobile-shell__view--fixed {
  height: 100%;
  overflow: hidden;
  width: 100%;
  max-width: 100vw;
  box-sizing: border-box;
}

:deep(.mobile-shell__view--fixed > *) {
  height: 100%;
  overflow: hidden;
  width: 100%;
  max-width: 100vw;
  box-sizing: border-box;
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
  box-sizing: border-box;
  width: 100%;
  max-width: 100vw;
}

.tabbar {
  margin: 0;
  width: 100%;
  max-width: 100%;
  display: flex;
  gap: 8px;
  background: #ffffff;
  padding: 10px 0;
  border-radius: 0;
  box-sizing: border-box;
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
.tabbar__item--active .tabbar__icon {
  color: #ffffff;
}

.locale-sheet__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: flex-end;
  z-index: 9999;
}

.locale-sheet {
  width: 100%;
  background: #ffffff;
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  padding: 0.75rem 1rem 1.25rem;
  box-shadow: 0 -12px 40px rgba(15, 23, 42, 0.15);
}

.locale-sheet__handle {
  width: 42px;
  height: 5px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.12);
  margin: 0 auto 0.75rem;
}

.locale-sheet__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.locale-sheet__title {
  font-weight: 700;
  font-size: 1rem;
  margin: 0;
}

.locale-sheet__subtitle {
  margin: 0.25rem 0 0;
  color: #64748b;
  font-size: 0.9rem;
}

.locale-sheet__close {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: #f8fafc;
  color: #0f172a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.locale-sheet__list {
  margin-top: 0.75rem;
  display: grid;
  gap: 0.5rem;
}

.locale-sheet__item {
  width: 100%;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: #f8fafc;
  border-radius: 14px;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  text-align: left;
}

.locale-sheet__item--active {
  border-color: #0ea5e9;
  background: #e0f2fe;
  box-shadow: 0 10px 24px rgba(14, 165, 233, 0.2);
}

.locale-sheet__item-label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.locale-code {
  font-size: 0.85rem;
  color: #0f172a;
  font-weight: 700;
}

.locale-name {
  font-size: 0.9rem;
  color: #334155;
}

.locale-active-chip {
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  background: #0ea5e9;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
}

.tab-slide-enter-active,
.tab-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.tab-slide-enter-from,
.tab-slide-leave-to {
  opacity: 0;
  transform: translateX(10px);
}
.tabbar__icon-img {
  width: 24px;
  height: 24px;
}
</style>
