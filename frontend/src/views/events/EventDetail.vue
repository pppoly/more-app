<template>
  <section class="detail-shell">
    <header class="detail-header">
      <button type="button" class="icon-btn" @click="goBack">←</button>
      <p>イベント詳細</p>
      <button type="button" class="icon-btn" @click="shareEvent">⋯</button>
    </header>

    <div v-if="loading" class="detail-skeleton">
      <div class="skeleton-hero shimmer"></div>
      <div class="skeleton-card shimmer"></div>
      <div class="skeleton-card shimmer"></div>
      <div class="skeleton-card skeleton-card--thin shimmer"></div>
    </div>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <template v-else-if="event">
      <div class="hero" v-if="heroImage">
        <img :src="heroImage" alt="cover" />
        <div class="hero-overlay">
          <p class="hero-title">{{ title }}</p>
          <p class="hero-sub">{{ event.community.name }}</p>
        </div>
        <div v-if="gallery.length > 1" class="hero-dots">
          <button
            v-for="(item, index) in gallery"
            :key="item.id"
            :class="['dot', { active: currentSlide === index }]"
            @click="currentSlide = index"
          ></button>
        </div>
      </div>

      <div class="info-card">
        <div class="card-header">
          <span v-if="eventCategoryLabel" class="category-chip">#{{ eventCategoryLabel }}</span>
          <p class="card-title">{{ title }}</p>
        </div>
        <div class="info-row">
          <span class="label">日時</span>
          <span class="info-row__value info-row__value--multiline">
            {{ formatDate(event.startTime) }} 〜 {{ event.endTime ? formatDate(event.endTime) : '未定' }}
          </span>
        </div>
        <div class="info-row">
          <span class="label">場所</span>
          <span class="info-row__value">
            <button v-if="mapUrl" type="button" class="location-link" @click="openMap">
              {{ event.locationText }}
            </button>
            <span v-else>{{ event.locationText }}</span>
          </span>
        </div>
        <div class="info-row">
          <span class="label">受付期間</span>
          <span>{{ formatDate(event.regStartTime ?? event.startTime) }} 〜 {{ formatDate(event.regEndTime ?? event.startTime) }}</span>
        </div>
        <div class="info-row">
          <span class="label">ステータス</span>
          <span class="status-pill" :class="statusPill.variant">
            {{ statusPill.label }}
          </span>
        </div>
      </div>

      <div class="info-card">
        <h3>イベント概要</h3>
        <p>{{ description }}</p>
        <div v-if="event.descriptionHtml" class="rich" v-html="event.descriptionHtml"></div>
      </div>

      <div class="info-card" v-if="event.config">
        <h3>参加ルール</h3>
        <ul>
          <li v-if="event.config.requireCheckin">✔ チェックイン必須</li>
          <li v-if="event.config.enableWaitlist">✔ キャンセル待ちあり</li>
          <li v-if="refundPolicyText">返金: {{ refundPolicyText }}</li>
          <li v-if="event.config.riskNoticeEnabled">⚠️ 注意事項をご確認ください。</li>
        </ul>
      </div>

      <p v-if="paymentMessage" class="status info">{{ paymentMessage }}</p>
      <div v-if="pendingPayment" class="info-card payment-card">
        <p>支払額: ¥{{ pendingPayment.amount ?? 0 }}</p>
        <div class="payment-actions">
          <button type="button" class="primary" @click="handleStripeCheckout" :disabled="isRedirecting">
            {{ isRedirecting ? 'Stripeへ移動中...' : 'Stripeで支払う' }}
          </button>
          <button type="button" class="secondary" @click="handleMockPayment" :disabled="isPaying">
            {{ isPaying ? 'Mock 決済中...' : 'Mock 支払い（デモ）' }}
          </button>
        </div>
      </div>
      <p v-if="registrationError" class="status error">{{ registrationError }}</p>
    </template>

    <p v-else class="status">イベントが見つかりません。</p>

    <div class="bottom-bar" v-if="event">
      <div class="price-block">
        <p class="price-label">{{ isLoggedIn ? '参加費' : 'ログインが必要です' }}</p>
        <p class="price-value">{{ priceHint }}</p>
      </div>
      <button type="button" class="cta-btn" :disabled="ctaDisabled" @click="startRegistration">
        {{ ctaLabel }}
      </button>
    </div>

    <!-- Dynamic registration modal -->
    <div v-if="showFormModal" class="modal-backdrop" @click.self="closeFormModal">
      <div class="modal">
        <header>
          <h3>参加申込フォーム</h3>
          <button type="button" class="close" @click="closeFormModal">×</button>
        </header>
        <form @submit.prevent="submitDynamicForm" class="dynamic-form">
          <div v-for="(field, index) in formFields" :key="fieldKey(field, index)">
            <label v-if="['text','email','phone','number','date'].includes(field.type)">
              {{ field.label }}
              <input
                :type="inputType(field.type)"
                :required="field.required"
                :placeholder="field.placeholder"
                v-model="formAnswers[fieldKey(field, index)]"
              />
            </label>
            <label v-else-if="field.type === 'textarea'">
              {{ field.label }}
              <textarea
                :required="field.required"
                :placeholder="field.placeholder"
                v-model="formAnswers[fieldKey(field, index)]"
              ></textarea>
            </label>
            <label v-else-if="field.type === 'select'">
              {{ field.label }}
              <select v-model="formAnswers[fieldKey(field, index)]" :required="field.required">
                <option value="" disabled>選択してください</option>
                <option v-for="option in getOptions(field)" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>
            <div v-else-if="field.type === 'singleChoice'" class="choice-group">
              <p>{{ field.label }}</p>
              <label v-for="option in getOptions(field)" :key="option" class="inline">
                <input
                  type="radio"
                  :name="fieldKey(field, index)"
                  :value="option"
                  v-model="formAnswers[fieldKey(field, index)]"
                  :required="field.required"
                />
                {{ option }}
              </label>
            </div>
            <div v-else-if="field.type === 'multiChoice'" class="choice-group">
              <p>{{ field.label }}</p>
              <label v-for="option in getOptions(field)" :key="option" class="inline">
                <input
                  type="checkbox"
                  :value="option"
                  :checked="Array.isArray(formAnswers[fieldKey(field, index)]) && formAnswers[fieldKey(field, index)].includes(option)"
                  @change="toggleMulti(field, index, option, Boolean(($event.target as HTMLInputElement | null)?.checked))"
                />
                {{ option }}
              </label>
            </div>
            <label v-else-if="field.type === 'checkbox'" class="inline">
              <input
                type="checkbox"
                :checked="Boolean(formAnswers[fieldKey(field, index)])"
                @change="formAnswers[fieldKey(field, index)] = Boolean(($event.target as HTMLInputElement | null)?.checked)"
              />
              {{ field.label }}
            </label>
          </div>
          <footer>
            <button type="button" class="secondary" @click="closeFormModal">キャンセル</button>
            <button type="submit" class="primary" :disabled="isRegistering">
              {{ isRegistering ? '送信中...' : '送信' }}
            </button>
          </footer>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  createMockPayment,
  createRegistration,
  createStripeCheckout,
  fetchEventById,
  fetchEventGallery,
  fetchMyEvents,
} from '../../api/client';
import type { EventDetail, EventRegistrationSummary, RegistrationFormField, EventGalleryItem } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import { getEventCategoryLabel } from '../../utils/eventCategory';
import { resolveRefundPolicyText } from '../../utils/refundPolicy';
import { useAuth } from '../../composables/useAuth';
import { MOBILE_EVENT_PENDING_PAYMENT_KEY } from '../../constants/mobile';

