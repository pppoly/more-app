<template>
  <div class="mobile-shell">
    <header v-if="showHeader" class="mobile-shell__header" :style="headerSafeAreaStyle">
      <div class="brand-chip">
        <span>創</span>
      </div>
      <div class="header-title">MORE</div>
      <button class="profile-entry" @click="handlePrimaryAction">
        <span class="i-lucide-user-round text-lg"></span>
      </button>
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
          <span :class="['tabbar__icon', tab.icon]"></span>
          <span class="tabbar__label">{{ tab.label }}</span>
        </button>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth';

const route = useRoute();
const router = useRouter();
const { user } = useAuth();

const tabs = computed(() => {
  const base = [
    { id: 'events', label: '活動', path: '/events', icon: 'i-lucide-calendar-days' },
    { id: 'me', label: 'マイページ', path: '/me', icon: 'i-lucide-user-round' },
  ];
  if (user.value?.isOrganizer || user.value?.isAdmin) {
    base.splice(1, 0, { id: 'console', label: 'Console', path: '/console', icon: 'i-lucide-layout-dashboard' });
  }
  return base;
});

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
  if (path.startsWith('/me')) return 'me';
  return 'events';
});

const primaryActionLabel = computed(() => (user.value ? 'マイページ' : 'ログイン'));
const showTabbar = computed(() => {
  if (route.meta?.hideTabbar) return false;
  const paths = tabs.value.map((tab) => tab.path);
  return paths.some((path) => route.path === path || route.path.startsWith(path));
});

const isFixedPage = computed(() => Boolean(route.meta?.fixedPage));
const showHeader = computed(() => !route.meta?.hideShellHeader);
const isFlush = computed(() => Boolean(route.meta?.flushContent));

const handlePrimaryAction = () => {
  if (user.value) {
    router.push('/me');
    return;
  }
  router.push({ name: 'organizer-apply' });
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
</script>

<style scoped>
.mobile-shell {
  min-height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: #030917;
  color: #fff;
}

.mobile-shell__header {
  padding: 0.75rem 1.5rem calc(0.5rem + env(safe-area-inset-top, 0px));
  background: #ffffff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.brand-chip {
  width: 44px;
  height: 44px;
  border-radius: 16px;
  background: linear-gradient(135deg, #01c2ff, #00d7b4 50%, #f6c343);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.1rem;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
}

.header-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--m-color-text-primary);
}

.profile-entry {
  width: 44px;
  height: 44px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
}

.header-status {
  margin-top: 1.25rem;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.06);
  padding: 0.9rem 1.1rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.85);
}

.mobile-shell__content {
  flex: 1;
  background: #f5f7fb;
  color: #0f172a;
  overflow-y: auto;
}

.mobile-shell__content--tabbed {
  padding: 1.25rem 1rem 5.5rem;
}

.mobile-shell__content--plain {
  padding: 1.25rem 1rem 1.5rem;
}

.mobile-shell__content--fixed {
  overflow: hidden;
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

.mobile-shell__tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 1rem 1.5rem calc(1rem + env(safe-area-inset-bottom, 0px));
  background: #ffffff;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.tabbar {
  margin: 0 auto;
  max-width: 520px;
  display: flex;
  gap: 1rem;
  background: transparent;
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
  padding: 0.75rem 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--m-color-text-tertiary, #666);
}

.tabbar__item--active {
  background: #0090d9;
  color: #fff;
  box-shadow: 0 10px 24px rgba(0, 144, 217, 0.28);
}
.tabbar__icon {
  color: var(--m-color-text-tertiary, #666);
}
.tabbar__item--active .tabbar__icon {
  color: #fff;
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

.tabbar__icon {
  font-size: 1.2rem;
}

.tabbar__item--active .tabbar__icon {
  color: #fff;
}
</style>
