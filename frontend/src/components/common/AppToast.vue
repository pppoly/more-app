<template>
  <div class="toast-stack" aria-live="polite">
    <div
      v-for="toast in items"
      :key="toast.id"
      class="toast"
      :class="`toast--${toast.type}`"
    >
      {{ toast.message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useToastState } from '../../composables/useToast';

const state = useToastState();
const items = computed(() => state.items);
</script>

<style scoped>
.toast-stack {
  position: fixed;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 1000;
  pointer-events: none;
}

.toast {
  min-width: 200px;
  max-width: 360px;
  padding: 12px 14px;
  border-radius: 14px;
  color: #0f172a;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.25);
  font-size: 14px;
  font-weight: 600;
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.toast--success {
  border-color: #bbf7d0;
  background: #ecfdf3;
  color: #166534;
}
.toast--error {
  border-color: #fecdd3;
  background: #fef2f2;
  color: #b91c1c;
}
.toast--warning {
  border-color: #fde68a;
  background: #fffbeb;
  color: #92400e;
}
.toast--info {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}
</style>