const route = useRoute();
const router = useRouter();
const eventId = computed(() => route.params.eventId as string);
const event = ref<EventDetail | null>(null);
const gallery = ref<EventGalleryItem[]>([]);
const currentSlide = ref(0);
const loading = ref(true);
const error = ref<string | null>(null);
const isRegistering = ref(false);
const hasRegistered = ref(false);
const registrationError = ref<string | null>(null);
const pendingPayment = ref<{ registrationId: string; amount?: number } | null>(null);
const pendingApproval = ref(false);
const isPaying = ref(false);
const isRedirecting = ref(false);
const paymentMessage = ref<string | null>(null);
const showFormModal = ref(false);
const formAnswers = reactive<Record<string, any>>({});
const eventCategoryLabel = computed(() =>
  event.value?.category ? getEventCategoryLabel(event.value.category) : '',
);
const refundPolicyText = computed(() =>
  resolveRefundPolicyText((event.value?.config as Record<string, any>) ?? null),
);

const auth = useAuth();
const isLoggedIn = computed(() => Boolean(auth.user.value));

const requiresApproval = computed(() => {
  if (!event.value) return false;
  const config = (event.value.config as Record<string, any>) ?? {};
  return Boolean(event.value.requireApproval ?? config.requireApproval);
});

const capacityState = computed(() => {
  if (!event.value) {
    return { capacity: null, currentParticipants: 0, enableWaitlist: false, isFull: false };
  }
  const config = (event.value.config as Record<string, any>) ?? {};
  const capacityRaw =
    typeof event.value.maxParticipants === 'number'
      ? event.value.maxParticipants
      : typeof config.capacity === 'number'
        ? config.capacity
        : typeof config.maxParticipants === 'number'
          ? config.maxParticipants
          : null;
  const capacity = typeof capacityRaw === 'number' && Number.isFinite(capacityRaw) ? capacityRaw : null;
  const currentRaw = config.currentParticipants ?? config.currentAttendees ?? config.regCount ?? 0;
  const currentParticipants = Number.isFinite(Number(currentRaw)) ? Number(currentRaw) : 0;
  const enableWaitlist = Boolean(config.enableWaitlist);
  const isFull = capacity !== null && capacity > 0 ? currentParticipants >= capacity : false;
  return { capacity, currentParticipants, enableWaitlist, isFull };
});

