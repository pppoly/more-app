<template>
  <div class="relative min-h-screen bg-[#F7F9FB] pb-20">
    <header
      class="fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-3 z-20 text-white bg-gradient-to-b from-black/40 to-transparent"
    >
      <button class="w-8 h-8 flex items-center justify-center" @click="goBack">
        <span class="i-lucide-chevron-left text-lg"></span>
      </button>
      <div class="text-sm font-medium truncate">イベント詳細</div>
      <button class="w-8 h-8 flex items-center justify-center" @click="shareEvent">
        <span class="i-lucide-share-2 text-lg"></span>
      </button>
    </header>

    <div v-if="loading" class="pt-16 text-center text-slate-400">読み込み中...</div>
    <div v-else-if="error" class="pt-16 text-center text-rose-500">{{ error }}</div>
    <template v-else-if="detail">
      <div class="relative h-[260px] w-full bg-slate-200">
        <img v-if="detail.coverUrl" :src="detail.coverUrl" class="w-full h-full object-cover" alt="cover" />
        <div class="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
          <span class="px-2 py-0.5 text-[11px] rounded-full bg-white/80 text-slate-800">
            {{ detail.categoryLabel }}
          </span>
          <h1 class="mt-2 text-white text-lg font-semibold leading-tight line-clamp-2">
            {{ detail.title }}
          </h1>
        </div>
      </div>

      <div class="-mt-4 relative z-10 rounded-t-3xl bg-white p-4 min-h-[60vh]">
        <section class="mb-3">
          <h2 class="text-xs font-semibold text-slate-500 mb-1">日時</h2>
          <p class="text-sm text-slate-900">{{ detail.timeFullText }}</p>
        </section>

        <section class="mb-3">
          <h2 class="text-xs font-semibold text-slate-500 mb-1">場所</h2>
          <p class="text-sm text-slate-900">{{ detail.locationText }}</p>
          <button
            v-if="detail.mapUrl"
            class="mt-1 inline-flex items-center px-3 py-1 rounded-full border border-slate-200 text-[11px] text-slate-600"
            @click="openMap"
          >
            <span class="i-lucide-map-pin mr-1"></span>地図で開く
          </button>
        </section>

        <section class="mb-3">
          <h2 class="text-xs font-semibold text-slate-500 mb-1">申込状況</h2>
          <div class="flex items-center justify-between text-[11px] text-slate-500 mb-1">
            <span>{{ detail.regSummary }}</span>
            <span class="text-slate-400">{{ detail.capacityText }}</span>
          </div>
          <div class="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full bg-[#00B900]" :style="{ width: detail.regProgress + '%' }"></div>
          </div>
        </section>

        <section v-if="formFields.length" class="mb-3">
          <div class="p-3 rounded-2xl bg-slate-50">
            <p class="text-xs font-semibold text-slate-700 mb-1">申込時に入力が必要な情報</p>
            <ul class="text-[11px] text-slate-600 space-y-0.5">
              <li v-for="(field, idx) in formFields" :key="fieldKey(field, idx)">・{{ field.label }}</li>
            </ul>
          </div>
        </section>

        <section class="mt-4">
          <h2 class="text-xs font-semibold text-slate-500 mb-1">イベント説明</h2>
          <div class="prose prose-sm max-w-none text-slate-800" v-html="detail.descriptionHtml"></div>
        </section>

        <section v-if="paymentMessage" class="mt-4">
          <div class="p-3 rounded-2xl bg-amber-50 text-xs text-slate-700 space-y-2">
            <p>{{ paymentMessage }}</p>
            <div v-if="pendingPayment" class="flex flex-col gap-2">
              <button
                class="w-full px-3 py-1.5 rounded-full text-sm font-medium bg-[#00B900] text-white disabled:bg-slate-300"
                @click="handleStripeCheckout"
                :disabled="isRedirecting"
              >
                {{ isRedirecting ? 'Stripeへ移動中…' : 'Stripeで支払う' }}
              </button>
              <button
                class="w-full px-3 py-1.5 rounded-full text-sm border border-slate-200"
                @click="handleMockPayment"
                :disabled="isPaying"
              >
                {{ isPaying ? 'Mock 決済中…' : 'Mock 支払い（デモ）' }}
              </button>
            </div>
          </div>
        </section>

        <p v-if="registrationError" class="text-xs text-rose-500 mt-3">{{ registrationError }}</p>
      </div>

      <div class="fixed bottom-0 left-0 right-0 border-t bg-white px-3 py-2 flex items-center justify-between">
        <div class="flex flex-col text-xs">
          <span class="font-semibold text-slate-900">{{ detail.priceText }}</span>
          <span class="text-[11px] text-slate-400">{{ detail.statusLabel }}・{{ detail.regSummary }}</span>
        </div>
        <button
          class="px-4 py-2 rounded-full text-sm font-semibold text-white bg-[#00B900] disabled:bg-slate-300"
          @click="openBookingSheet"
          :disabled="detail.status !== 'open'"
        >
          {{ detail.status === 'open' ? '参加する' : '受付終了' }}
        </button>
      </div>

      <div v-if="showBooking" class="fixed inset-0 bg-black/40 flex items-end z-50" @click.self="closeBookingSheet">
        <div class="w-full bg-white rounded-t-2xl max-h-[80vh] p-4 overflow-y-auto">
          <div class="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3"></div>
          <h2 class="text-sm font-semibold mb-2">申込情報</h2>

          <div class="space-y-3">
            <label v-for="(field, index) in formFields" :key="fieldKey(field, index)" class="flex flex-col gap-1 text-xs">
              <span class="text-slate-600">{{ field.label }}</span>
              <template v-if="['text', 'email', 'phone', 'number', 'date'].includes(field.type)">
                <input
                  :type="inputType(field.type)"
                  class="px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  :required="field.required"
                  v-model="formValues[fieldKey(field, index)]"
                />
              </template>
              <textarea
                v-else-if="field.type === 'textarea'"
                rows="3"
                class="px-3 py-2 rounded-xl border border-slate-200 text-sm"
                :required="field.required"
                v-model="formValues[fieldKey(field, index)]"
              ></textarea>
              <select
                v-else-if="field.type === 'select'"
                class="px-3 py-2 rounded-xl border border-slate-200 text-sm"
                :required="field.required"
                v-model="formValues[fieldKey(field, index)]"
              >
                <option value="">選択してください</option>
                <option v-for="option in getOptions(field)" :key="option" :value="option">{{ option }}</option>
              </select>
              <div v-else-if="field.type === 'singleChoice'" class="flex flex-col gap-1">
                <label
                  v-for="option in getOptions(field)"
                  :key="option"
                  class="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2"
                >
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
              <div v-else-if="field.type === 'multiChoice'" class="flex flex-col gap-1">
                <label
                  v-for="option in getOptions(field)"
                  :key="option"
                  class="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2"
                >
                  <input
                    type="checkbox"
                    :checked="Array.isArray(formValues[fieldKey(field, index)]) && formValues[fieldKey(field, index)].includes(option)"
                    @change="toggleMulti(field, index, option, ($event.target as HTMLInputElement).checked)"
                  />
                  <span>{{ option }}</span>
                </label>
              </div>
              <label v-else-if="field.type === 'checkbox'" class="flex items-center gap-2">
                <input
                  type="checkbox"
                  :checked="Boolean(formValues[fieldKey(field, index)])"
                  @change="formValues[fieldKey(field, index)] = ($event.target as HTMLInputElement).checked"
                />
                <span>{{ field.label }}</span>
              </label>
            </label>
          </div>

          <label class="flex items-center text-xs text-slate-500 mt-4">
            <input type="checkbox" v-model="agree" class="mr-2" />
            利用規約とリスク説明に同意します
          </label>

          <div class="mt-4 flex items-center justify-between">
            <button class="px-4 py-2 text-sm border border-slate-200 rounded-full" @click="closeBookingSheet">閉じる</button>
            <button
              class="px-4 py-2 rounded-full text-sm font-semibold text-white bg-[#00B900] disabled:bg-slate-300"
              :disabled="!agree || submitting"
              @click="submitBooking"
            >
              {{ submitting ? '送信中…' : '確認して申込' }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  createMockPayment,
  createRegistration,
  createStripeCheckout,
  fetchEventById,
  fetchEventGallery,
} from '../../api/client';
import type {
  EventDetail,
  EventGalleryItem,
  EventRegistrationSummary,
  RegistrationFormField,
} from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import { useAuth } from '../../composables/useAuth';

