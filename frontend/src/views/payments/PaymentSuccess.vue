<template>
  <section class="payment-status">
    <div class="card">
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
      <p v-if="status === 'checking'" class="hint">通常 1 分ほどで反映されます。</p>
      <div class="actions">
        <button v-if="status === 'timeout' || status === 'error'" class="btn primary" type="button" @click="retryCheck">
          もう一度確認する
        </button>
        <RouterLink
          v-if="status !== 'checking'"
          to="/me/events"
          :class="['btn', status === 'timeout' || status === 'error' ? 'secondary' : 'primary']"
        >
          マイチケットを見る
        </RouterLink>
        <RouterLink v-if="status !== 'checking'" to="/events" class="btn secondary">イベント一覧へ戻る</RouterLink>
        <RouterLink v-else to="/events" class="btn secondary">イベント一覧へ戻る</RouterLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fetchMyEvents } from '../../api/client';
import { MOBILE_EVENT_PENDING_PAYMENT_KEY, MOBILE_EVENT_SUCCESS_KEY } from '../../constants/mobile';
import { trackEvent } from '../../utils/analytics';

type PendingPaymentPayload = {
  registrationId: string;
  amount?: number | null;
  eventId?: string;
  source?: 'mobile' | 'desktop' | 'class' | string;
};

const router = useRouter();
const status = ref<'checking' | 'success' | 'timeout' | 'error'>('checking');
const pending = ref<PendingPaymentPayload | null>(null);
const errorMessage = ref<string | null>(null);

const CHECK_INTERVAL_MS = 2500;
const CHECK_TIMEOUT_MS = 90 * 1000;
let checkTimer: number | null = null;
let checkStartedAt = 0;

const title = computed(() => {
  switch (status.value) {
    case 'checking':
      return '決済を確認しています';
    case 'timeout':
      return '決済の反映に時間がかかっています';
    case 'error':
      return '決済の確認に失敗しました';
    default:
      return 'お支払いが完了しました';
  }
});

const description = computed(() => {
  if (status.value === 'checking') {
    return '決済が完了次第、申込完了画面へ移動します。';
  }
  if (status.value === 'timeout') {
    return 'このまま反映されない場合は「申込状況を確認」からお支払い状況をご確認ください。';
  }
  if (status.value === 'error') {
    return errorMessage.value ?? '通信に失敗しました。時間をおいて再試行してください。';
  }
  return 'Stripeでのお支払いを受け付けました。参加ステータスは数分以内に反映されます。';
});

const clearTimer = () => {
  if (checkTimer) {
    window.clearTimeout(checkTimer);
    checkTimer = null;
  }
};

const finishAsSuccess = () => {
  clearTimer();
  status.value = 'success';
  if (!pending.value) return;
  sessionStorage.removeItem(MOBILE_EVENT_PENDING_PAYMENT_KEY);
  if (pending.value.source === 'mobile' && pending.value.eventId) {
    sessionStorage.setItem(MOBILE_EVENT_SUCCESS_KEY, JSON.stringify(pending.value));
    router.replace({ name: 'MobileEventSuccess', params: { eventId: pending.value.eventId } });
  }
};

const findPaymentRecord = async () => {
  const items = await fetchMyEvents();
  if (!pending.value) return null;
  const byRegistration = items.find((item) => item.registrationId === pending.value?.registrationId);
  if (byRegistration) return byRegistration;
  if (pending.value.eventId) {
    return items.find((item) => item.event?.id === pending.value?.eventId) ?? null;
  }
  return null;
};

const isPaymentConfirmed = (item: any) => {
  if (!item) return false;
  const paidLike = ['paid', 'succeeded', 'captured', 'completed'];
  if (paidLike.includes(item.paymentStatus) || paidLike.includes(item.status)) return true;
  if ((item.amount ?? 0) === 0) return true;
  return false;
};

const scheduleNextCheck = () => {
  if (Date.now() - checkStartedAt >= CHECK_TIMEOUT_MS) {
    status.value = 'timeout';
    return;
  }
  checkTimer = window.setTimeout(checkPaymentStatus, CHECK_INTERVAL_MS);
};

const checkPaymentStatus = async () => {
  try {
    const record = await findPaymentRecord();
    if (record && isPaymentConfirmed(record)) {
      finishAsSuccess();
      return;
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '支払い状況を取得できませんでした。';
    clearTimer();
    status.value = 'error';
    return;
  }
  scheduleNextCheck();
};

const retryCheck = () => {
  status.value = 'checking';
  errorMessage.value = null;
  checkStartedAt = Date.now();
  clearTimer();
  checkPaymentStatus();
};

const loadPendingPayment = () => {
  try {
    const raw = sessionStorage.getItem(MOBILE_EVENT_PENDING_PAYMENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.registrationId) return null;
    return parsed as PendingPaymentPayload;
  } catch {
    return null;
  }
};

onMounted(() => {
  trackEvent('payment_success');
  pending.value = loadPendingPayment();
  if (!pending.value) {
    status.value = 'success';
    return;
  }
  if (!pending.value.source) pending.value.source = 'mobile';
  checkStartedAt = Date.now();
  checkPaymentStatus();
});

onBeforeUnmount(() => {
  clearTimer();
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

.hint {
  margin: -0.75rem 0 1.5rem;
  color: #94a3b8;
  font-size: 0.85rem;
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
