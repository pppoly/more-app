<template>
  <teleport to="body">
    <div v-if="visible" class="sheet-mask" @click.self="$emit('close')">
      <div class="sheet">
        <div class="sheet-head">
          <h3>{{ title }}</h3>
          <button type="button" class="close" aria-label="閉じる" @click="$emit('close')">
            <span class="i-lucide-x"></span>
          </button>
        </div>
        <p class="sheet-desc">{{ description }}</p>
        <div class="actions">
          <button v-if="primaryLabel" type="button" class="primary" @click="$emit('primary')">
            {{ primaryLabel }}
          </button>
          <button type="button" class="ghost" @click="$emit('close')">
            {{ secondaryLabel }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  visible: boolean;
  reason: string;
}>();

const title = computed(() => {
  if (props.reason === 'NOT_ORGANIZER') return '主理人モードが必要です';
  if (props.reason === 'NOT_COMMUNITY_MANAGER') return '管理権限がありません';
  if (props.reason === 'NOT_ADMIN') return '管理者権限が必要です';
  return '権限がありません';
});

const description = computed(() => {
  if (props.reason === 'NOT_ORGANIZER') {
    return '教室・イベントの管理機能を使うには、主理人としての申請が必要です';
  }
  if (props.reason === 'NOT_COMMUNITY_MANAGER') {
    return 'このコミュニティの管理者のみ操作できます。管理者に招待してもらうか、コミュニティを切り替えてください。';
  }
  if (props.reason === 'NOT_ADMIN') {
    return 'この操作には管理者権限が必要です。';
  }
  return '現在のアカウントではこの操作を行えません。';
});

const primaryLabel = computed(() => {
  if (props.reason === 'NOT_ORGANIZER') return '主理人として申請する';
  if (props.reason === 'NOT_COMMUNITY_MANAGER') return '管理者に招待してもらう';
  return props.reason === 'NOT_ADMIN' ? '' : '';
});

const secondaryLabel = computed(() => {
  if (props.reason === 'NOT_COMMUNITY_MANAGER') return '戻る';
  return '戻る';
});

defineEmits<{
  (e: 'primary'): void;
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
  line-height: 1.5;
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
  background: linear-gradient(135deg, #2563eb, #10b981);
  color: #fff;
}
.ghost {
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #0f172a;
}
</style>
