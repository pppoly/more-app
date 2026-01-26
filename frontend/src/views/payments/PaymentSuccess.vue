<template>
  <div class="payment-page">
    <div class="content">
      <div class="hero">
        <div class="hero-icon" aria-hidden="true">
          <svg v-if="status === 'success'" viewBox="0 0 64 64" role="img">
            <defs>
              <linearGradient id="success-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0ea5e9" />
                <stop offset="100%" stop-color="#22c55e" />
              </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="30" fill="url(#success-grad)" />
            <path
              d="M22 32.5 29.5 40 42 24"
              fill="none"
              stroke="#ffffff"
              stroke-width="5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <svg v-else-if="status === 'timeout'" viewBox="0 0 64 64" role="img">
            <circle cx="32" cy="32" r="30" fill="#f59e0b" />
            <path
              d="M32 18v18"
              fill="none"
              stroke="#ffffff"
              stroke-width="5"
              stroke-linecap="round"
            />
            <circle cx="32" cy="46" r="3" fill="#ffffff" />
          </svg>
          <svg v-else-if="status === 'error'" viewBox="0 0 64 64" role="img">
            <circle cx="32" cy="32" r="30" fill="#ef4444" />
            <path
              d="M24 24l16 16M40 24 24 40"
              fill="none"
              stroke="#ffffff"
              stroke-width="5"
              stroke-linecap="round"
            />
          </svg>
          <div v-else class="spinner"></div>
        </div>
        <div class="hero-text">
          <h1>{{ title }}</h1>
          <p>{{ description }}</p>
          <p v-if="status === 'checking'" class="hint">通常 1 分ほどで反映されます。</p>
        </div>
      </div>

      <div class="actions">
        <button
          v-if="status === 'timeout' || status === 'error'"
          class="btn primary"
          type="button"
          @click="retryCheck"
        >
          もう一度確認する
        </button>
        <RouterLink
          v-if="status !== 'checking'"
          to="/me/events"
          :class="['btn', status === 'timeout' || status === 'error' ? 'secondary' : 'primary']"
        >
          マイチケットを見る
        </RouterLink>
        <RouterLink to="/events" class="btn secondary">イベント一覧へ戻る</RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { confirmStripeCheckoutSession, fetchMyEvents } from '../../api/client';
import { MOBILE_CLASS_SUCCESS_KEY, MOBILE_EVENT_PENDING_PAYMENT_KEY, MOBILE_EVENT_SUCCESS_KEY } from '../../constants/mobile';
import { trackEvent } from '../../utils/analytics';

type PendingPaymentPayload = {
  registrationId: string;
  amount?: number | null;
  eventId?: string;
  source?: 'mobile' | 'desktop' | 'class' | string;
  classId?: string;
  lessonId?: string;
  slug?: string;
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
    return;
  }
  if (pending.value.source === 'class' && pending.value.classId && pending.value.slug) {
    sessionStorage.setItem(
      MOBILE_CLASS_SUCCESS_KEY,
      JSON.stringify({
        classId: pending.value.classId,
        lessonId: pending.value.lessonId,
      }),
    );
    router.replace({
      name: 'community-class-detail',
      params: { slug: pending.value.slug, classId: pending.value.classId },
    });
    return;
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
  const sessionId =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search || '').get('session_id') : null;
  if (sessionId) {
    confirmStripeCheckoutSession(sessionId).catch(() => undefined);
  }
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

.hint {
  margin: 10px 0 0;
  color: #94a3b8;
  font-size: 12px;
}

.hero-icon svg {
  width: 88px;
  height: 88px;
  display: block;
}

.spinner {
  width: 56px;
  height: 56px;
  border-radius: 999px;
  border: 4px solid rgba(15, 23, 42, 0.14);
  border-top-color: #0ea5e9;
  animation: spin 1s linear infinite;
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

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
