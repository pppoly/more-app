<template>
  <div class="stripe-return">
    <div class="card">
      <div class="icon">✅</div>
      <h1>已返回控制台</h1>
      <p>Stripe 流程完成或已中断，请返回控制台继续操作。</p>
      <RouterLink class="btn" to="/console">返回 Console 首页</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.stripe-return {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
  color: #0f172a;
  padding: 16px;
}
.card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(15, 23, 42, 0.06);
}
.icon {
  font-size: 32px;
  margin-bottom: 12px;
}
.card h1 {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 700;
}
.card p {
  margin: 0 0 16px;
  color: #475569;
  font-size: 14px;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  text-decoration: none;
  font-weight: 700;
}
</style>