const route = useRoute();
const router = useRouter();
const { user } = useAuth();

const event = ref<EventDetail | null>(null);
const gallery = ref<EventGalleryItem[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const registrationError = ref<string | null>(null);
const showBooking = ref(false);
const agree = ref(false);
const submitting = ref(false);
const pendingPayment = ref<{ registrationId: string; amount?: number } | null>(null);
const paymentMessage = ref<string | null>(null);
const isPaying = ref(false);
const isRedirecting = ref(false);
const formValues = reactive<Record<string, any>>({});

const eventId = computed(() => route.params.eventId as string);
const isLoggedIn = computed(() => Boolean(user.value));

const formFields = computed<RegistrationFormField[]>(() => (event.value?.registrationFormSchema as RegistrationFormField[]) ?? []);

const detail = computed(() => {
  if (!event.value) return null;
  const start = formatDate(event.value.startTime);
  const end = event.value.endTime ? formatDate(event.value.endTime) : '未定';
  return {
    id: event.value.id,
    status: event.value.status,
    statusLabel: event.value.status === 'open' ? '受付中' : '受付終了',
    title: getLocalizedText(event.value.title),
    categoryLabel: event.value.category ?? 'イベント',
    timeFullText: `${start} 〜 ${end}`,
    locationText: event.value.locationText,
    coverUrl: gallery.value[0]?.imageUrl ?? 'https://placehold.co/640x360?text=Event',
    regSummary: event.value.config?.regSummary ?? '参加状況を確認中',
    capacityText: event.value.maxParticipants ? `定員 ${event.value.maxParticipants}名` : '定員未設定',
    regProgress: event.value.config?.regProgress ?? 40,
    priceText: event.value.config?.priceText ?? '無料 / 未定',
    descriptionHtml:
      event.value.descriptionHtml ??
      `<p>${getLocalizedText(event.value.description ?? event.value.title)}</p>`,
    mapUrl:
      typeof event.value.locationLat === 'number' && typeof event.value.locationLng === 'number'
        ? `https://www.google.com/maps/dir/?api=1&destination=${event.value.locationLat},${event.value.locationLng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.value.locationText)}`,
  };
});

const loadEvent = async () => {
  if (!eventId.value) return;
  loading.value = true;
  error.value = null;
  try {
    const [detailData, galleryData] = await Promise.all([fetchEventById(eventId.value), fetchEventGallery(eventId.value)]);
    event.value = detailData;
    gallery.value = galleryData;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'イベント情報の取得に失敗しました';
  } finally {
    loading.value = false;
  }
};

const goBack = () => {
  router.back();
};

const shareEvent = () => {
  if (navigator.share && detail.value) {
    navigator.share({ title: detail.value.title, url: window.location.href }).catch(() => undefined);
  }
};

const openMap = () => {
  if (detail.value?.mapUrl) {
    window.open(detail.value.mapUrl, '_blank');
  }
};

const openBookingSheet = () => {
  if (!detail.value) return;
  if (!isLoggedIn.value) {
    registrationError.value = 'ログインしてください';
    return;
  }
  initializeFormValues();
  agree.value = false;
  showBooking.value = true;
};

const closeBookingSheet = () => {
  if (!submitting.value) {
    showBooking.value = false;
  }
};

const submitBooking = async () => {
  if (!eventId.value) return;
  submitting.value = true;
  registrationError.value = null;
  try {
    const registration = await createRegistration(eventId.value, { formAnswers: { ...formValues } });
    handleRegistrationResult(registration);
    showBooking.value = false;
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
    paymentMessage.value = 'お申込みありがとうございます！';
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
  new Date(value).toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

onMounted(loadEvent);
</script>
