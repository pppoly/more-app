<template>
  <Teleport to="body">
    <div v-if="current" class="confirm-backdrop" @click.self="cancel">
      <div class="confirm-sheet">
        <p class="confirm-title">確認</p>
        <p class="confirm-message">{{ current.message }}</p>
        <div class="confirm-actions">
          <button type="button" class="btn ghost" @click="cancel">キャンセル</button>
          <button type="button" class="btn primary" @click="accept">OK</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { resolveConfirm, useConfirmState } from '../../composables/useConfirm';

const state = useConfirmState();
const current = computed(() => state.queue[0]);

const cancel = () => {
  if (current.value) resolveConfirm(current.value.id, false);
};

const accept = () => {
  if (current.value) resolveConfirm(current.value.id, true);
};
</script>

<style scoped>
.confirm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.confirm-sheet {
  width: min(420px, 100%);
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.25);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirm-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.confirm-message {
  margin: 0;
  font-size: 14px;
  color: #475569;
  line-height: 1.5;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn {
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 600;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #0f172a;
}

.btn.ghost {
  background: #fff;
}

.btn.primary {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}
</style>

