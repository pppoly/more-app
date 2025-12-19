<template>
  <div class="mobile-register">
    <ConsoleTopBar class="topbar" titleKey="mobile.eventRegister.title" @back="router.back()" />

    <section v-if="loading" class="register-skeleton">
      <div class="skeleton-hero shimmer"></div>
      <div class="skeleton-card shimmer"></div>
      <div class="skeleton-card shimmer"></div>
    </section>

    <section v-else-if="error" class="state-card state-card--error">
      {{ error }}
      <button type="button" class="retry-btn" @click="loadEvent">再試行</button>
    </section>

    <section v-else-if="detail" class="register-body">
      <article class="summary-card">
        <div class="summary-meta">
          <p class="summary-time">
            <span class="i-lucide-calendar-days"></span>
            {{ detail.timeText }}
          </p>
          <p class="summary-location">
            <span class="i-lucide-map-pin"></span>
            {{ detail.locationText }}
          </p>
        </div>
        <div class="summary-title-row">
          <h1 class="summary-title">{{ detail.title }}</h1>
          <span class="price-chip">{{ detail.priceText }}</span>
        </div>
      </article>

      <article class="ticket-line">
        <div>
          <p class="line-label">チケット</p>
          <p class="line-value">{{ selectedTicket?.name || '参加チケット' }}</p>
        </div>
        <span class="price-chip price-chip--ghost">{{ detail.priceText }}</span>
      </article>

      <p v-if="registrationUnavailableReason" class="ios-notice">
        {{ registrationUnavailableReason }}
      </p>

      <article v-if="formFields.length" class="form-panel">
        <header class="panel-head">
          <p class="panel-label">参加者情報</p>
          <span class="badge">{{ `${formFields.length}項目` }}</span>
        </header>
        <div class="ios-section">
          <div v-for="(field, index) in formFields" :key="fieldKey(field, index)" class="ios-row">
            <div class="ios-label">
              {{ field.label }}
              <span v-if="field.required" class="required">*</span>
            </div>
            <div class="ios-input">
              <template v-if="['text', 'email', 'phone', 'number', 'date'].includes(field.type)">
                <input
                  :type="inputType(field.type)"
                  :placeholder="field.placeholder || '入力してください'"
                  v-model="formValues[fieldKey(field, index)]"
                  class="ios-input-control"
                />
              </template>
              <textarea
                v-else-if="field.type === 'textarea'"
                rows="3"
                :placeholder="field.placeholder || '入力してください'"
                v-model="formValues[fieldKey(field, index)]"
                class="ios-input-control"
              ></textarea>
              <select
                v-else-if="field.type === 'select'"
                v-model="formValues[fieldKey(field, index)]"
                class="ios-input-control"
              >
                <option value="">選択してください</option>
                <option v-for="option in getOptions(field)" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
              <div v-else-if="field.type === 'singleChoice'" class="ios-choice">
                <label v-for="option in getOptions(field)" :key="option">
                  <input
                    type="radio"
                    :name="fieldKey(field, index)"
                    :value="option"
                    v-model="formValues[fieldKey(field, index)]"
                  />
                  <span>{{ option }}</span>
                </label>
              </div>
              <div v-else-if="field.type === 'multiChoice'" class="ios-choice">
                <label v-for="option in getOptions(field)" :key="option">
                  <input
                    type="checkbox"
                    :checked="Array.isArray(formValues[fieldKey(field, index)]) && formValues[fieldKey(field, index)].includes(option)"
                    @change="toggleMulti(field, index, option, ($event.target as HTMLInputElement).checked)"
                  />
                  <span>{{ option }}</span>
                </label>
              </div>
              <label v-else-if="field.type === 'checkbox'" class="ios-checkbox">
                <input
                  type="checkbox"
                  :checked="Boolean(formValues[fieldKey(field, index)])"
                  @change="formValues[fieldKey(field, index)] = ($event.target as HTMLInputElement).checked"
                />
                <span>{{ field.label }}</span>
              </label>
              <p class="ios-placeholder" v-else>この項目は現在対応していません。</p>
              <p v-if="fieldErrors[fieldKey(field, index)]" class="ios-field-error">
                {{ fieldErrors[fieldKey(field, index)] }}
              </p>
            </div>
          </div>
        </div>
      </article>

      <article class="accordion">
        <button type="button" class="accordion-head" @click="showGuideline = !showGuideline">
          <div>
            <p class="accordion-title">注意事項</p>
            <p class="accordion-summary">申し込み前に必ずご確認ください。</p>
          </div>
          <span :class="showGuideline ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"></span>
        </button>
        <div v-if="showGuideline" class="accordion-body">
          <ul class="ios-guideline">
            <li>キャンセルは開催前日までにご連絡ください。</li>
            <li>入力いただいた情報は主催コミュニティ間でのみ共有されます。</li>
            <li>次の画面で内容を確認後、必要な場合は決済へ進みます。</li>
          </ul>
        </div>
      </article>

      <section class="consent-line">
        申し込みを確定すると、利用規約・プライバシーに同意したものとみなされます。
        <button type="button" class="inline-link">プライバシー</button>
      </section>

      <p v-if="registrationError" class="ios-error">{{ registrationError }}</p>

      <div class="mobile-register__spacer"></div>
    </section>

    <nav class="ios-tabbar">
      <button
        type="button"
        class="rails-cta"
        :class="{ 'is-disabled': isCtaDisabled }"
        :disabled="isCtaDisabled"
        @click="proceedToCheckout"
      >
        <span class="i-lucide-check-circle"></span>
        {{ ctaLabel }}
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { isAxiosError } from 'axios';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { createRegistration, fetchEventById } from '../../api/client';
import type { EventDetail, RegistrationFormField } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import { useAuth } from '../../composables/useAuth';
import {
  MOBILE_EVENT_REGISTRATION_DRAFT_KEY,
  MOBILE_EVENT_SUCCESS_KEY,
} from '../../constants/mobile';
import { useLocale } from '../../composables/useLocale';
import ConsoleTopBar from '../../components/console/ConsoleTopBar.vue';

