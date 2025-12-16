<template>
  <section class="payment-status">
    <div class="card">
      <h1>お支払いが完了しました</h1>
      <p>Stripeでのお支払いを受け付けました。参加ステータスは数分以内に反映されます。</p>
      <div class="actions">
        <RouterLink to="/me/events" class="btn primary">申込状況を確認</RouterLink>
        <RouterLink to="/" class="btn secondary">ホームに戻る</RouterLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { MOBILE_EVENT_PENDING_PAYMENT_KEY, MOBILE_EVENT_SUCCESS_KEY } from '../../constants/mobile';
import { trackEvent } from '../../utils/analytics';

const router = useRouter();
const route = useRoute();

onMounted(() => {
  trackEvent('payment_success');
  try {
    const raw = sessionStorage.getItem(MOBILE_EVENT_PENDING_PAYMENT_KEY);
    if (raw) {
      const pending = JSON.parse(raw);
      sessionStorage.removeItem(MOBILE_EVENT_PENDING_PAYMENT_KEY);
      sessionStorage.setItem(MOBILE_EVENT_SUCCESS_KEY, JSON.stringify(pending));
      router.replace({ name: 'MobileEventSuccess', params: { eventId: pending.eventId } });
      return;
    }
  } catch {
    // ignore and fall back to default screen
  }
});
</script>

<style scoped>
.payment-status {
  min-height: 100vh;
  background: var(--color-bg, #f7f7f7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.card {
  background: #fff;
  border-radius: 18px;
  padding: 2rem;
  max-width: 480px;
  width: 100%;
  text-align: center;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.08);
}

h1 {
  margin-top: 0;
  font-size: 1.4rem;
}

p {
  color: #555;
  margin-bottom: 1.5rem;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.btn {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  padding: 0.75rem 1rem;
  border-radius: 999px;
  font-weight: 600;
}

.btn.primary {
  background: var(--color-primary, #ff6b6b);
  color: #fff;
}

.btn.secondary {
  border: 1px solid var(--color-border, #e0e0e0);
  color: #333;
}
</style>
