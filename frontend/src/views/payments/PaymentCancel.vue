<template>
  <section class="payment-status">
    <div class="card">
      <h1>決済をキャンセルしました</h1>
      <p>Stripeでのお支払いが完了していません。参加枠を確保するには、再度お申し込みから決済を完了してください。</p>
      <div class="actions">
        <RouterLink to="/events" class="btn secondary">イベント一覧へ</RouterLink>
        <RouterLink to="/me/events" class="btn primary">申込状況を確認</RouterLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
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