const props = defineProps<{ eventId?: string }>();
const route = useRoute();
const router = useRouter();
const { user } = useAuth();
const { preferredLangs } = useLocale();

const event = ref<EventDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const registrationError = ref<string | null>(null);
const submittingInline = ref(false);
const showGuideline = ref(false);

const formValues = reactive<Record<string, any>>({});
const fieldErrors = reactive<Record<string, string | null>>({});

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
    return '提交失败，请稍后再试';
  }
  if (err instanceof Error) {
    return '提交失败，请稍后再试';
  }
  return fallback;
};

const detail = computed(() => {
  if (!event.value) return null;
  const start = formatDate(event.value.startTime);
  const end = event.value.endTime ? formatDate(event.value.endTime) : '未定';
  return {
    id: event.value.id,
    title: getLocalizedText(event.value.title, preferredLangs.value),
    timeText: `${start} 〜 ${end}`,
    locationText: event.value.locationText || '場所未定',
    priceText: event.value.config?.priceText ?? derivePriceText(event.value),
  };
});

const formFields = computed<RegistrationFormField[]>(() => (event.value?.registrationFormSchema as RegistrationFormField[]) ?? []);
const defaultTicketId = computed(() => {
  if (!event.value?.ticketTypes?.length) return null;
  const freeTicket = event.value.ticketTypes.find((ticket) => (ticket.price ?? 0) === 0);
  return freeTicket?.id ?? event.value.ticketTypes[0].id;
});
const selectedTicket = computed(() => {
  if (!event.value?.ticketTypes?.length) return null;
  const targetId = defaultTicketId.value;
  const ticket = event.value.ticketTypes.find((entry) => entry.id === targetId) ?? event.value.ticketTypes[0];
  return {
    name: ticket.name ? getLocalizedText(ticket.name, preferredLangs.value) : '参加チケット',
    price: ticket.price ?? 0,
  };
});
const requiresPayment = computed(() =>
  event.value?.ticketTypes?.some((ticket) => (ticket.price ?? 0) > 0 && ticket.type !== 'free') ?? false,
);
const registrationUnavailableReason = computed(() => {
  if (!event.value) return null;
  if (event.value.status !== 'open') {
    return '現在このイベントは申込受付を行っていません。';
  }
  if (event.value.visibility && !['public', 'community-only'].includes(event.value.visibility)) {
    return '公開範囲の制限により申し込みできません。';
  }
  return null;
});
const ctaLabel = computed(() => {
  if (registrationUnavailableReason.value) return '受付終了';
  if (submittingInline.value) return '処理中…';
  return requiresPayment.value ? '申し込みを確定する' : '無料で申し込む';
});
const isCtaDisabled = computed(
  () => Boolean(registrationUnavailableReason.value) || submittingInline.value,
);

type SuccessPayload = {
  eventId: string;
  title: string;
  timeText: string;
  locationText: string;
  priceText?: string;
  ticketName?: string;
  amount?: number | null;
  paymentStatus: 'free' | 'paid';
  holdExpiresAt: string;
};

const HOLD_DURATION_MS = 30 * 60 * 1000;

