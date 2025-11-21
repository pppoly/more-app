<template>
  <div class="mobile-checkout">
    <header class="checkout-header">
      <button class="back-button" type="button" @click="goBackToForm">
        <span class="i-lucide-chevron-left text-lg"></span>
      </button>
      <div class="header-info">
        <p class="header-label">確認と決済</p>
        <h1>{{ detail?.title ?? '読み込み中…' }}</h1>
      </div>
    </header>

    <section v-if="loading" class="checkout-skeleton">
      <div class="skeleton-hero shimmer"></div>
      <div class="skeleton-card shimmer"></div>
      <div class="skeleton-card shimmer"></div>
    </section>

    <section v-else-if="error" class="state-card state-card--error">
      {{ error }}
      <button type="button" class="retry-btn" @click="loadEvent">再試行</button>
    </section>

    <section v-else-if="detail" class="checkout-body">
      <article class="hero-card">
        <p class="hero-label">参加概要</p>
        <h2 class="hero-title">{{ detail.title }}</h2>
        <p class="hero-meta">{{ detail.timeText }}</p>
        <p class="hero-meta">{{ detail.locationText }}</p>
        <p class="hero-price">{{ detail.priceText }}</p>
      </article>

      <article class="ios-panel">
        <header class="panel-head">
          <div>
            <p class="panel-label">入力内容の確認</p>
            <p class="panel-hint">この内容で主催者に送信されます。</p>
          </div>
        </header>
        <ul class="confirm-list" v-if="formFields.length">
          <li v-for="(field, index) in formFields" :key="fieldKey(field, index)">
            <p class="confirm-label">{{ field.label }}</p>
            <p class="confirm-value">{{ displayValue(field, index) }}</p>
          </li>
        </ul>
        <p v-else class="panel-hint">特別な入力項目はありませんでした。</p>
      </article>

      <article class="ios-panel">
        <header class="panel-head">
          <div>
            <p class="panel-label">決済・完了</p>
            <p class="panel-hint">申込を確定後、必要に応じて決済へ進みます。</p>
          </div>
        </header>
        <div class="checkout-actions">
          <button type="button" class="rails-cta" :class="{ 'is-disabled': submitting }" :disabled="submitting" @click="submitRegistration">
            <span class="i-lucide-check-circle"></span>
            {{ submitting ? '処理中…' : '申込を確定する' }}
          </button>
          <p v-if="paymentMessage" class="payment-hint">{{ paymentMessage }}</p>
          <p v-if="holdExpireText" class="payment-hint subtle">
            枠は {{ holdExpireText }} まで保持されます。
          </p>
          <div v-if="pendingPayment" class="payment-buttons">
            <Button variant="primary" size="md" class="flex-1 justify-center" :disabled="isRedirecting" @click="handleStripeCheckout">
              {{ isRedirecting ? 'Stripeへ移動中…' : 'Stripeで支払う' }}
            </Button>
            <Button variant="outline" size="md" class="flex-1 justify-center" :disabled="isPaying" @click="handleMockPayment">
              {{ isPaying ? 'Mock 決済中…' : 'Mock 支払い（デモ）' }}
            </Button>
          </div>
        </div>
        <p v-if="registrationError" class="ios-error">{{ registrationError }}</p>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { isAxiosError } from 'axios';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  createMockPayment,
  createRegistration,
  createStripeCheckout,
  fetchEventById,
} from '../../api/client';
import type { EventDetail, RegistrationFormField, EventRegistrationSummary } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import Button from '../../components/ui/Button.vue';
import { useAuth } from '../../composables/useAuth';
import {
  MOBILE_EVENT_PENDING_PAYMENT_KEY,
  MOBILE_EVENT_REGISTRATION_DRAFT_KEY,
  MOBILE_EVENT_SUCCESS_KEY,
} from '../../constants/mobile';

