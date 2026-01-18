<template>
  <div v-if="open" class="modal" @click.self="$emit('close')">
    <div class="modal-body">
      <header class="modal-head">
        <h3>{{ title }}</h3>
        <button class="icon-button" type="button" @click="$emit('close')" aria-label="close">
          <span class="i-lucide-x"></span>
        </button>
      </header>
      <p class="modal-message">{{ message }}</p>
      <div class="modal-actions">
        <button class="ghost" type="button" :disabled="loading" @click="$emit('close')">キャンセル</button>
        <button class="primary danger" type="button" :disabled="loading" @click="$emit('confirm')">
          実行する
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ open: boolean; title: string; message: string; loading?: boolean }>();
defineEmits<{ close: []; confirm: [] }>();
</script>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 1200;
}
.modal-body {
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  width: min(480px, 100%);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.22);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.modal-message {
  margin: 0;
  color: #334155;
  line-height: 1.5;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.ghost {
  border: 1px solid #e2e8f0;
  background: #fff;
  padding: 8px 12px;
  border-radius: 10px;
}
.primary {
  border: 1px solid transparent;
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  padding: 8px 12px;
  border-radius: 10px;
}
.danger {
  background: linear-gradient(135deg, #dc2626, #ea580c);
}
.icon-button {
  border: none;
  background: transparent;
  padding: 6px;
  cursor: pointer;
}
</style>
