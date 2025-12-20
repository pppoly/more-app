<template>
  <div
    class="app-avatar"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: rounded ? '50%' : '12px',
    }"
  >
    <img :src="resolved" :alt="name || 'avatar'" />
    <span v-if="!src" class="fallback">{{ initial }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { resolveAvatarUrl, avatarInitial } from '../../utils/avatar';

const props = defineProps<{
  src?: string | null;
  name?: string | null;
  size?: number;
  rounded?: boolean;
}>();

const size = computed(() => props.size ?? 48);
const rounded = computed(() => props.rounded ?? true);
const resolved = computed(() => resolveAvatarUrl(props.src));
const initial = computed(() => avatarInitial(props.name));
</script>

<style scoped>
.app-avatar {
  position: relative;
  overflow: hidden;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.app-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 14px;
  font-weight: 700;
  color: #475569;
}
</style>
