<template>
  <div class="mobile-pay-confirm">
    <ConsoleTopBar v-if="showTopBar" class="topbar" titleKey="mobile.eventCheckout.title" @back="goBack" />
    <section v-if="loading" class="state-card">読み込み中…</section>
    <section v-else-if="error" class="state-card state-card--error">
      {{ error }}
      <button type="button" class="ghost-btn" @click="loadEvent">再読み込み</button>
    </section>

    <section v-else-if="detail" class="body">
      <div class="summary">
        <p class="summary-label">申込内容</p>
        <p class="summary-title">{{ detail.title }}</p>
        <p class="summary-line">{{ detail.timeText }}</p>
      </div>

      <div class="summary summary--payment">
        <p class="summary-label">支払い内容</p>
        <div class="payment-list">
          <div class="payment-item">
            <p class="payment-name">チケット</p>
            <p class="payment-value">{{ ticketNameText }}</p>
          </div>
          <div class="payment-item">
            <p class="payment-name">参加費</p>
            <p class="payment-value payment-value--amount">{{ amountText }}</p>
          </div>
        </div>
      </div>

      <div v-if="refundPolicyText" class="summary summary--refund">
        <p class="summary-label">キャンセル・返金ルール（本申込の参加費について）</p>
        <p class="summary-line summary-line--wrap">{{ refundPolicyText }}</p>
      </div>

      <div class="actions">
        <button type="button" class="btn primary" :disabled="ctaDisabled" @click="handlePay">
          {{ ctaLabel }}
        </button>
      </div>
      <p v-if="registrationError" class="error-text">{{ registrationError }}</p>

    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { createRegistration, createStripeCheckout, fetchEventById, fetchMyEvents } from '../../api/client';
import type { EventDetail } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import { resolveRefundPolicyText } from '../../utils/refundPolicy';
import { MOBILE_EVENT_PENDING_PAYMENT_KEY, MOBILE_EVENT_REGISTRATION_DRAFT_KEY, MOBILE_EVENT_SUCCESS_KEY } from '../../constants/mobile';
import { useLocale } from '../../composables/useLocale';
import ConsoleTopBar from '../../components/console/ConsoleTopBar.vue';
import { isLineInAppBrowser } from '../../utils/liff';

type PendingPaymentPayload = {
  registrationId: string;
  amount?: number | null;
  eventId?: string;
  source?: string;
};

type RegistrationDraftPayload = {
  eventId: string;
  formAnswers?: Record<string, any>;
  ticketTypeId?: string;
  savedAt?: number;
};

const props = defineProps<{ eventId?: string }>();
const route = useRoute();
const router = useRouter();
const { preferredLangs } = useLocale();
const showTopBar = computed(() => !isLineInAppBrowser());

const event = ref<EventDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const submitting = ref(false);
const registrationError = ref<string | null>(null);
const pendingPayment = ref<PendingPaymentPayload | null>(null);

const eventId = computed(() => props.eventId ?? (route.params.eventId as string));

const normalizeQueryValue = (value: unknown) => {
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
};

const currencyFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

const detail = computed(() => {
  if (!event.value) return null;
  const start = formatDate(event.value.startTime);
  const end = event.value.endTime ? formatDate(event.value.endTime) : '未定';
  const title = getLocalizedText(event.value.title, preferredLangs.value);
  return {
    id: event.value.id,
    title,
    timeText: `${start} 〜 ${end}`,
  };
});

const refundPolicyText = computed(() =>
  resolveRefundPolicyText((event.value?.config as Record<string, any>) ?? null),
);

const amountText = computed(() => {
  if (!pendingPayment.value) {
    const prices = event.value?.ticketTypes?.map((t) => t.price ?? 0) ?? [];
    if (!prices.length) return '無料 / 未定';
    const max = Math.max(...prices);
    if (max === 0) return '無料';
    const min = Math.min(...prices);
    return min === max ? currencyFormatter.format(max) : `${currencyFormatter.format(min)} 〜 ${currencyFormatter.format(max)}`;
  }
  const amount = pendingPayment.value.amount;
  if (amount === null || amount === undefined) {
    const prices = event.value?.ticketTypes?.map((t) => t.price ?? 0) ?? [];
    if (!prices.length) return '無料 / 未定';
    const max = Math.max(...prices);
    if (max === 0) return '無料';
    const min = Math.min(...prices);
    return min === max ? currencyFormatter.format(max) : `${currencyFormatter.format(min)} 〜 ${currencyFormatter.format(max)}`;
  }
  return amount === 0 ? '無料' : currencyFormatter.format(amount);
});

const ticketNameText = computed(() => {
  const ticketTypes = event.value?.ticketTypes ?? [];
  if (!ticketTypes.length) return '通常';
  const draft = loadDraftPayload();
  const targetId = draft?.ticketTypeId ?? ticketTypes[0].id;
  const ticket = ticketTypes.find((entry) => entry.id === targetId) ?? ticketTypes[0];
  return ticket.name ? getLocalizedText(ticket.name, preferredLangs.value) : '通常';
});

