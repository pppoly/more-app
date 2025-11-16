<template>
  <section class="event-detail-page">
    <RouterLink class="back-link" to="/events">← イベント一覧へ戻る</RouterLink>

    <p v-if="loading" class="status">Loading event...</p>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <article v-else-if="event" class="event-detail">
      <div v-if="gallery.length" class="hero">
        <img :src="gallery[currentSlide].imageUrl" alt="event cover" />
        <button v-if="gallery.length > 1" class="nav prev" @click="prevSlide">‹</button>
        <button v-if="gallery.length > 1" class="nav next" @click="nextSlide">›</button>
        <div class="dots">
          <button
            v-for="(item, index) in gallery"
            :key="item.id"
            :class="['dot', { active: currentSlide === index }]"
            @click="currentSlide = index"
          ></button>
        </div>
      </div>

      <header>
        <p class="category" v-if="event.category">#{{ event.category }}</p>
        <h2>{{ title }}</h2>
        <p class="community">{{ event.community.name }}</p>
      </header>

      <dl class="meta">
        <div>
          <dt>開始</dt>
          <dd>{{ formatDate(event.startTime) }}</dd>
        </div>
        <div v-if="event.endTime">
          <dt>終了</dt>
          <dd>{{ formatDate(event.endTime) }}</dd>
        </div>
        <div>
          <dt>場所</dt>
          <dd>{{ event.locationText }}</dd>
        </div>
        <div>
          <dt>受付期間</dt>
          <dd>{{ formatDate(event.regStartTime ?? event.startTime) }} - {{ formatDate(event.regEndTime ?? event.startTime) }}</dd>
        </div>
      </dl>

      <section class="description">
        <h3>イベント概要</h3>
        <p>{{ description }}</p>
        <div v-if="event.descriptionHtml" class="rich" v-html="event.descriptionHtml"></div>
      </section>

      <section v-if="event.config" class="config">
        <h3>参加ルール</h3>
        <ul>
          <li v-if="event.config.requireCheckin">✔ チェックイン必須</li>
          <li v-if="event.config.enableWaitlist">✔ キャンセル待ちあり</li>
          <li v-if="event.config.refundPolicy">返金: {{ event.config.refundPolicy }}</li>
          <li v-if="event.config.riskNoticeEnabled">⚠️ 注意事項をご確認ください。</li>
        </ul>
      </section>

      <section class="cta">
        <p v-if="!isLoggedIn" class="login-hint">Dev Login すると参加登録できます。</p>
        <div v-else class="cta-actions">
          <button
            type="button"
            class="cta-button"
            :disabled="isRegistering || hasRegistered || Boolean(pendingPayment)"
            @click="startRegistration"
          >
            <span v-if="hasRegistered">参加予定です</span>
            <span v-else-if="isRegistering">登録中...</span>
            <span v-else>このイベントに参加する</span>
          </button>
          <p v-if="paymentMessage" class="info">{{ paymentMessage }}</p>
          <div v-if="pendingPayment" class="payment-box">
            <p>支払額: {{ pendingPayment.amount ?? 0 }} 円</p>
            <button type="button" @click="handleMockPayment" :disabled="isPaying">
              {{ isPaying ? '決済中...' : '支払いを完了する（Mock）' }}
            </button>
          </div>
          <p v-if="registrationError" class="error">{{ registrationError }}</p>
        </div>
      </section>
    </article>

    <p v-else class="status">イベントが見つかりません。</p>

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
                  @change="toggleMulti(field, index, option, $event.target.checked)"
                />
                {{ option }}
              </label>
            </div>
            <label v-else-if="field.type === 'checkbox'" class="inline">
              <input
                type="checkbox"
                :checked="Boolean(formAnswers[fieldKey(field, index)])"
                @change="formAnswers[fieldKey(field, index)] = $event.target.checked"
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
import { useRoute } from 'vue-router';
import { createMockPayment, createRegistration, fetchEventById, fetchEventGallery } from '../../api/client';
import type { EventDetail, EventRegistrationSummary, RegistrationFormField, EventGalleryItem } from '../../types/api';
import { getLocalizedText } from '../../utils/i18nContent';
import { useAuth } from '../../composables/useAuth';

const route = useRoute();
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
const isPaying = ref(false);
const paymentMessage = ref<string | null>(null);
const showFormModal = ref(false);
const formAnswers = reactive<Record<string, any>>({});

const auth = useAuth();
const isLoggedIn = computed(() => Boolean(auth.user.value));

