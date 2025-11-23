<template>
  <div class="mobile-register">
    <header class="register-header">
      <button class="back-button" type="button" @click="router.back()">
        <span class="i-lucide-chevron-left text-lg"></span>
      </button>
      <div class="header-info">
        <p class="header-label">イベント申込</p>
        <h1>{{ detail?.title ?? '読み込み中…' }}</h1>
      </div>
    </header>

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
      <article class="hero-card">
        <p class="hero-label">対象イベント</p>
        <h2 class="hero-title">{{ detail.title }}</h2>
        <p class="hero-meta">{{ detail.timeText }}</p>
        <p class="hero-meta">{{ detail.locationText }}</p>
        <p class="hero-price">{{ detail.priceText }}</p>
      </article>

      <p v-if="registrationUnavailableReason" class="ios-notice">
        {{ registrationUnavailableReason }}
      </p>

      <article class="ios-panel">
        <header class="panel-head">
          <div>
            <p class="panel-label">参加者情報</p>
          </div>
          <span class="badge">{{ formFields.length ? `${formFields.length}項目` : '入力不要' }}</span>
        </header>
        <div v-if="formFields.length" class="ios-section">
          <div v-for="(field, index) in formFields" :key="fieldKey(field, index)" class="ios-row">
            <div class="ios-label">
              {{ field.label }}
              <span v-if="field.required" class="required">*</span>
            </div>
            <div class="ios-input">
              <template v-if="['text', 'email', 'phone', 'number', 'date'].includes(field.type)">
                <input
                  :type="inputType(field.type)"
                  :placeholder="field.placeholder || '请输入...'"
                  v-model="formValues[fieldKey(field, index)]"
                  class="ios-input-control"
                />
              </template>
              <textarea
                v-else-if="field.type === 'textarea'"
                rows="3"
                :placeholder="field.placeholder || '请输入...'"
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
        <div class="ios-consent">
          <p v-if="formFields.length === 0">このイベントでは追加情報の入力は必要ありません。</p>
          <p>
            お客様の個人情報は、日本の個人情報保護法およびSOCIALMOREのプライバシーポリシーに基づき適切に管理します。
            提供いただいた内容はイベント運営および緊急連絡の目的に限って利用されます。
          </p>
          <label class="ios-consent__row">
            <input type="checkbox" v-model="hasAgreedTerms" />
            <span>上記内容に同意し、個人情報の取扱いに同意します。</span>
          </label>
        </div>
      </article>

      <article class="ios-panel">
        <header class="panel-head">
          <div>
            <p class="panel-label">注意事項</p>
            <p class="panel-hint">申し込み前に必ずお読みください。</p>
          </div>
        </header>
        <ul class="ios-guideline">
          <li>キャンセルは開催前日までにご連絡ください。</li>
          <li>入力いただいた情報は主催コミュニティ間でのみ共有されます。</li>
          <li>次の画面で内容を確認後、決済（必要な場合）へ進みます。</li>
          <li>お客様の個人情報は日本の個人情報保護法に基づき厳重に管理されます。</li>
        </ul>
      </article>

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

const props = defineProps<{ eventId?: string }>();
const route = useRoute();
const router = useRouter();
const { user } = useAuth();
const { preferredLangs } = useLocale();

const event = ref<EventDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const registrationError = ref<string | null>(null);
const hasAgreedTerms = ref(false);
const submittingInline = ref(false);

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
  return requiresPayment.value ? '情報を確認' : '無料で申込む';
});
const isCtaDisabled = computed(
  () => Boolean(registrationUnavailableReason.value) || !hasAgreedTerms.value || submittingInline.value,
);

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

const buildSuccessPayload = (status: 'free' | 'paid'): SuccessPayload | null => {
  if (!detail.value) return null;
  return {
    eventId: detail.value.id,
    title: detail.value.title,
    timeText: detail.value.timeText,
    locationText: detail.value.locationText,
    priceText: detail.value.priceText,
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
  hasAgreedTerms.value = false;
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
  if (!hasAgreedTerms.value) {
    registrationError.value = '個人情報の取扱いに関する同意が必要です。';
    return;
  }
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

.register-header {
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

.register-body {
  padding: 0 16px 80px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hero-card {
  background: linear-gradient(135deg, #0f3057, #2ba7b4);
  color: #f0faff;
  border-radius: 24px;
  padding: 24px;
  box-shadow: 0 25px 45px rgba(15, 23, 42, 0.28);
  display: flex;
  flex-direction: column;
  gap: 10px;
  transform: translateY(0);
  animation: heroReveal 0.5s ease;
}

.hero-title {
  font-size: 24px;
  margin: 0;
  font-weight: 700;
  line-height: 1.3;
}

.hero-meta {
  margin: 0;
  font-size: 15px;
  letter-spacing: 0.01em;
  opacity: 0.95;
}

.hero-price {
  margin: 10px 0 0;
  font-size: 20px;
  font-weight: 700;
}

@keyframes heroReveal {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.ios-panel {
  background: #fff;
  border-radius: 20px;
  padding: 18px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
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

.badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  background: rgba(15, 23, 42, 0.05);
  color: rgba(15, 23, 42, 0.7);
}

.ios-section {
  border-top: 1px solid rgba(15, 23, 42, 0.05);
}

.ios-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid rgba(15, 23, 42, 0.05);
}

.ios-row:last-child {
  border-bottom: none;
}

.ios-label {
  flex: 0 0 120px;
  font-weight: 700;
  font-size: 16px;
  color: rgba(15, 23, 42, 0.95);
}

.ios-label .required {
  margin-left: 4px;
  color: #e11d48;
}

.ios-input {
  flex: 1;
  font-size: 15px;
  color: rgba(15, 23, 42, 0.9);
}

.ios-input-control {
  width: 100%;
  border: none;
  padding: 0;
  font-size: 15px;
  background: transparent;
  color: rgba(15, 23, 42, 0.95);
  font-family: inherit;
  text-align: right;
}

.ios-input-control:focus {
  outline: none;
}

.ios-input select {
  appearance: none;
}

.ios-choice {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ios-choice label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.ios-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ios-field-error {
  margin-top: 6px;
  font-size: 12px;
  color: #dc2626;
}

.ios-guideline {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: rgba(15, 23, 42, 0.75);
  line-height: 1.5;
}

.ios-consent {
  margin-top: 12px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.04);
  font-size: 13px;
  color: rgba(15, 23, 42, 0.75);
}

.ios-consent__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.ios-consent__row input {
  width: 18px;
  height: 18px;
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

.ios-actions {
  margin-top: 8px;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 80px);
}
.mobile-register__spacer {
  height: 140px;
}

.ios-tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 12px;
  padding: 12px 16px calc(env(safe-area-inset-bottom, 0px) + 18px);
  background: rgba(248, 250, 252, 0.95);
  box-shadow: 0 -12px 30px rgba(15, 23, 42, 0.15);
}

.rails-cta {
  flex: 1;
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

.rails-cta.is-disabled {
  background: #92d0f5;
  color: rgba(255, 255, 255, 0.8);
  box-shadow: none;
  transform: none;
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

.register-skeleton {
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