const hasPaidTicket = computed(
  () => event.value?.ticketTypes?.some((ticket) => (ticket.price ?? 0) > 0 && ticket.type !== 'free') ?? false,
);

const resolveRegistrationWindow = (ev: EventDetail | null) => {
  if (!ev) return { open: true, reason: null as string | null };
  if (ev.status !== 'open') return { open: false, reason: '申込受付は終了しています。' };
  const now = new Date();
  const regStart = ev.regStartTime ? new Date(ev.regStartTime) : null;
  const regEndRaw = ev.regEndTime ?? ev.regDeadline ?? null;
  const regEnd = regEndRaw ? new Date(regEndRaw) : null;
  if (regStart && now < regStart) return { open: false, reason: '申込開始前です。' };
  if (regEnd && now > regEnd) return { open: false, reason: '申込受付は終了しました。' };
  return { open: true, reason: null };
};

const registrationWindow = computed(() => resolveRegistrationWindow(event.value));

const isFreeEvent = computed(() => {
  const prices = event.value?.ticketTypes?.map((t) => t.price ?? 0) ?? [];
  if (!prices.length) return true;
  return Math.max(...prices) === 0;
});

const ctaLabel = computed(() => {
  const amount = pendingPayment.value?.amount ?? null;
  if (submitting.value) return '処理中…';
  if (!pendingPayment.value && !registrationWindow.value.open) return '受付終了';
  if (amount !== null && amount > 0) return `${currencyFormatter.format(amount)} を支払う`;
  if (!pendingPayment.value) return hasPaidTicket.value ? '支払いへ進む' : '無料で申し込む';
  return hasPaidTicket.value ? '支払いへ進む' : '無料で申し込む';
});

const ctaDisabled = computed(
  () => submitting.value || (!pendingPayment.value && !registrationWindow.value.open),
);