const props = defineProps<{ eventId?: string }>();
const route = useRoute();
const router = useRouter();
const { user } = useAuth();

const event = ref<EventDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const submitting = ref(false);
const registrationError = ref<string | null>(null);
const pendingPayment = ref<{ registrationId: string; amount?: number } | null>(null);
const paymentMessage = ref<string | null>(null);
const isPaying = ref(false);
const isRedirecting = ref(false);
const holdExpiresAt = ref<string | null>(null);

const answers = reactive<Record<string, any>>({});
type SuccessPayload = {
  eventId: string;
  title: string;
  timeText: string;
  locationText: string;
  priceText?: string;
  paymentStatus: 'free' | 'paid';
  holdExpiresAt: string;
};
const HOLD_DURATION_MS = 30 * 60 * 1000;

const eventId = computed(() => props.eventId ?? (route.params.eventId as string));

const currencyFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

const derivePriceText = (target: EventDetail | null) => {
  if (!target?.ticketTypes?.length) return '無料 / 未定';
  const prices = target.ticketTypes.map((ticket) => ticket.price ?? 0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (max === 0) return '無料';
  if (min === max) return currencyFormatter.format(max);
  return `${currencyFormatter.format(min)} 〜 ${currencyFormatter.format(max)}`;
};

const resolveErrorMessage = (err: unknown, fallback: string) => {
  if (isAxiosError(err)) {
    const message = err.response?.data?.message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message) && message.length) {
      const first = message[0];
      if (typeof first === 'string') {
        return first;
      }
    }
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return fallback;
};

const detail = computed(() => {
  if (!event.value) return null;
  const start = formatDate(event.value.startTime);
  const end = event.value.endTime ? formatDate(event.value.endTime) : '未定';
  return {
    id: event.value.id,
    title: getLocalizedText(event.value.title),
    timeText: `${start} 〜 ${end}`,
    locationText: event.value.locationText || '場所未定',
    priceText: event.value.config?.priceText ?? derivePriceText(event.value),
  };
});

