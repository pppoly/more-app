<template>
  <section class="payment-status">
    <div class="card">
      <h1>{{ headline }}</h1>
      <p>{{ message }}</p>
      <div v-if="payload" class="summary">
        <div class="summary__title">{{ payload.title || '' }}</div>
        <div v-if="payload.timeText" class="summary__meta">{{ payload.timeText }}</div>
        <div v-if="payload.locationText" class="summary__meta">{{ payload.locationText }}</div>
      </div>
      <div class="actions">
        <RouterLink v-if="payload?.eventId" class="btn secondary" :to="{ name: 'event-detail', params: { eventId: payload.eventId } }">
          イベント詳細へ戻る
        </RouterLink>
        <RouterLink class="btn primary" to="/me/events">マイチケットを見る</RouterLink>
        <RouterLink class="btn secondary" to="/events">イベント一覧へ戻る</RouterLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { MOBILE_EVENT_SUCCESS_KEY } from '../../constants/mobile';

const router = useRouter();
type SuccessPayload = {
  eventId?: string;
  title?: string;
  timeText?: string;
  locationText?: string;
  paymentStatus?: 'free' | 'paid';
};
const payload = ref<SuccessPayload | null>(null);

const headline = computed(() => {
  if (payload.value?.paymentStatus === 'free') return '申し込みが完了しました';
  return 'お支払いが完了しました';
});
const message = computed(() => {
  if (payload.value?.paymentStatus === 'free') return '参加登録を受け付けました。マイチケットで確認できます。';
  return 'Stripeでのお支払いを受け付けました。参加ステータスは数分以内に反映されます。';
});

onMounted(() => {
  // 成功ページのデータをクリアし、参照元がなければ一覧へ戻る
  try {
    const raw = sessionStorage.getItem(MOBILE_EVENT_SUCCESS_KEY);
    if (!raw) {
      router.replace('/events');
      return;
    }
    try {
      payload.value = JSON.parse(raw) as SuccessPayload;
    } catch {
      payload.value = null;
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

.summary {
  margin-top: 1.25rem;
  padding: 1rem;
  border-radius: 14px;
  background: #f8fafc;
  text-align: left;
}

.summary__title {
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.35rem;
}

.summary__meta {
  color: #475569;
  font-size: 0.95rem;
  line-height: 1.35;
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
