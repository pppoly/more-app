<template>
  <section class="maintenance">
    <div class="card">
      <p class="eyebrow">SOCIALMORE</p>
      <h1>{{ t('maintenance.title') }}</h1>
      <p class="desc">{{ t('maintenance.description') }}</p>
      <button type="button" class="primary" @click="reload">
        {{ t('maintenance.retry') }}
      </button>
      <p v-if="showDetail" class="detail">{{ detailMessage }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ error?: Error | null }>();
const { t } = useI18n();

const showDetail = computed(() => import.meta.env.DEV && props.error?.message);
const detailMessage = computed(() => props.error?.message || '');

const reload = () => {
  window.location.reload();
};
</script>

<style scoped>
.maintenance {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at top, #f8fafc, #e2e8f0);
  padding: 24px;
}
.card {
  width: 100%;
  max-width: 520px;
  background: #ffffff;
  border-radius: 18px;
  padding: 28px;
  text-align: center;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.12);
  border: 1px solid #e2e8f0;
}
.eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  letter-spacing: 0.18em;
  color: #64748b;
}
h1 {
  margin: 0 0 12px;
  font-size: 22px;
  color: #0f172a;
}
.desc {
  margin: 0 0 18px;
  color: #475569;
  line-height: 1.6;
}
.primary {
  width: 100%;
  border: none;
  border-radius: 999px;
  padding: 12px 16px;
  background: #0f172a;
  color: #fff;
  font-weight: 700;
}
.detail {
  margin-top: 12px;
  font-size: 12px;
  color: #94a3b8;
}
</style>
