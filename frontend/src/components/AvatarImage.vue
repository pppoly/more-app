<template>
  <span class="avatar" :style="wrapperStyle">
    <img
      :src="displaySrc"
      :alt="alt"
      :loading="loading"
      :style="{ borderRadius, objectFit }"
      @error="handleError"
    />
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useResourceConfig } from '../composables/useResourceConfig';
import { resolveAssetUrl } from '../utils/assetUrl';

type Shape = 'circle' | 'rounded';

const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: 'avatar' },
  size: { type: [Number, String], default: 32 },
  radius: { type: [Number, String], default: 8 },
  shape: { type: String as () => Shape, default: 'rounded' },
  loading: { type: String as () => 'lazy' | 'eager', default: 'lazy' },
  fallbackSrc: { type: String, default: '' },
  fit: { type: String as () => 'cover' | 'contain', default: 'cover' },
});

const resourceConfig = useResourceConfig();
const { slotMap } = resourceConfig;

const defaultAvatar = computed(
  () => props.fallbackSrc || resourceConfig.getStringValue('global.defaultAvatar') || (slotMap['global.defaultAvatar'].defaultValue as string),
);

const hasError = ref(false);

const resolvedSrc = computed(() => resolveAssetUrl(props.src));
const fallbackSrc = computed(() => resolveAssetUrl(defaultAvatar.value));

const displaySrc = computed(() => (!props.src || hasError.value ? fallbackSrc.value : resolvedSrc.value));

const toSize = (value: number | string) => (typeof value === 'number' ? `${value}px` : value);

const wrapperStyle = computed(() => ({
  width: toSize(props.size),
  height: toSize(props.size),
}));

const borderRadius = computed(() => (props.shape === 'circle' ? '50%' : toSize(props.radius)));
const objectFit = computed(() => props.fit);

const handleError = () => {
  if (!hasError.value) {
    hasError.value = true;
  }
};
</script>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: transparent;
  border: none;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