const loadEvent = async (id: string) => {
  if (!id) {
    error.value = 'Missing event id';
    return;
  }
  hasRegistered.value = false;
  registrationError.value = null;
  pendingPayment.value = null;
  paymentMessage.value = null;
  loading.value = true;
  error.value = null;
  try {
    event.value = await fetchEventById(id);
    gallery.value = await fetchEventGallery(id);
    currentSlide.value = 0;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load event';
  } finally {
    loading.value = false;
  }
};

watch(eventId, (id) => {
  if (id) {
    loadEvent(id);
  }
});

onMounted(() => {
  if (eventId.value) {
    loadEvent(eventId.value);
  }
});

const title = computed(() => (event.value ? getLocalizedText(event.value.title) : ''));
const description = computed(() => (event.value ? getLocalizedText(event.value.description ?? event.value.title) : ''));

const formFields = computed<RegistrationFormField[]>(() => (event.value?.registrationFormSchema as RegistrationFormField[]) ?? []);

const formatDate = (value?: string | null) => {
  if (!value) return '未設定';
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const startRegistration = () => {
  if (!eventId.value || !isLoggedIn.value) {
    registrationError.value = 'ログインしてください';
    return;
  }

  if (formFields.value.length) {
    initializeFormAnswers();
    showFormModal.value = true;
    registrationError.value = null;
    return;
  }

  submitRegistration({});
};

const submitRegistration = async (answers: Record<string, any>) => {
  if (!eventId.value || !isLoggedIn.value) {
    registrationError.value = 'ログインしてください';
    return;
  }
  isRegistering.value = true;
  registrationError.value = null;
  try {
    const registration = await createRegistration(eventId.value, { formAnswers: answers });
    handleRegistrationResult(registration);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to register for this event';
    registrationError.value = message;
  } finally {
    isRegistering.value = false;
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
    const message = err instanceof Error ? err.message : 'Failed to process payment';
    registrationError.value = message;
  } finally {
    isPaying.value = false;
  }
};

const prevSlide = () => {
  currentSlide.value = (currentSlide.value - 1 + gallery.value.length) % gallery.value.length;
};
const nextSlide = () => {
  currentSlide.value = (currentSlide.value + 1) % gallery.value.length;
};

const fieldKey = (field: RegistrationFormField, index: number) => field.id ?? `${field.label ?? 'field'}-${index}`;

const initializeFormAnswers = () => {
  for (const [key] of Object.entries(formAnswers)) {
    delete formAnswers[key];
  }
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

const getOptions = (field: RegistrationFormField) =>
  Array.isArray(field.options) ? field.options : [];

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
</script>

<style scoped>
.event-detail-page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.back-link {
  color: #2563eb;
  text-decoration: none;
}
.status {
  margin: 0.5rem 0;
}
.event-detail {
  background: #fff;
  padding: 1.5rem;
  border-radius: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.hero {
  position: relative;
  width: 100%;
  height: 50vh;
  border-radius: 0.75rem;
  overflow: hidden;
}
.hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hero .nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  border: none;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  cursor: pointer;
}
.hero .prev {
  left: 1rem;
}
.hero .next {
  right: 1rem;
}
.hero .dots {
  position: absolute;
  bottom: 1rem;
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 0.4rem;
}
.hero .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.5);
}
.hero .dot.active {
  background: white;
}
.category {
  font-size: 0.9rem;
  color: #2563eb;
  margin-bottom: 0.25rem;
}
.community {
  color: #475569;
}
.meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
}
.meta dt {
  font-weight: 600;
  color: #475569;
}
.meta dd {
  margin: 0;
}
.description .rich {
  margin-top: 0.75rem;
  border-top: 1px solid #e2e8f0;
  padding-top: 0.75rem;
}
.description .rich :global(p) {
  margin-bottom: 0.5rem;
}
.config ul {
  padding-left: 1.25rem;
}
.cta {
  border-top: 1px solid #e2e8f0;
  padding-top: 1rem;
}
.cta-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.cta-button {
  padding: 0.8rem 1.4rem;
  border: none;
  border-radius: 0.5rem;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}
.payment-box {
  border: 1px solid #cbd5f5;
  border-radius: 0.5rem;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.error {
  color: #b91c1c;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 50;
}
.modal {
  background: #fff;
  border-radius: 0.75rem;
  width: min(600px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.modal header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal .close {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  cursor: pointer;
}
.dynamic-form {
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
  display: inline-flex;
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
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
}
.secondary {
  padding: 0.5rem 1rem;
  border: 1px solid #cbd5f5;
  background: white;
  border-radius: 0.5rem;
  cursor: pointer;
}
</style>
