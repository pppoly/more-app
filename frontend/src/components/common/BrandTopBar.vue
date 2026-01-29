<template>
  <div class="brand-topbar">
    <div class="brand-topbar__safe" />
    <div class="brand-topbar__bar">
      <div class="brand-topbar__left">
        <img :src="logoSrc" alt="SOCIALMORE" class="brand-topbar__logo" />
      </div>
      <div class="brand-topbar__center"></div>
      <div class="brand-topbar__right">
        <span v-if="showDebug" class="brand-topbar__debug">{{ debugText }}</span>
        <slot name="actions"></slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  logoSrc: string;
  showDebug?: boolean;
  debugText?: string;
}>();
</script>

<style scoped>
.brand-topbar {
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1100;
  background: #ffffff;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06);
}

.brand-topbar__safe {
  height: env(safe-area-inset-top, 0px);
  background: transparent;
}

.brand-topbar__bar {
  height: 52px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.brand-topbar__left,
.brand-topbar__center,
.brand-topbar__right {
  display: flex;
  align-items: center;
}

.brand-topbar__left {
  flex: 0 0 auto;
}

.brand-topbar__center {
  flex: 1 1 auto;
  min-width: 0;
}

.brand-topbar__right {
  flex: 0 0 auto;
  min-width: 36px;
  justify-content: flex-end;
  gap: 6px;
}

.brand-topbar__logo {
  height: 28px;
  width: auto;
  object-fit: contain;
}

.brand-topbar__debug {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
}
</style>