const formFields = computed<RegistrationFormField[]>(() => (event.value?.registrationFormSchema as RegistrationFormField[]) ?? []);
const defaultTicketId = computed(() => {
  if (!event.value?.ticketTypes?.length) return null;
  const paidOrFirst = event.value.ticketTypes.find((ticket) => (ticket.price ?? 0) > 0) ?? event.value.ticketTypes[0];
  return paidOrFirst?.id ?? null;
});
const holdExpireText = computed(() => {
  if (!holdExpiresAt.value) return null;
  const date = new Date(holdExpiresAt.value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
});

const buildSuccessPayload = (status: 'free' | 'paid'): SuccessPayload | null => {
  if (!detail.value) return null;
  return {
    eventId: detail.value.id,
    title: detail.value.title,
    timeText: detail.value.timeText,
    locationText: detail.value.locationText,
    priceText: detail.value.priceText,
    paymentStatus: status,
    holdExpiresAt: new Date(Date.now() + HOLD_DURATION_MS).toISOString(),
  };
};

const goToSuccessPage = (payload: SuccessPayload) => {
  sessionStorage.setItem(MOBILE_EVENT_SUCCESS_KEY, JSON.stringify(payload));
  router.replace({ name: 'MobileEventSuccess', params: { eventId: payload.eventId } });
};

const storePendingPayment = (registration: EventRegistrationSummary) => {
  const payload = buildSuccessPayload('paid');
  if (!payload) return;
  holdExpiresAt.value = payload.holdExpiresAt;
  const pendingRecord = {
    ...payload,
    registrationId: registration.registrationId,
  };
  sessionStorage.setItem(MOBILE_EVENT_PENDING_PAYMENT_KEY, JSON.stringify(pendingRecord));
};

const clearPendingPayment = () => {
  sessionStorage.removeItem(MOBILE_EVENT_PENDING_PAYMENT_KEY);
};

const loadEvent = async () => {
  if (!eventId.value) {
    error.value = 'イベントが見つかりませんでした。';
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    event.value = await fetchEventById(eventId.value);
    loadAnswersFromDraft();
  } catch (err) {
    error.value = resolveErrorMessage(err, 'イベント情報の取得に失敗しました');
  } finally {
    loading.value = false;
  }
};

watch(
  () => eventId.value,
  (newId, oldId) => {
    if (newId && newId !== oldId && user.value) {
      loadEvent();
    }
  },
);

const loadAnswersFromDraft = () => {
  try {
    const raw = sessionStorage.getItem(MOBILE_EVENT_REGISTRATION_DRAFT_KEY);
    if (!raw) {
      error.value = '入力情報が見つかりませんでした。もう一度入力してください。';
      router.replace({ name: 'MobileEventRegister', params: { eventId: eventId.value } });
      return;
    }
    const stored = JSON.parse(raw);
    if (stored?.eventId !== eventId.value || !stored?.answers) {
      router.replace({ name: 'MobileEventRegister', params: { eventId: eventId.value } });
      return;
    }
    Object.keys(answers).forEach((key) => delete answers[key]);
    Object.assign(answers, stored.answers);
  } catch {
    router.replace({ name: 'MobileEventRegister', params: { eventId: eventId.value } });
  }
};

onMounted(() => {
  if (!user.value) {
    router.replace({ name: 'organizer-apply', query: { redirect: route.fullPath } });
    return;
  }
  loadEvent();
});

const submitRegistration = async () => {
  if (!eventId.value) return;
  submitting.value = true;
  registrationError.value = null;
  try {
    const registration = await createRegistration(eventId.value, {
      ticketTypeId: defaultTicketId.value ?? undefined,
      formAnswers: { ...answers },
    });
    handleRegistrationResult(registration);
    sessionStorage.removeItem(MOBILE_EVENT_REGISTRATION_DRAFT_KEY);
  } catch (err) {
    registrationError.value = resolveErrorMessage(err, '申込に失敗しました');
  } finally {
    submitting.value = false;
  }
};

const handleRegistrationResult = (registration: EventRegistrationSummary) => {
  if (registration.paymentRequired) {
    pendingPayment.value = {
      registrationId: registration.registrationId,
      amount: registration.amount,
    };
    storePendingPayment(registration);
    const expiresAt = holdExpireText.value;
    paymentMessage.value = expiresAt
      ? `お支払いを完了すると参加が確定します。枠は ${expiresAt} まで保持されます。`
      : 'お支払いを完了すると参加が確定します。';
    sessionStorage.removeItem(MOBILE_EVENT_REGISTRATION_DRAFT_KEY);
  } else {
    pendingPayment.value = null;
    const payload = buildSuccessPayload('free');
    sessionStorage.removeItem(MOBILE_EVENT_REGISTRATION_DRAFT_KEY);
    if (payload) {
      goToSuccessPage(payload);
    }
  }
};

const handleMockPayment = async () => {
  if (!pendingPayment.value) return;
  isPaying.value = true;
  registrationError.value = null;
  try {
    await createMockPayment(pendingPayment.value.registrationId);
    pendingPayment.value = null;
    paymentMessage.value = 'お支払いが完了しました。参加が確定です。';
    clearPendingPayment();
    const payload = buildSuccessPayload('paid');
    if (payload) {
      goToSuccessPage(payload);
      return;
    }
  } catch (err) {
    registrationError.value = resolveErrorMessage(err, '決済処理に失敗しました');
  } finally {
    isPaying.value = false;
  }
};

const handleStripeCheckout = async () => {
  if (!pendingPayment.value) return;
  isRedirecting.value = true;
  registrationError.value = null;
  try {
    const { checkoutUrl } = await createStripeCheckout(pendingPayment.value.registrationId);
    window.location.href = checkoutUrl;
  } catch (err: any) {
    const message =
      err?.response?.data?.message ?? (err instanceof Error ? err.message : 'Stripe Checkoutの開始に失敗しました');
    registrationError.value = message;
    isRedirecting.value = false;
  }
};

const goBackToForm = () => {
  router.push({ name: 'MobileEventRegister', params: { eventId: eventId.value } });
};

const fieldKey = (field: RegistrationFormField, index: number) => field.id ?? `${field.label ?? 'field'}-${index}`;
const displayValue = (field: RegistrationFormField, index: number) => {
  const value = answers[fieldKey(field, index)];
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : '未入力';
  }
  if (typeof value === 'boolean') {
    return value ? 'はい' : 'いいえ';
  }
  return value || '未入力';
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
  });