const eventLifecycle = computed(() => {
  if (!event.value) return 'scheduled';
  if (event.value.status === 'cancelled') return 'cancelled';
  const now = new Date();
  const start = new Date(event.value.startTime);
  const end = event.value.endTime ? new Date(event.value.endTime) : null;
  if (now < start) return 'scheduled';
  if (end && now > end) return 'ended';
  return 'ongoing';
});

const resolveRegistrationWindow = (ev: EventDetail | null) => {
  if (!ev) return { open: false, reason: null as string | null };
  if (ev.status !== 'open') return { open: false, reason: '現在このイベントは申込受付を行っていません。' };
  const now = new Date();
  const regStart = ev.regStartTime ? new Date(ev.regStartTime) : null;
  const regEndRaw = ev.regEndTime ?? ev.regDeadline ?? null;
  const regEnd = regEndRaw ? new Date(regEndRaw) : null;
  if (regStart && now < regStart) return { open: false, reason: '申込開始前です。' };
  if (regEnd && now > regEnd) return { open: false, reason: '申込受付は終了しました。' };
  return { open: true, reason: null };
};

const registrationWindowState = computed(() => resolveRegistrationWindow(event.value));

const registrationUnavailableReason = computed(() => {
  if (!event.value) return null;
  if (event.value.visibility && !['public', 'community-only'].includes(event.value.visibility)) {
    return '公開範囲の制限により申し込みできません。';
  }
  if (eventLifecycle.value === 'cancelled') {
    return 'イベントはキャンセルされました。';
  }
  if (eventLifecycle.value === 'ended') {
    return 'イベントは終了しました。';
  }
  const window = registrationWindowState.value;
  if (!window.open) return window.reason;
  if (capacityState.value.isFull) {
    return capacityState.value.enableWaitlist
      ? '満席のためキャンセル待ちのみ受付中です。'
      : '満席のため受付終了しました。';
  }
  return null;
});

const statusPill = computed(() => {
  if (!event.value) return { label: '読み込み中…', variant: 'closed' };
  if (eventLifecycle.value === 'cancelled') return { label: '中止', variant: 'closed' };
  if (eventLifecycle.value === 'ended') return { label: '終了', variant: 'closed' };
  if (!registrationWindowState.value.open) {
    const label = registrationWindowState.value.reason?.includes('開始前') ? '受付前' : '受付終了';
    return { label, variant: 'closed' };
  }
  if (capacityState.value.isFull) {
    return { label: '満席', variant: 'closed' };
  }
  return { label: '受付中', variant: 'open' };
});

const loadEvent = async (id: string) => {
  if (!id) {
    error.value = 'Missing event id';
    return;
  }
  hasRegistered.value = false;
  registrationError.value = null;
  pendingPayment.value = null;
  pendingApproval.value = false;
  paymentMessage.value = null;
  loading.value = true;
  error.value = null;
  try {
    event.value = await fetchEventById(id);
    gallery.value = await fetchEventGallery(id);
    currentSlide.value = 0;
  } catch (err) {
    error.value = 'イベントの読み込みに失敗しました。時間をおいて再試行してください。';
  } finally {
    loading.value = false;
  }
};

