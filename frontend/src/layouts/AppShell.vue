<template>
  <div class="app-shell">
    <header v-if="showBrandTopBar" class="app-shell__top app-shell__top--sticky">
      <div class="app-shell__safe-top" />
      <div class="app-shell__bar">
        <img :src="logoSrc" alt="brand logo" class="app-shell__logo" />
        <span v-if="debugText" class="app-shell__debug">{{ debugText }}</span>
      </div>
    </header>

    <main class="app-shell__body">
      <div class="app-shell__content" :style="contentPaddingStyle">
        <slot />
      </div>
    </main>

    <nav v-if="hasTabs" class="app-shell__tabbar">
      <div class="app-shell__safe-bottom" />
      <div class="app-shell__tabs">
        <slot name="tabs" />
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue';

const props = defineProps<{
  showBrandTopBar?: boolean;
  logoSrc: string;
  debugText?: string;
}>();

const slots = useSlots();
const hasTabs = computed(() => Boolean(slots.tabs));
const contentPaddingStyle = computed(() => {
  if (props.showBrandTopBar) {
    return { paddingTop: 'calc(52px + env(safe-area-inset-top, 0px))' };
  }
  return {};
});
</script>

<style scoped>
.app-shell {
  position: relative;
  min-height: 100vh;
  background: #f6f8fb;
  overflow: hidden;
}

.app-shell__top {
  background: #fff;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06);
}

.app-shell__top--sticky {
  position: sticky;
  top: 0;
  z-index: 1200;
}

.app-shell__safe-top {
  height: env(safe-area-inset-top, 0px);
}

.app-shell__bar {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 0 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.app-shell__logo {
  height: 28px;
  width: auto;
  object-fit: contain;
}

.app-shell__debug {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
}

.app-shell__body {
  position: relative;
  min-height: 100vh;
}

.app-shell__content {
  min-height: 100vh;
  padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  overflow: auto;
}

.app-shell__tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1200;
  background: #fff;
  box-shadow: 0 -1px 0 rgba(0, 0, 0, 0.06);
}

.app-shell__safe-bottom {
  height: env(safe-area-inset-bottom, 0px);
}

.app-shell__tabs {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 0 12px;
}
</style>
