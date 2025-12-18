<template>
  <header class="console-topbar" :class="{ sticky }">
    <button
      v-if="showBackButton"
      type="button"
      class="topbar-back"
      aria-label="戻る"
      @click="$emit('back')"
    >
      <img :src="backIcon" alt="" aria-hidden="true" />
    </button>
    <p class="topbar-title">{{ titleText }}</p>
    <slot name="right">
      <span class="topbar-placeholder" aria-hidden="true"></span>
    </slot>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import backIcon from '../../assets/icons/arrow-back.svg';
import { isLineInAppBrowser } from '../../utils/liff';

const props = defineProps<{
  titleKey?: string;
  title?: string;
  sticky?: boolean;
}>();

const { t } = useI18n();
const titleText = computed(() => {
  if (props.title) return props.title;
  if (props.titleKey) return t(props.titleKey);
  return '';
});

const showBackButton = computed(() => !isLineInAppBrowser());
</script>

<style scoped>
.console-topbar {
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  padding: calc(env(safe-area-inset-top, 0px) + 8px) 12px 8px;
  background: rgba(248, 250, 252, 0.96);
  border-bottom: 1px solid #e2e8f0;
  backdrop-filter: blur(12px);
  z-index: 20;
}
.console-topbar.sticky {
  position: sticky;
}
.topbar-back {
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: #fff;
  border-radius: 12px;
  padding: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
}
.topbar-back img {
  width: 18px;
  height: 18px;
}
.topbar-title {
  flex: 1;
  text-align: center;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}
.topbar-placeholder {
  width: 36px;
  height: 36px;
}
.topbar-right {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 36px;
}
</style>
