<template>
  <teleport to="body">
    <div v-if="visible" class="sheet-mask" @click.self="$emit('close')">
      <div class="sheet">
        <div class="sheet-head">
          <h3>ログインが必要です</h3>
          <button type="button" class="close" aria-label="閉じる" @click="$emit('close')">
            <span class="i-lucide-x"></span>
          </button>
        </div>
        <p class="sheet-desc">この操作を続けるにはログインしてください</p>
        <div v-if="pendingAction" class="pill">{{ pendingAction }}</div>
        <div class="actions">
          <button type="button" class="primary" @click="$emit('login')">LINEでログイン</button>
          <button type="button" class="ghost" @click="$emit('close')">キャンセル</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean;
  pendingAction?: string;
}>();
defineEmits<{
  (e: 'login'): void;
  (e: 'close'): void;
}>();
</script>

<style scoped>
.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  z-index: 9999;
}
.sheet {
  width: 100%;
  background: #fff;
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  padding: 16px;
  box-shadow: 0 -8px 30px rgba(15, 23, 42, 0.12);
}
.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sheet-head h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
}
.close {
  border: none;
  background: transparent;
  font-size: 20px;
  color: #6b7280;
}
.sheet-desc {
  margin: 8px 0 12px;
  color: #475569;
  font-size: 14px;
}
.pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: #eef2ff;
  color: #1d4ed8;
  font-size: 12px;
  margin-bottom: 12px;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.primary,
.ghost {
  width: 100%;
  height: 46px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 15px;
}
.primary {
  border: none;
  background: linear-gradient(135deg, #10b981, #0ea5e9);
  color: #fff;
}
.ghost {
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #0f172a;
}
</style>
