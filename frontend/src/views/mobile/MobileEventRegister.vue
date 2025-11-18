<template>
  <div class="mobile-register">
    <header class="register-header">
      <button class="back-button" type="button" @click="router.back()">
        <span class="i-lucide-chevron-left text-lg"></span>
      </button>
      <div class="header-info">
        <p class="header-label">イベント申込</p>
        <h1>{{ detail?.title }}</h1>
      </div>
    </header>

    <section v-if="loading" class="state-card">読み込み中...</section>
    <section v-else-if="error" class="state-card state-card--error">
      {{ error }}
      <button @click="loadEvent">再試行</button>
    </section>

    <section v-else-if="detail" class="register-content">
      <div class="summary-card">
        <p class="summary-title">{{ detail.title }}</p>
        <p class="summary-time">{{ detail.timeText }}</p>
        <p class="summary-location">{{ detail.locationText }}</p>
        <p class="summary-price">{{ detail.priceText }}</p>
      </div>

      <div class="steps">
        <div class="step" :class="{ 'is-active': step === 1 }">1. 情報入力</div>
        <div class="step" :class="{ 'is-active': step === 2 }">2. 確認・決済</div>
      </div>

      <div v-if="step === 1" class="form-card">
        <p v-if="!formFields.length" class="form-hint">追加の入力は不要です。「次へ」をタップしてください。</p>
        <div v-else class="form-fields">
          <label v-for="(field, index) in formFields" :key="fieldKey(field, index)" class="field">
            <span class="field-label">
              {{ field.label }}
              <span v-if="field.required" class="required">*</span>
            </span>
            <template v-if="['text', 'email', 'phone', 'number', 'date'].includes(field.type)">
              <input
                :type="inputType(field.type)"
                class="field-input"
                :required="field.required"
                v-model="formValues[fieldKey(field, index)]"
              />
            </template>
            <textarea
              v-else-if="field.type === 'textarea'"
              rows="3"
              class="field-input"
              :required="field.required"
              v-model="formValues[fieldKey(field, index)]"
            ></textarea>
            <select
              v-else-if="field.type === 'select'"
              class="field-input"
              :required="field.required"
              v-model="formValues[fieldKey(field, index)]"
            >
              <option value="">選択してください</option>
              <option v-for="option in getOptions(field)" :key="option" :value="option">{{ option }}</option>
            </select>
            <div v-else-if="field.type === 'singleChoice'" class="choice-list">
              <label v-for="option in getOptions(field)" :key="option" class="choice-item">
                <input
                  type="radio"
                  :name="fieldKey(field, index)"
                  :value="option"
                  v-model="formValues[fieldKey(field, index)]"
                  :required="field.required"
                />
                <span>{{ option }}</span>
              </label>
            </div>
            <div v-else-if="field.type === 'multiChoice'" class="choice-list">
              <label v-for="option in getOptions(field)" :key="option" class="choice-item">
                <input
                  type="checkbox"
                  :checked="Array.isArray(formValues[fieldKey(field, index)]) && formValues[fieldKey(field, index)].includes(option)"
                  @change="toggleMulti(field, index, option, ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ option }}</span>
              </label>
            </div>
            <label v-else-if="field.type === 'checkbox'" class="checkbox-row">
              <input
                type="checkbox"
                :checked="Boolean(formValues[fieldKey(field, index)])"
                @change="formValues[fieldKey(field, index)] = ($event.target as HTMLInputElement).checked"
              />
              <span>{{ field.label }}</span>
            </label>
          </label>
        </div>
        <div class="form-actions">
          <Button variant="primary" size="lg" class="w-full justify-center" @click="goNextStep">
            次へ
          </Button>
        </div>
      </div>

      <div v-else class="confirm-card">
        <h2>入力内容の確認</h2>
        <ul class="confirm-list" v-if="formFields.length">
          <li v-for="(field, index) in formFields" :key="fieldKey(field, index)">
            <span class="confirm-label">{{ field.label }}</span>
            <span class="confirm-value">{{ displayValue(field, index) }}</span>
          </li>
        </ul>
        <p v-else class="form-hint">特別な入力はありません。</p>
        <div class="confirm-actions">
          <Button variant="ghost" size="md" class="flex-1 justify-center" @click="step = 1">戻る</Button>
          <Button variant="primary" size="md" class="flex-1 justify-center" :disabled="submitting" @click="submitRegistration">
            {{ submitting ? '送信中…' : '申込を確定' }}
          </Button>
        </div>

        <div class="payment-card" v-if="paymentMessage">
          <p>{{ paymentMessage }}</p>
          <div v-if="pendingPayment" class="payment-actions">
            <Button variant="primary" size="md" class="flex-1 justify-center" :disabled="isRedirecting" @click="handleStripeCheckout">
              {{ isRedirecting ? 'Stripeへ移動中…' : 'Stripeで支払う' }}
            </Button>
            <Button variant="outline" size="md" class="flex-1 justify-center" :disabled="isPaying" @click="handleMockPayment">
              {{ isPaying ? 'Mock 決済中…' : 'Mock 支払い（デモ）' }}
            </Button>
          </div>
        </div>
        <p v-if="registrationError" class="state-card state-card--error">{{ registrationError }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { createMockPayment, createRegistration, createStripeCheckout, fetchEventById } from '../../api/client';
import type { EventDetail, EventRegistrationSummary, RegistrationFormField } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import Button from '../../components/ui/Button.vue';
import { useAuth } from '../../composables/useAuth';

const route = useRoute();
const router = useRouter();
const { user } = useAuth();

const event = ref<EventDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const step = ref(1);
const formValues = reactive<Record<string, any>>({});
const submitting = ref(false);
const registrationError = ref<string | null>(null);
const pendingPayment = ref<{ registrationId: string; amount?: number } | null>(null);
const paymentMessage = ref<string | null>(null);
const isPaying = ref(false);
const isRedirecting = ref(false);

const eventId = computed(() => route.params.eventId as string);

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
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'イベント情報の取得に失敗しました';
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  if (!user.value) {
    router.replace({ name: 'organizer-apply', query: { redirect: route.fullPath } });
    return;
  }
  loadEvent();
});

