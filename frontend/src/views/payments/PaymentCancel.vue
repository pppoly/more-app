<template>
  <div class="payment-page">
    <div class="content">
      <div class="hero">
        <div class="hero-icon" aria-hidden="true">
          <svg viewBox="0 0 64 64" role="img">
            <circle cx="32" cy="32" r="30" fill="#64748b" />
            <path
              d="M24 24l16 16M40 24 24 40"
              fill="none"
              stroke="#ffffff"
              stroke-width="5"
              stroke-linecap="round"
            />
          </svg>
        </div>
        <div class="hero-text">
          <h1>決済をキャンセルしました</h1>
          <p>Stripeでのお支払いが完了していません。参加枠を確保するには、再度お申し込みから決済を完了してください。</p>
        </div>
      </div>
      <div class="actions">
        <RouterLink to="/me/events" class="btn primary">申込状況を確認</RouterLink>
        <RouterLink to="/events" class="btn secondary">イベント一覧へ</RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { MOBILE_EVENT_PENDING_PAYMENT_KEY } from '../../constants/mobile';

onMounted(() => {
  sessionStorage.removeItem(MOBILE_EVENT_PENDING_PAYMENT_KEY);
});
</script>

<style scoped>
.payment-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f8fafc;
  align-items: center;
  justify-content: flex-start;
  padding: 12px 16px calc(24px + env(safe-area-inset-bottom, 0px));
  gap: 12px;
  box-sizing: border-box;
}

.content {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.hero-icon {
  width: 88px;
  height: 88px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hero-icon svg {
  width: 88px;
  height: 88px;
  display: block;
}

.hero-text h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
}

.hero-text p {
  margin: 6px 0 0;
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn {
  width: 100%;
  min-height: 48px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  box-sizing: border-box;
  border: 1px solid transparent;
}

.btn.primary {
  border: none;
  background: linear-gradient(135deg, #0ea5e9, #22c55e);
  color: #fff;
  letter-spacing: 0.01em;
  box-shadow: 0 10px 22px rgba(14, 165, 233, 0.2);
}

.btn.secondary {
  border: 1px solid rgba(15, 23, 42, 0.16);
  background: #fff;
  color: #0f172a;
}
</style>