</script>

<style scoped>
.mobile-checkout {
  background: #f8fafc;
  min-height: 100vh;
}

.checkout-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 16px 6px;
}

.back-button {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: none;
  background: #fff;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
}

.header-info h1 {
  font-size: 18px;
  margin: 2px 0 0;
  font-weight: 600;
}

.header-label {
  font-size: 12px;
  color: rgba(15, 23, 42, 0.6);
  margin: 0;
  letter-spacing: 0.1em;
}

.checkout-body {
  padding: 0 16px 80px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hero-card {
  background: linear-gradient(135deg, #14213d, #4860f1);
  color: #f0f5ff;
  border-radius: 20px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.2);
}

.hero-title {
  font-size: 20px;
  margin: 0;
}

.hero-meta {
  margin: 0;
  font-size: 13px;
  opacity: 0.85;
}

.hero-price {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 600;
}

.ios-panel {
  background: #fff;
  border-radius: 20px;
  padding: 18px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.panel-label {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.panel-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.6);
}

.confirm-list {
  list-style: none;
  padding: 0;
  margin: 16px 0 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirm-label {
  margin: 0;
  font-size: 13px;
  color: rgba(15, 23, 42, 0.5);
}

.confirm-value {
  margin: 2px 0 0;
  font-size: 15px;
  font-weight: 600;
  color: rgba(15, 23, 42, 0.9);
  word-break: break-word;
}

.checkout-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.payment-hint {
  margin: 0;
  font-size: 13px;
  color: rgba(15, 23, 42, 0.75);
}
.payment-hint.subtle {
  color: rgba(15, 23, 42, 0.55);
}

.payment-buttons {
  display: flex;
  gap: 10px;
}

.rails-cta {
  width: 100%;
  border: none;
  border-radius: 999px;
  padding: 14px 18px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  background: #0090d9;
  color: #fff;
  box-shadow: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.rails-cta:active:not(.is-disabled) {
  transform: scale(0.98);
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.12), 0 6px 12px rgba(45, 55, 72, 0.25);
}

.rails-cta.is-disabled,
.rails-cta:disabled {
  background: #92d0f5;
  color: rgba(255, 255, 255, 0.8);
  box-shadow: none;
  transform: none;
}

.ios-error {
  margin-top: 10px;
  font-size: 13px;
  color: #dc2626;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(220, 38, 38, 0.08);
}

.state-card {
  padding: 18px;
  margin: 24px 16px;
  border-radius: 16px;
  background: #fff;
  text-align: center;
}

.state-card--error {
  border: 1px solid rgba(220, 38, 38, 0.2);
  color: #dc2626;
}

.retry-btn {
  margin-top: 8px;
  border: none;
  background: transparent;
  color: var(--color-primary, #0ea5e9);
  font-size: 14px;
}

.checkout-skeleton {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-hero,
.skeleton-card {
  width: 100%;
  border-radius: 20px;
  height: 120px;
}

.skeleton-hero {
  height: 200px;
}

.shimmer {
  position: relative;
  overflow: hidden;
  background: linear-gradient(90deg, #edf2ff 25%, #e2e8f8 37%, #edf2ff 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

@keyframes shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>
