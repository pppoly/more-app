<template>
  <section class="payment-status">
    <div class="card">
      <h1>お支払いが完了しました</h1>
      <p>Stripeでのお支払いを受け付けました。参加ステータスは数分以内に反映されます。</p>
      <div class="actions">
        <RouterLink class="btn primary" to="/me/events">マイチケットを見る</RouterLink>
        <RouterLink class="btn secondary" to="/events">イベント一覧へ戻る</RouterLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { MOBILE_EVENT_SUCCESS_KEY } from '../../constants/mobile';

const router = useRouter();

onMounted(() => {
  // 成功ページのデータをクリアし、参照元がなければ一覧へ戻る
  try {
    const raw = sessionStorage.getItem(MOBILE_EVENT_SUCCESS_KEY);
    if (!raw) {
      router.replace('/events');
      return;
    }
    sessionStorage.removeItem(MOBILE_EVENT_SUCCESS_KEY);
  } catch {
    router.replace('/events');
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
  margin: 0.75rem 0 0;
  color: #475569;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  font-weight: 600;
  text-decoration: none;
  border: 1px solid transparent;
}

.btn.primary {
  background: #111827;
  color: #fff;
}

.btn.secondary {
  background: #fff;
  color: #111827;
  border-color: #e5e7eb;
}
</style>