const loadPendingPayment = () => {
  try {
    const raw = sessionStorage.getItem(MOBILE_EVENT_PENDING_PAYMENT_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as PendingPaymentPayload;
    if (!stored?.registrationId) return null;
    if (stored?.eventId && stored.eventId !== eventId.value) return null;
    return stored;
  } catch {
    return null;
  }
};

const loadDraftPayload = () => {
  try {
    const raw = sessionStorage.getItem(MOBILE_EVENT_REGISTRATION_DRAFT_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as RegistrationDraftPayload & { answers?: Record<string, any> };
    if (stored?.eventId !== eventId.value) return null;
    return {
      eventId: stored.eventId,
      formAnswers: stored.formAnswers ?? stored.answers ?? undefined,
      ticketTypeId: stored.ticketTypeId ?? undefined,
      savedAt: stored.savedAt ?? undefined,
    };
  } catch {
    return null;
  }
};

const storePendingPayment = (payload: PendingPaymentPayload) => {
  const data: PendingPaymentPayload = {
    ...payload,
    eventId: payload.eventId ?? eventId.value,
    source: payload.source ?? 'mobile',
  };
  sessionStorage.setItem(MOBILE_EVENT_PENDING_PAYMENT_KEY, JSON.stringify(data));
};

const loadPendingFromServer = async (preferredRegistrationId?: string) => {
  try {
    const myEvents = await fetchMyEvents();
    const matched =
      (preferredRegistrationId
        ? myEvents.find((item) => item.registrationId === preferredRegistrationId)
        : null) ??
      myEvents.find((item) => item.event?.id === eventId.value);
    if (!matched) return null;
    const paidLike = ['paid', 'succeeded', 'captured', 'completed'];
    const paid = paidLike.includes(matched.paymentStatus || '') || paidLike.includes(matched.status);
    const amount = matched.amount ?? 0;
    const payableStatuses = new Set(['pending_payment', 'approved']);
    if (amount > 0 && !paid && payableStatuses.has(matched.status)) {
      return {
        registrationId: matched.registrationId,
        amount,
        eventId: matched.event?.id ?? eventId.value,
        source: 'mobile',
      } as PendingPaymentPayload;
    }
  } catch {
    return null;
  }
  return null;
};

const hydratePendingPayment = async () => {
  if (pendingPayment.value) return;
  const registrationId = normalizeQueryValue(route.query.registrationId);
  if (registrationId) {
    const serverPending = await loadPendingFromServer(registrationId);
    if (serverPending) {
      pendingPayment.value = serverPending;
      return;
    }
    pendingPayment.value = {
      registrationId,
      amount: null,
      eventId: eventId.value,
      source: 'mobile',
    };
    return;
  }
  const serverPending = await loadPendingFromServer();
  if (serverPending) pendingPayment.value = serverPending;
};

const loadEvent = async () => {
  if (!eventId.value) {
    error.value = 'イベントが見つかりません';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    event.value = await fetchEventById(eventId.value);
  } catch (err) {
    error.value = 'イベント情報を取得できませんでした';
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  // ここでは主催者申請ページへはリダイレクトせず、利用者がそのまま申し込みできるようにする。
  // 未ログインの場合は後続の API で認証エラーとなるので、フロント側で適宜ログイン誘導を行う。
  loadEvent().then(() => {
    if (event.value && isFreeEvent.value) {
      const payload = buildSuccessPayload('free');
      if (payload) {
        goToSuccessPage(payload);
      }
    }
  });
  pendingPayment.value = loadPendingPayment();
  void hydratePendingPayment();
});

const handlePay = async () => {
  if (!eventId.value) return;
  submitting.value = true;
  registrationError.value = null;
  try {
    if (!pendingPayment.value) {
      const draft = loadDraftPayload();
      if (!draft) {
        await hydratePendingPayment();
        if (!pendingPayment.value) {
          if (!registrationWindow.value.open) {
            registrationError.value =
              registrationWindow.value.reason ?? '申込受付は終了しました。';
          } else {
            registrationError.value = '申込記録が見つかりません。最初からやり直してください。';
          }
          return;
        }
      }
      if (!pendingPayment.value) {
        if (!registrationWindow.value.open) {
          registrationError.value =
            registrationWindow.value.reason ?? '申込受付は終了しました。';
          return;
        }
        const registration = await createRegistration(eventId.value, {
          ticketTypeId: draft?.ticketTypeId,
          formAnswers: draft?.formAnswers,
        });
        sessionStorage.removeItem(MOBILE_EVENT_REGISTRATION_DRAFT_KEY);
        if ((registration.amount ?? 0) === 0) {
          sessionStorage.removeItem(MOBILE_EVENT_PENDING_PAYMENT_KEY);
          const payload = buildSuccessPayload('free');
          if (payload) {
            goToSuccessPage(payload);
          }
          return;
        }
        if (!registration.paymentRequired) {
          sessionStorage.removeItem(MOBILE_EVENT_PENDING_PAYMENT_KEY);
          if (registration.status === 'pending') {
            window.alert('申し込みを受け付けました。主催者の承認後にお支払いが必要です。');
          }
          router.replace({ name: 'event-detail', params: { eventId: eventId.value } });
          return;
        }
        pendingPayment.value = {
          registrationId: registration.registrationId,
          amount: registration.amount,
          eventId: registration.eventId,
          source: 'mobile',
        };
      }
    }

    const activePayment = pendingPayment.value;
    if (!activePayment) {
      registrationError.value = '支払い情報を取得できませんでした。';
      return;
    }

    const { checkoutUrl, resume } = await createStripeCheckout(activePayment.registrationId);
    if (resume) {
      window.alert('未完了の決済があります。決済を再開してください。');
    }
    storePendingPayment(activePayment);
    window.location.href = checkoutUrl;
  } catch (err) {
    registrationError.value = '処理に失敗しました';
  } finally {
    submitting.value = false;
  }
};

const buildSuccessPayload = (status: 'free' | 'paid') => {
  if (!detail.value) return null;
  return {
    eventId: detail.value.id,
    title: detail.value.title,
    timeText: detail.value.timeText,
    paymentStatus: status,
  };
};

const goToSuccessPage = (payload: any) => {
  sessionStorage.setItem(MOBILE_EVENT_SUCCESS_KEY, JSON.stringify(payload));
  router.replace({ name: 'MobileEventSuccess', params: { eventId: payload.eventId } });
};

const goBack = () => {
  router.back();
};

const formatDate = (value: string) => {
  const d = new Date(value);
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()}(${wd}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
</script>

<style scoped>
.mobile-pay-confirm {
  background: #f8fafc;
  min-height: 100vh;
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.topbar {
  width: 100%;
  margin-left: calc(-16px - env(safe-area-inset-left, 0px));
  margin-right: calc(-16px - env(safe-area-inset-right, 0px));
}

.body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.summary {
  background: #fff;
  border-radius: 16px;
  padding: 14px;
  border: 1px solid rgba(15, 23, 42, 0.05);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.summary-label {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  letter-spacing: 0.08em;
}

.summary-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
}

.summary-line {
  margin: 0;
  font-size: 13px;
  color: #475569;
}

.summary-line--wrap {
  white-space: pre-wrap;
  word-break: break-word;
}

.summary--refund {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  box-shadow: none;
}
.summary--payment {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}
.payment-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}
.payment-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.payment-name {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
.payment-value {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}
.payment-value--amount {
  font-size: 15px;
  font-weight: 800;
  color: #22c55e;
}

.summary-amount {
  margin: 4px 0 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn {
  width: 100%;
  height: 48px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  box-sizing: border-box;
}

.btn.primary {
  border: none;
  background: linear-gradient(135deg, #0ea5e9, #22c55e);
  color: #fff;
}

.state-card {
  padding: 16px;
  border-radius: 12px;
  background: #fff;
  color: #0f172a;
  text-align: center;
  border: 1px solid rgba(15, 23, 42, 0.05);
}

.state-card--error {
  color: #dc2626;
  border-color: rgba(220, 38, 38, 0.25);
}

.ghost-btn {
  margin-top: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  color: #0f172a;
  font-weight: 700;
}

.error-text {
  margin: 6px 0 0;
  font-size: 13px;
  color: #dc2626;
}

</style>
