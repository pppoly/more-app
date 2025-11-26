<template>
  <div class="stripe-return" :class="{ 'is-success': !error && !loading }">
    <div class="focus">
      <div v-if="!error && !loading" class="burst">🎉</div>
      <p v-if="!error && !loading" class="badge">收款已开通</p>
      <h1>{{ error ? '未完成' : loading ? '处理中' : '太棒了！' }}</h1>
      <p class="lede">{{ statusText }}</p>
      <p v-if="error" class="error-text">{{ error }}</p>

      <div class="actions">
        <template v-if="!loading && !error && financeRoute">
          <RouterLink class="btn primary" :to="financeRoute">立即前往</RouterLink>
        </template>
        <template v-else>
          <RouterLink class="btn ghost" to="/console">到我的收银台</RouterLink>
          <button
            v-if="communityId && error"
            class="btn primary"
            :disabled="loading"
            @click="regenerate"
          >
            {{ loading ? '重试中…' : '重新尝试' }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
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
  // 桌面收款管理路由
  return { name: 'console-community-finance', params: { communityId: communityId.value } };
});

const statusText = computed(() => {
  if (loading.value) return '正在处理，请稍等…';
  if (error.value) return '开通未完成，可以重试生成链接或稍后再试。';
  return '返回控制台查看收款状态，必要时可以重新生成开通链接。';
});

const regenerate = async () => {
  if (!communityId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { url } = await startCommunityStripeOnboarding(communityId.value);
    window.location.href = url;
  } catch (err: any) {
    error.value = '开通链接生成失败，请稍后重试或联系支持';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.stripe-return {
  min-height: 100vh;
  background: #f8fafc;
  color: #0f172a;
  padding: 64px 16px 40px;
  display: flex;
  align-items: center;
  flex-direction: column;
  text-align: center;
}
.stripe-return.is-success {
  background: radial-gradient(circle at 20% 20%, #dbeafe, #f0f9ff 45%, #f8fafc 100%);
}
.focus {
  width: 100%;
  max-width: 520px;
  padding: 28px 22px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 18px;
  box-shadow: 0 24px 55px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.stripe-return h1 {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 800;
}
.lede {
  margin: 0 0 16px;
  color: #475569;
  line-height: 1.5;
}
.error-text {
  margin: 0 0 12px;
  color: #b91c1c;
  font-weight: 600;
}
.badge {
  margin: 0 0 12px;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
  font-weight: 700;
  font-size: 13px;
}
.burst {
  font-size: 44px;
  margin-bottom: 8px;
}
.actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.btn {
  flex: 1;
  min-width: 160px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 14px;
  border: none;
  cursor: pointer;
  text-decoration: none;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
.btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
}
</style>