watch(eventId, (id) => {
  if (id) loadEvent(id);
});

onMounted(() => {
  if (eventId.value) loadEvent(eventId.value);
});

const title = computed(() => (event.value ? getLocalizedText(event.value.title) : ''));
const description = computed(() => (event.value ? getLocalizedText(event.value.description ?? event.value.title) : ''));
const heroImage = computed(() => gallery.value[currentSlide.value]?.imageUrl ?? null);
const priceHint = computed(() => {
  const ev = event.value;
  if (!ev?.config) return '無料/未設定';
  if (ev.config.price) return `¥${ev.config.price}`;
  return '無料/未設定';
});
const mapUrl = computed(() => {
  const ev = event.value;
  if (!ev) return null;
  if (typeof ev.locationLat === 'number' && typeof ev.locationLng === 'number') {
    return `https://www.google.com/maps/dir/?api=1&destination=${ev.locationLat},${ev.locationLng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.locationText)}`;
});
const ctaState = computed(() => {
  if (!event.value) return { label: '読み込み中…', disabled: true };
  if (eventLifecycle.value === 'cancelled') return { label: '中止しました', disabled: true };
  if (pendingPayment.value) return { label: '支払いへ進む', disabled: false };
  if (pendingApproval.value) return { label: '予約済み', disabled: true };
  if (hasRegistered.value) return { label: '参加予定です', disabled: true };
  if (!isLoggedIn.value) {
    return { label: requiresApproval.value ? 'ログインして予約する' : 'ログインして申し込む', disabled: false };
  }
  if (eventLifecycle.value === 'ended') return { label: '終了しました', disabled: true };
  if (!registrationWindowState.value.open) {
    const label = registrationWindowState.value.reason?.includes('開始前') ? '受付開始前' : '受付終了';
    return { label, disabled: true };
  }
  if (capacityState.value.isFull) {
    if (capacityState.value.enableWaitlist) {
      return { label: 'キャンセル待ちで申し込む', disabled: true };
    }
    return { label: '満席', disabled: true };
  }
  return { label: requiresApproval.value ? '今すぐ予約する' : '今すぐ申し込む', disabled: false };
});
const ctaLabel = computed(() => ctaState.value.label);
const ctaDisabled = computed(() => ctaState.value.disabled || isRegistering.value || isRedirecting.value);

const formatDate = (value?: string | null) => {
  if (!value) return '--';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const startRegistration = async () => {
  if (!eventId.value || !isLoggedIn.value) {
    registrationError.value = 'ログインしてください';
    return;
  }
  if (pendingPayment.value) {
    await handleStripeCheckout();
    return;
  }
  if (pendingApproval.value) {
    return;
  }
  if (registrationUnavailableReason.value) {
    registrationError.value = registrationUnavailableReason.value;
    return;
  }
  if (formFields.value.length) {
    initializeFormAnswers();
    showFormModal.value = true;
    return;
  }
  await submitRegistration({});
};

const formFields = computed<RegistrationFormField[]>(() => (event.value?.registrationFormSchema as RegistrationFormField[]) ?? []);

const submitRegistration = async (answers: Record<string, any>) => {
  isRegistering.value = true;
  registrationError.value = null;
  try {
    const registration = await createRegistration(eventId.value!, { formAnswers: answers });
    handleRegistrationResult(registration);
  } catch (err) {
    registrationError.value = '申込に失敗しました。時間をおいて再試行してください。';
  } finally {
    isRegistering.value = false;
  }
};

const handleRegistrationResult = (registration: EventRegistrationSummary) => {
  pendingApproval.value = false;
  if (registration.status === 'pending') {
    pendingPayment.value = null;
    hasRegistered.value = false;
    pendingApproval.value = true;
    paymentMessage.value = '申込を審査中です。';
    return;
  }
  if (registration.paymentRequired && (registration.amount ?? 0) > 0) {
    pendingPayment.value = { registrationId: registration.registrationId, amount: registration.amount };
    paymentMessage.value = 'お支払いを完了すると参加が確定します。';
    hasRegistered.value = false;
  } else {
    hasRegistered.value = true;
    pendingPayment.value = null;
    paymentMessage.value = null;
  }
};

const handleMockPayment = async () => {
  if (!pendingPayment.value) return;
  isPaying.value = true;
  registrationError.value = null;
  try {
    await createMockPayment(pendingPayment.value.registrationId);
    hasRegistered.value = true;
    pendingPayment.value = null;
    paymentMessage.value = 'お支払いが完了しました。参加が確定です。';
  } catch (err) {
    registrationError.value = '決済に失敗しました。時間をおいて再試行してください。';
  } finally {
    isPaying.value = false;
  }
};

const handleStripeCheckout = async () => {
  if (!pendingPayment.value) return;
  isRedirecting.value = true;
  registrationError.value = null;
  try {
    const { checkoutUrl, resume } = await createStripeCheckout(pendingPayment.value.registrationId);
    if (resume) {
      window.alert('未完了の決済があります。決済を再開してください。');
    }
    sessionStorage.setItem(
      MOBILE_EVENT_PENDING_PAYMENT_KEY,
      JSON.stringify({
        registrationId: pendingPayment.value.registrationId,
        amount: pendingPayment.value.amount,
        eventId: eventId.value,
        source: 'desktop',
      }),
    );
    window.location.href = checkoutUrl;
  } catch (err: any) {
    const message =
      err?.response?.data?.message ??
      (err instanceof Error ? err.message : 'Stripe Checkoutの開始に失敗しました');
    registrationError.value = message;
    isRedirecting.value = false;
  }
};

const fieldKey = (field: RegistrationFormField, index: number) => field.id ?? `${field.label ?? 'field'}-${index}`;

const initializeFormAnswers = () => {
  Object.keys(formAnswers).forEach((key) => delete formAnswers[key]);
  formFields.value.forEach((field, index) => {
    const key = fieldKey(field, index);
    if (field.type === 'checkbox') {
      formAnswers[key] = false;
    } else if (field.type === 'multiChoice') {
      formAnswers[key] = [];
    } else {
      formAnswers[key] = '';
    }
  });
};

const closeFormModal = () => {
  if (!isRegistering.value) {
    showFormModal.value = false;
  }
};

const submitDynamicForm = async () => {
  showFormModal.value = false;
  await submitRegistration({ ...formAnswers });
};

const getOptions = (field: RegistrationFormField) => (Array.isArray(field.options) ? field.options : []);

const toggleMulti = (field: RegistrationFormField, index: number, option: string, checked: boolean) => {
  const key = fieldKey(field, index);
  if (!Array.isArray(formAnswers[key])) {
    formAnswers[key] = [];
  }
  if (checked) {
    if (!formAnswers[key].includes(option)) {
      formAnswers[key].push(option);
    }
  } else {
    formAnswers[key] = formAnswers[key].filter((value: string) => value !== option);
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

const goBack = () => {
  router.back();
};

const shareEvent = () => {
  if (navigator.share && event.value) {
    navigator.share({ title: title.value, url: window.location.href }).catch(() => undefined);
  }
};

const openMap = () => {
  if (mapUrl.value) {
    window.open(mapUrl.value, '_blank');
  }
};


const syncRegistrationStatus = async () => {
  if (!isLoggedIn.value || !eventId.value) {
    hasRegistered.value = false;
    pendingPayment.value = null;
    pendingApproval.value = false;
    return;
  }
  pendingApproval.value = false;
  try {
    const myEvents = await fetchMyEvents();
    const matched = myEvents.find((item) => item.event?.id === eventId.value) ?? null;
    if (!matched) {
      hasRegistered.value = false;
      pendingPayment.value = null;
      return;
    }
    if (matched.status === 'pending') {
      pendingApproval.value = true;
      hasRegistered.value = false;
      pendingPayment.value = null;
      return;
    }
    const paidLike = ['paid', 'succeeded', 'captured', 'completed'];
    const paid =
      paidLike.includes(matched.paymentStatus || '') ||
      paidLike.includes(matched.status);
    const amount = matched.amount ?? 0;
    if (amount > 0 && !paid) {
      pendingPayment.value = { registrationId: matched.registrationId, amount };
      hasRegistered.value = false;
      return;
    }
    pendingPayment.value = null;
    hasRegistered.value = true;
  } catch {
    // ignore fetch failures
  }
};

watch(
  () => [eventId.value, isLoggedIn.value],
  () => {
    syncRegistrationStatus();
  },
  { immediate: true },
);
</script>

<style scoped>
.detail-shell {
  min-height: 100vh;
  background: var(--color-bg);
  padding-bottom: 72px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #fff;
  border-bottom: 1px solid var(--color-border);
}

.icon-btn {
  border: none;
  background: transparent;
  font-size: 1.2rem;
}

.hero {
  position: relative;
  width: 100%;
  height: 260px;
  overflow: hidden;
}

.hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.6));
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 1rem;
  color: #fff;
}

.hero-title {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 600;
}

.hero-sub {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.85;
}

.hero-dots {
  position: absolute;
  bottom: 10px;
  right: 16px;
  display: flex;
  gap: 0.3rem;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 10px;
  border: none;
  background: rgba(255, 255, 255, 0.5);
}

.dot.active {
  background: #fff;
}

.info-card {
  background: #fff;
  border-radius: 18px;
  margin: 12px;
  padding: 1.1rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
}
.info-card ul {
  padding-left: 1rem;
  margin: 0.3rem 0;
}
.info-card ul li {
  margin: 0.2rem 0;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.card-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.category-chip {
  border: 1px solid var(--color-primary);
  border-radius: 999px;
  padding: 0.15rem 0.65rem;
  color: var(--color-primary);
  font-size: 0.75rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  margin-bottom: 0.45rem;
}

.label {
  color: var(--color-subtext);
}

.info-row__value {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  text-align: right;
}

.info-row__value--multiline {
  align-items: flex-start;
  max-width: 70%;
  white-space: normal;
  line-height: 1.4;
  word-break: break-word;
}

.date-link {
  border: none;
  background: transparent;
  color: var(--color-primary);
  padding: 0;
  font: inherit;
  cursor: pointer;
  text-align: right;
}

.link {
  border: none;
  background: transparent;
  color: var(--color-primary);
  font-size: 0.8rem;
  margin-left: 0.5rem;
}

.info-row__value .link {
  margin-left: 0;
}

.location-link {
  border: none;
  background: transparent;
  color: var(--color-primary);
  padding: 0;
  font: inherit;
  cursor: pointer;
}

.status-pill {
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
}

.status-pill.open {
  background: rgba(0, 185, 0, 0.15);
  color: var(--color-primary);
}

.status-pill.closed {
  background: #ffe1e1;
  color: #c53030;
}

.payment-card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.payment-actions {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.payment-actions button {
  width: 100%;
  border: none;
  padding: 0.65rem 1rem;
  border-radius: 999px;
  font-weight: 600;
}

.payment-actions .primary {
  background: var(--color-primary);
  color: #fff;
}

.payment-actions .secondary {
  background: #f1f3f5;
  color: #333;
}

.rich :deep(h2),
.rich :deep(h3) {
  margin-top: 1rem;
}

.rich :deep(p) {
  margin: 0.5rem 0;
}

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  gap: 1rem;
}

.price-block {
  flex: 1;
}

.price-label {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-subtext);
}

.price-value {
  margin: 0;
  font-weight: 600;
}

.cta-btn {
  border: none;
  background: var(--color-primary);
  color: #fff;
  padding: 0.7rem 1.5rem;
  border-radius: 999px;
  font-weight: 600;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal {
  background: #fff;
  border-radius: 0.75rem;
  max-height: 90vh;
  overflow-y: auto;
  width: min(560px, 100%);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dynamic-form label,
.dynamic-form textarea,
.dynamic-form input,
.dynamic-form select {
  width: 100%;
}

.dynamic-form input,
.dynamic-form textarea,
.dynamic-form select {
  border: 1px solid #cbd5f5;
  border-radius: 0.5rem;
  padding: 0.5rem;
}

.choice-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.choice-group .inline {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.dynamic-form footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.primary {
  padding: 0.5rem 1rem;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 0.5rem;
}

.secondary {
  padding: 0.5rem 1rem;
  border: 1px solid #cbd5f5;
  background: transparent;
  border-radius: 0.5rem;
}

.status {
  padding: 1rem;
}
.status.info {
  color: var(--color-primary);
}

.error {
  color: #c53030;
}

.detail-skeleton {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.skeleton-hero {
  width: 100%;
  height: 220px;
  border-radius: 20px;
}

.skeleton-card {
  width: 100%;
  min-height: 120px;
  border-radius: 20px;
}

.skeleton-card--thin {
  min-height: 80px;
}

.shimmer {
  position: relative;
  overflow: hidden;
  background: linear-gradient(90deg, #f0f2f5 25%, #e3e6eb 37%, #f0f2f5 63%);
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