const buildSuccessPayload = (status: 'free' | 'paid'): SuccessPayload | null => {
  if (!detail.value) return null;
  return {
    eventId: detail.value.id,
    title: detail.value.title,
    timeText: detail.value.timeText,
    locationText: detail.value.locationText,
    priceText: detail.value.priceText,
    ticketName: selectedTicket.value?.name,
    amount: selectedTicket.value?.price ?? null,
    paymentStatus: status,
    holdExpiresAt: status === 'paid' ? new Date(Date.now() + HOLD_DURATION_MS).toISOString() : new Date().toISOString(),
  };
};

const goToSuccessPage = (payload: SuccessPayload) => {
  sessionStorage.setItem(MOBILE_EVENT_SUCCESS_KEY, JSON.stringify(payload));
  router.replace({ name: 'MobileEventSuccess', params: { eventId: payload.eventId } });
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
    initializeFormValues();
    applyDraftAnswers();
  } catch (err) {
    error.value = '活动信息加载失败，请稍后再试';
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

onMounted(() => {
  if (!user.value) {
    router.replace({ name: 'organizer-apply', query: { redirect: route.fullPath } });
    return;
  }
  loadEvent();
});

const initializeFormValues = () => {
  Object.keys(formValues).forEach((key) => delete formValues[key]);
  Object.keys(fieldErrors).forEach((key) => delete fieldErrors[key]);
  formFields.value.forEach((field, index) => {
    const key = fieldKey(field, index);
    if (field.type === 'checkbox') {
      formValues[key] = false;
    } else if (field.type === 'multiChoice') {
      formValues[key] = [];
    } else {
      formValues[key] = '';
    }
    fieldErrors[key] = null;
  });
};

const applyDraftAnswers = () => {
  try {
    const raw = sessionStorage.getItem(MOBILE_EVENT_REGISTRATION_DRAFT_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (stored?.eventId !== eventId.value || !stored?.answers) return;
    formFields.value.forEach((field, index) => {
      const key = fieldKey(field, index);
      if (stored.answers[key] !== undefined) {
        formValues[key] = stored.answers[key];
      }
    });
  } catch {
    // ignore parse errors
  }
};

const proceedToCheckout = () => {
  if (registrationUnavailableReason.value) {
    registrationError.value = registrationUnavailableReason.value;
    return;
  }
  if (!validateForm()) return;
  if (!requiresPayment.value) {
    submitFreeRegistration();
    return;
  }
  const payload = {
    eventId: eventId.value,
    answers: { ...formValues },
    savedAt: Date.now(),
  };
  sessionStorage.setItem(MOBILE_EVENT_REGISTRATION_DRAFT_KEY, JSON.stringify(payload));
  router.push({ name: 'MobileEventCheckout', params: { eventId: eventId.value } });
};

const submitFreeRegistration = async () => {
  if (!eventId.value) return;
  if (registrationUnavailableReason.value) {
    registrationError.value = registrationUnavailableReason.value;
    return;
  }
  submittingInline.value = true;
  registrationError.value = null;
  try {
    await createRegistration(eventId.value, {
      ticketTypeId: defaultTicketId.value ?? undefined,
      formAnswers: { ...formValues },
    });
    sessionStorage.removeItem(MOBILE_EVENT_REGISTRATION_DRAFT_KEY);
    const payload = buildSuccessPayload('free');
    if (payload) {
      goToSuccessPage(payload);
    }
  } catch (err) {
    registrationError.value = '报名失败，请稍后再试';
  } finally {
    submittingInline.value = false;
  }
};

const validateForm = () => {
  registrationError.value = null;
  let valid = true;
  formFields.value.forEach((field, index) => {
    const key = fieldKey(field, index);
    const value = formValues[key];
    fieldErrors[key] = null;
    if (!field.required) return;
    if (field.type === 'multiChoice') {
      if (!Array.isArray(value) || !value.length) {
        fieldErrors[key] = `${field.label} を入力してください`;
        valid = false;
      }
    } else if (field.type === 'checkbox') {
      if (!value) {
        fieldErrors[key] = `${field.label} を入力してください`;
        valid = false;
      }
    } else if (!value) {
      fieldErrors[key] = `${field.label} を入力してください`;
      valid = false;
    }
  });
  return valid;
};

const fieldKey = (field: RegistrationFormField, index: number) => field.id ?? `${field.label ?? 'field'}-${index}`;
const getOptions = (field: RegistrationFormField) => (Array.isArray(field.options) ? field.options : []);

const toggleMulti = (field: RegistrationFormField, index: number, option: string, checked: boolean) => {
  const key = fieldKey(field, index);
  if (!Array.isArray(formValues[key])) {
    formValues[key] = [];
  }
  if (checked) {
    if (!formValues[key].includes(option)) {
      formValues[key].push(option);
    }
  } else {
    formValues[key] = formValues[key].filter((value: string) => value !== option);
  }
};

const inputType = (type: string) => {
  switch (type) {
    case 'email':
      return 'email';
    case 'phone':
      return 'tel';
    case 'number':
      return 'number';
    case 'date':
      return 'date';
    default:
      return 'text';
  }
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
.mobile-register {
  background: #f8fafc;
  min-height: 100vh;
}

.mobile-register p,
.mobile-register h1,
.mobile-register h2,
.mobile-register h3 {
  text-align: left;
}

.topbar {
  margin-left: calc(-16px - env(safe-area-inset-left, 0px));
  margin-right: calc(-16px - env(safe-area-inset-right, 0px));
  margin-top: calc(-8px - env(safe-area-inset-top, 0px));
}

.register-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px 8px;
}

.back-button {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: #fff;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
}

.header-label {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.register-body {
  padding: 24px 16px 90px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.summary-card {
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(14, 165, 233, 0.08));
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-title-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  justify-content: space-between;
}

.summary-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.3;
}

.summary-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #475569;
  font-size: 13px;
}

.summary-time,
.summary-location {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}

.price-chip {
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 999px;
  background: #0ea5e9;
  color: #fff;
  font-weight: 700;
  font-size: 12px;
}

.price-chip--ghost {
  background: #e2e8f0;
  color: #0f172a;
}

.ticket-line {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
}

.line-label {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.line-value {
  margin: 2px 0 0;
  font-weight: 600;
  color: #0f172a;
}

.form-panel {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-label {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.badge {
  padding: 4px 10px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #0f172a;
  font-size: 12px;
}

.ios-section {
  border-top: 1px solid rgba(15, 23, 42, 0.06);
}

.ios-row {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
}

.ios-row:last-child {
  border-bottom: none;
}

.ios-label {
  flex: 0 0 110px;
  font-weight: 600;
  font-size: 14px;
  color: #0f172a;
}

.ios-label .required {
  margin-left: 4px;
  color: #e11d48;
}

.ios-input {
  flex: 1;
  font-size: 14px;
  color: #0f172a;
}

.ios-input-control {
  width: 100%;
  border: none;
  padding: 0;
  font-size: 14px;
  background: transparent;
  color: #0f172a;
  font-family: inherit;
}

.ios-input-control:focus {
  outline: none;
}

.ios-choice,
.ios-checkbox {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ios-choice label,
.ios-checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #0f172a;
}

.ios-field-error {
  margin-top: 6px;
  font-size: 12px;
  color: #dc2626;
}

.accordion {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
}

.accordion-head {
  width: 100%;
  border: none;
  background: transparent;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.accordion-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.accordion-summary {
  margin: 2px 0 0;
  font-size: 12px;
  color: #64748b;
}

.accordion-body {
  border-top: 1px solid rgba(15, 23, 42, 0.06);
  padding: 10px 12px 12px;
}

.ios-guideline {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
}

.consent-line {
  font-size: 12px;
  color: #475569;
  line-height: 1.5;
}

.inline-link {
  border: none;
  background: transparent;
  color: #0ea5e9;
  font-weight: 600;
  padding: 0 4px;
}

.ios-error {
  font-size: 13px;
  color: #dc2626;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(220, 38, 38, 0.08);
}

.ios-notice {
  font-size: 13px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(37, 99, 235, 0.08);
  color: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(37, 99, 235, 0.2);
}

.mobile-register__spacer {
  height: 80px;
}

.ios-tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  padding: 10px 16px calc(env(safe-area-inset-bottom, 0px) + 10px);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 -8px 30px rgba(15, 23, 42, 0.1);
}

.rails-cta {
  width: 100%;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #0ea5e9, #22c55e);
  color: #fff;
  padding: 14px;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.rails-cta.is-disabled {
  opacity: 0.6;
}

.state-card {
  margin: 24px 16px;
  padding: 18px;
  border-radius: 14px;
  background: #fff;
  color: #0f172a;
  text-align: center;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
}

.state-card--error {
  border: 1px solid rgba(220, 38, 38, 0.25);
}

.retry-btn {
  margin-top: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  border: none;
  background: #0ea5e9;
  color: #fff;
  font-weight: 700;
}

.register-skeleton {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-hero,
.skeleton-card {
  border-radius: 14px;
  background: #e2e8f0;
  height: 120px;
}

.skeleton-card {
  height: 80px;
}

.shimmer {
  background: linear-gradient(90deg, #e2e8f0 25%, #f8fafc 50%, #e2e8f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.ios-placeholder {
  color: rgba(15, 23, 42, 0.5);
  font-size: 13px;
}
</style>
