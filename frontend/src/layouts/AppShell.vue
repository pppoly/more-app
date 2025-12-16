<template>
  <div class="app-shell">
    <header v-if="showBrandTopBar" class="app-shell__top app-shell__top--sticky" ref="topbarEl">
      <div class="app-shell__bar">
        <img :src="logoSrc" alt="brand logo" class="app-shell__logo" />
        <span v-if="debugText" class="app-shell__debug">{{ debugText }}</span>
      </div>
    </header>

    <main class="app-shell__body">
      <div class="app-shell__content" :style="contentPaddingStyle" ref="contentEl">
        <slot />
      </div>
    </main>

    <nav v-if="hasTabs" class="app-shell__tabbar">
      <div class="app-shell__safe-bottom" />
      <div class="app-shell__tabs">
        <slot name="tabs" />
      </div>
    </nav>

    <div v-if="debugFlag" class="app-shell__debug-overlay">
      <p>isLiffEntry: {{ isLiffEntry }}</p>
      <p>isInClient: {{ isLiffClient }}</p>
      <p>uaLine: {{ uaLine }}</p>
      <p>topbarHeight: {{ topbarHeight }}px</p>
      <p>contentPaddingTop: {{ contentPaddingTop }}px</p>
      <p>oldHeaderCount: {{ oldHeaderCount }}</p>
      <p>initialURL: {{ initialURL }}</p>
      <p>finalURL: {{ finalURL }}</p>
      <p>didRedirect: {{ didRedirect }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useSlots, watch } from 'vue';

const props = defineProps<{
  showBrandTopBar?: boolean;
  logoSrc: string;
  debugText?: string;
  debugFlag?: boolean;
  isLiffClient?: boolean;
  uaLine?: boolean;
  isLiffEntry?: boolean;
}>();

const slots = useSlots();
const hasTabs = computed(() => Boolean(slots.tabs));
const topbarEl = ref<HTMLElement | null>(null);
const contentEl = ref<HTMLElement | null>(null);
const topbarHeight = ref(0);
const contentPaddingTop = ref(0);
const oldHeaderCount = ref(0);
const initialURL = ref('');
const finalURL = ref('');
const didRedirect = ref(false);

const contentPaddingStyle = computed(() => ({
  paddingTop: '0px',
}));

const measure = () => {
  topbarHeight.value = topbarEl.value?.getBoundingClientRect().height || 0;
  const style = contentEl.value ? window.getComputedStyle(contentEl.value) : null;
  const pt = style ? parseFloat(style.paddingTop || '0') : 0;
  contentPaddingTop.value = Number.isFinite(pt) ? pt : 0;
  if (props.debugFlag) {
    const headers = Array.from(document.querySelectorAll('.mobile-shell__header'));
    oldHeaderCount.value = headers.length;
    if (oldHeaderCount.value > 0) {
      console.warn('[debug] Found legacy headers', oldHeaderCount.value, headers.map((el) => el.className));
    }
  }
};

onMounted(() => {
  if (typeof window !== 'undefined' && (window as any).__URL_TRACE) {
    const trace = (window as any).__URL_TRACE;
    initialURL.value = trace.initialURL ?? '';
    finalURL.value = trace.finalURL ?? '';
    didRedirect.value = !!trace.didRedirect;
  }
  measure();
});

watch(
  () => props.showBrandTopBar,
  () => {
    measure();
  },
);
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

.app-shell__bar {
  height: calc(52px + env(safe-area-inset-top, 0px));
  padding-top: env(safe-area-inset-top, 0px);
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

.app-shell__debug-overlay {
  position: fixed;
  bottom: 12px;
  left: 12px;
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  z-index: 1400;
  line-height: 1.4;
}
</style>
