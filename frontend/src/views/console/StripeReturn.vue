<template>
  <div class="stripe-return" :class="stateClass">
    <div class="card">
      <div class="icon">
        <span v-if="status === 'success'">✅</span>
        <span v-else-if="status === 'error'">⚠️</span>
        <span v-else>⏳</span>
      </div>
      <p class="eyebrow">Stripe 連携</p>
      <h1>{{ heading }}</h1>
      <p class="lede">{{ subtext }}</p>
      <p v-if="error" class="error-text">{{ error }}</p>

      <div class="actions">
        <template v-if="status === 'success' && financeRoute">
          <RouterLink class="btn primary" :to="financeRoute">社群財務を開く</RouterLink>
          <RouterLink class="btn ghost" to="/console">コンソールホームへ</RouterLink>
        </template>
        <template v-else-if="status === 'error'">
          <button class="btn primary" type="button" :disabled="loading" @click="regenerate">
            {{ loading ? '再試行中…' : 'もう一度連携する' }}
          </button>
          <RouterLink class="btn ghost" to="/console">コンソールホームへ</RouterLink>
        </template>
        <template v-else>
          <RouterLink class="btn ghost" to="/console">コンソールホームへ</RouterLink>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { startCommunityStripeOnboarding } from '../../api/client';

const route = useRoute();
const communityId = computed(() => (route.query.communityId as string) || '');
const loading = ref(false);
const error = ref(
  (route.query.error as string) ||
    (route.query.error_description as string) ||
    (route.query.message as string) ||
    '',
);

const financeRoute = computed(() => {
  if (!communityId.value) return null;
  return { name: 'ConsoleMobilePayments', params: { communityId: communityId.value } };
});

const status = computed<'success' | 'error' | 'pending'>(() => {
  if (loading.value) return 'pending';
  if (error.value) return 'error';
  return 'success';
});

const heading = computed(() => {
  if (status.value === 'pending') return '確認中';
  if (status.value === 'error') return '接続に失敗しました';
  return '接続が完了しました';
});

const subtext = computed(() => {
  if (status.value === 'pending') return '数秒お待ちください。';
  if (status.value === 'error') return 'リンクを再発行して、もう一度お試しください。';
  return 'このコミュニティで決済の受け取りができます。';
});

const stateClass = computed(() => ({
  'is-success': status.value === 'success',
  'is-error': status.value === 'error',
}));

const regenerate = async () => {
  if (!communityId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { url } = await startCommunityStripeOnboarding(communityId.value);
    window.location.href = url;
  } catch (err: any) {
    error.value = err?.response?.data?.message || (err instanceof Error ? err.message : '再発行に失敗しました');
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.stripe-return {
  min-height: 100vh;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
}
.stripe-return.is-success {
  background: radial-gradient(circle at 20% 20%, #dbeafe, #f0f9ff 45%, #f8fafc 100%);
}
.stripe-return.is-error {
  background: linear-gradient(135deg, #fff1f2, #f8fafc);
}
.card {
  width: 100%;
  max-width: 420px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 18px;
  /* 移除阴影，保持轻边框 */
  padding: 28px 22px;
  text-align: center;
  border: 1px solid rgba(15, 23, 42, 0.06);
}
.icon {
  font-size: 44px;
  margin-bottom: 8px;
}
.eyebrow {
  margin: 0;
  color: #475569;
  font-size: 13px;
  letter-spacing: 0.08em;
}
h1 {
  margin: 6px 0 8px;
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
}
.lede {
  margin: 0 0 12px;
  color: #475569;
  line-height: 1.5;
}
.error-text {
  margin: 0 0 12px;
  color: #b91c1c;
  font-weight: 600;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  width: 100%;
}
.btn {
  width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 14px;
  border: none;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn.primary {
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  box-shadow: 0 12px 30px rgba(37, 99, 235, 0.22);
}
.btn.ghost {
  background: #f8fafc;
  color: #0f172a;
  border: 1px solid rgba(15, 23, 42, 0.08);
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