const detail = computed(() => {
  if (!event.value) return null;
  const start = formatDate(event.value.startTime);
  const end = event.value.endTime ? formatDate(event.value.endTime) : '未定';
  return {
    id: event.value.id,
    title: getLocalizedText(event.value.title),
    timeText: `${start} 〜 ${end}`,
    locationText: event.value.locationText,
    priceText: event.value.config?.priceText ?? '無料 / 未定',
  };
});

const formFields = computed<RegistrationFormField[]>(() => (event.value?.registrationFormSchema as RegistrationFormField[]) ?? []);

const initializeFormValues = () => {
  Object.keys(formValues).forEach((key) => delete formValues[key]);
  formFields.value.forEach((field, index) => {
    const key = fieldKey(field, index);
    if (field.type === 'checkbox') {
      formValues[key] = false;
    } else if (field.type === 'multiChoice') {
      formValues[key] = [];
    } else {
      formValues[key] = '';
    }
  });
};

const goNextStep = () => {
  if (!validateForm()) return;
  step.value = 2;
};

const validateForm = () => {
  registrationError.value = null;
  for (let i = 0; i < formFields.value.length; i += 1) {
    const field = formFields.value[i];
    const key = fieldKey(field, i);
    const value = formValues[key];
    if (field.required) {
      if (field.type === 'multiChoice') {
        if (!Array.isArray(value) || !value.length) {
          registrationError.value = `${field.label} を入力してください`;
          return false;
        }
      } else if (!value) {
        registrationError.value = `${field.label} を入力してください`;
        return false;
      }
    }
  }
  return true;
};

const submitRegistration = async () => {
  if (!eventId.value) return;
  submitting.value = true;
  registrationError.value = null;
  try {
    const registration = await createRegistration(eventId.value, { formAnswers: { ...formValues } });
    handleRegistrationResult(registration);
  } catch (err) {
    registrationError.value = err instanceof Error ? err.message : '申込に失敗しました';
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
    paymentMessage.value = 'お支払いを完了すると参加が確定します。';
  } else {
    pendingPayment.value = null;
    paymentMessage.value = 'お申込みありがとうございます！このまま最新情報をお待ちください。';
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
  } catch (err) {
    registrationError.value = err instanceof Error ? err.message : '決済処理に失敗しました';
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

const displayValue = (field: RegistrationFormField, index: number) => {
  const value = formValues[fieldKey(field, index)];
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'はい' : 'いいえ';
  }
  return value || '未入力';
};

const formatDate = (value: string) =>
  new Date(value).toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
</script>

<style scoped>
.mobile-register {
  min-height: 100vh;
  background: var(--m-color-bg, #f5f7fb);
  display: flex;
  flex-direction: column;
}

.register-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px 12px;
  background: #fff;
  border-bottom: 1px solid rgba(15, 23, 42, 0.05);
}

.back-button {
  border: none;
  background: rgba(15, 23, 42, 0.05);
  border-radius: 12px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-info h1 {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--m-color-text-primary);
}

.header-label {
  font-size: 12px;
  color: var(--m-color-text-tertiary);
  margin: 0;
}

.register-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.summary-card {
  background: #fff;
  border-radius: 18px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.summary-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.summary-time,
.summary-location,
.summary-price {
  margin: 0;
  font-size: 13px;
  color: var(--m-color-text-secondary);
}

.steps {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.step {
  border-radius: 999px;
  padding: 10px 12px;
  font-size: 13px;
  text-align: center;
  font-weight: 600;
  background: rgba(15, 23, 42, 0.05);
  color: var(--m-color-text-tertiary);
}

.step.is-active {
  background: #0090d9;
  color: #fff;
  box-shadow: 0 10px 24px rgba(0, 144, 217, 0.28);
}
.form-card,
.form-card,
.confirm-card {
  background: #fff;
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--m-color-text-primary);
}

.required {
  color: #ef4444;
  margin-left: 4px;
}

.field-input {
  margin-top: 6px;
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  padding: 10px 12px;
  font-size: 14px;
}

.choice-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.choice-item {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  padding: 8px 10px;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.form-actions {
  margin-top: 8px;
}

.form-hint {
  font-size: 13px;
  color: var(--m-color-text-tertiary);
  margin: 0;
}

.confirm-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirm-label {
  font-size: 12px;
  color: var(--m-color-text-tertiary);
}

.confirm-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--m-color-text-primary);
}

.confirm-actions {
  display: flex;
  gap: 8px;
}

.payment-card {
  margin-top: 12px;
  border-radius: 18px;
  background: #fff9eb;
  color: #92400e;
  padding: 14px;
  font-size: 13px;
}

.payment-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.state-card {
  border-radius: 16px;
  padding: 1rem;
  margin: 16px;
  background: #e2e8f0;
  font-size: 0.9rem;
  color: #475569;
}

.state-card--error {
  background: #fee2e2;
  color: #b91c1c;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.state-card--error button {
  border: none;
  background: transparent;
  font-weight: 600;
  color: inherit;
  text-decoration: underline;
}
</style>
