<template>
  <section class="console-section" :class="{ 'console-section--mobile': isMobileLayout }">
    <header class="section-header">
      <div>
        <h2>{{ isEdit ? 'イベント編集' : 'イベント作成' }}</h2>
        <p>{{ subtitle }}</p>
      </div>
      <RouterLink :to="backLink">戻る</RouterLink>
    </header>

    <!-- Cover uploader -->
    <section class="card">
      <header class="card-header">
        <div>
          <h3>活動カバー画像</h3>
          <p>複数の画像をアップロードしてカルーセルを構成します。</p>
        </div>
        <label class="upload-btn">
          <input type="file" multiple accept="image/*" @change="handleCoverUpload" />
          <span v-if="eventId">画像を追加</span>
          <span v-else>保存後にアップロード</span>
        </label>
      </header>
      <p v-if="!eventId" class="hint">まずイベントを保存すると画像アップロードができます。</p>
      <p v-if="coverError" class="status error">{{ coverError }}</p>
      <div class="gallery" v-if="galleries.length">
        <figure v-for="item in galleries" :key="item.id" class="gallery-item">
          <img :src="item.imageUrl" alt="cover" />
          <figcaption>#{{ item.order + 1 }}</figcaption>
        </figure>
      </div>
    </section>

    <form class="form" @submit.prevent="handleSubmit">
      <!-- Category -->
      <section class="card">
        <h3>カテゴリ</h3>
        <div class="category-grid">
          <button
            v-for="cat in categoryOptions"
            :key="cat.value"
            type="button"
            :class="['category-chip', { active: form.category === cat.value }]"
            @click="form.category = cat.value"
          >
            {{ cat.label }}
          </button>
        </div>
      </section>

      <!-- Basic info -->
      <section class="card">
        <h3>基本情報</h3>
        <label>
          タイトル
          <input v-model="form.title" type="text" required />
        </label>
        <label>
          ショート説明
          <textarea v-model="form.description" rows="3"></textarea>
        </label>
        <div class="space-y-2">
          <LocationPicker
            v-model:address="form.locationText"
            v-model:lat="form.locationLat"
            v-model:lng="form.locationLng"
          />
        </div>
        <div class="grid-2">
          <label>
            開始日時
            <input v-model="form.startTime" type="datetime-local" required />
          </label>
          <label>
            終了日時
            <input v-model="form.endTime" type="datetime-local" required />
          </label>
        </div>
        <div class="grid-2">
          <label>
            受付開始
            <input v-model="form.regStartTime" type="datetime-local" required />
          </label>
          <label>
            受付締切
            <input v-model="form.regEndTime" type="datetime-local" required />
          </label>
        </div>
      </section>

      <!-- Participants -->
      <section class="card">
        <h3>人数設定</h3>
        <div class="grid-2">
          <label>
            最低参加人数
            <input v-model.number="form.minParticipants" type="number" min="0" />
          </label>
          <label>
            最大参加人数
            <input v-model.number="form.maxParticipants" type="number" min="1" />
          </label>
        </div>
      </section>

      <!-- Config -->
      <section class="card">
        <h3>イベント設定</h3>
        <label class="checkbox">
          <input type="checkbox" v-model="form.requireApproval" /> 参加承認フローを使う
        </label>
        <label class="checkbox">
          <input type="checkbox" v-model="form.config.requireCheckin" /> 強制チェックイン
        </label>
        <label class="checkbox">
          <input type="checkbox" v-model="form.config.enableWaitlist" /> キャンセル待ちを許可
        </label>
        <label class="checkbox">
          <input type="checkbox" v-model="form.config.riskNoticeEnabled" /> 免責事項を表示
        </label>
        <label>
          公開範囲
          <select v-model="form.visibility">
            <option value="public">public</option>
            <option value="community-only">community-only</option>
            <option value="private">private</option>
          </select>
        </label>
        <label>
          コンソール可視範囲
          <select v-model="form.config.visibleRange">
            <option value="public">public</option>
            <option value="community">community</option>
            <option value="private">private</option>
          </select>
        </label>
        <label>
          返金ポリシー
          <textarea v-model="form.config.refundPolicy" rows="2" placeholder="例：イベント3日前まで全額返金"></textarea>
        </label>
      </section>

      <!-- Rich text -->
      <section class="card">
        <h3>詳細 (富テキスト)</h3>
        <QuillEditor v-model:content="form.descriptionHtml" theme="snow" content-type="html" />
      </section>

      <!-- Ticket -->
      <section class="card">
        <h3>チケット</h3>
        <label>
          参加費 (円)
          <input v-model.number="form.ticketPrice" type="number" min="0" />
        </label>
      </section>

      <!-- Dynamic form -->
      <section class="card">
        <div class="card-header">
          <h3>応募フォーム項目</h3>
          <button type="button" class="secondary" @click="addField">＋ フィールド追加</button>
        </div>
        <div v-if="!registrationFields.length" class="hint">まだフィールドがありません。［フィールド追加］を押してください。</div>
        <div v-for="field in registrationFields" :key="field.uuid" class="field-builder">
          <div class="grid-2">
            <label>
              ラベル
              <input v-model="field.label" type="text" required />
            </label>
            <label>
              種類
              <select v-model="field.type">
                <option value="text">text</option>
                <option value="textarea">textarea</option>
                <option value="number">number</option>
                <option value="date">date</option>
                <option value="phone">phone</option>
                <option value="email">email</option>
                <option value="select">select</option>
                <option value="singleChoice">singleChoice</option>
                <option value="multiChoice">multiChoice</option>
                <option value="checkbox">checkbox</option>
              </select>
            </label>
          </div>
          <div class="grid-2">
            <label>
              Placeholder
              <input v-model="field.placeholder" type="text" />
            </label>
            <label>
              必須
              <select v-model="field.required">
                <option :value="true">必須</option>
                <option :value="false">任意</option>
              </select>
            </label>
          </div>
          <label v-if="['select', 'singleChoice', 'multiChoice'].includes(field.type)">
            オプション (カンマ区切り)
            <input v-model="field.optionsText" type="text" placeholder="A,B,C" />
          </label>
          <button type="button" class="danger" @click="removeField(field.uuid)">削除</button>
        </div>
      </section>

      <div class="actions">
        <button type="submit" class="primary" :disabled="submitting">
          {{ submitting ? '保存中…' : '保存' }}
        </button>
      </div>
      <p v-if="error" class="status error">{{ error }}</p>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  createConsoleEvent,
  fetchConsoleEvent,
  updateConsoleEvent,
  fetchConsoleCommunity,
  uploadEventCovers,
  fetchEventGallery,
} from '../../api/client';
import type { RegistrationFormField, EventGalleryItem } from '../../types/api';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';
import LocationPicker from '../../components/console/LocationPicker.vue';
import { CONSOLE_AI_EVENT_DRAFT_KEY } from '../../constants/console';

interface BuilderField extends RegistrationFormField {
  uuid: string;
  optionsText?: string;
}

const route = useRoute();
const router = useRouter();
const communityId = route.params.communityId as string | undefined;
const eventId = route.params.eventId as string | undefined;
const isEdit = computed(() => Boolean(eventId));
const isMobileLayout = computed(() => route.meta?.layout === 'console-mobile');

const defaultConfig = () => ({
  requireCheckin: false,
  enableWaitlist: false,
  visibleRange: 'public',
  refundPolicy: '',
  riskNoticeEnabled: true,
  notes: '',
  riskNoticeText: '',
});

const form = reactive({
  title: '',
  description: '',
  descriptionHtml: '',
  locationText: '',
  locationLat: null as number | null,
  locationLng: null as number | null,
  category: '',
  startTime: '',
  endTime: '',
  regStartTime: '',
  regEndTime: '',
  minParticipants: 0,
  maxParticipants: 40,
  visibility: 'public',
  requireApproval: false,
  ticketPrice: 0,
  config: defaultConfig(),
});

const registrationFields = ref<BuilderField[]>([]);
const galleries = ref<EventGalleryItem[]>([]);
const coverError = ref<string | null>(null);

const submitting = ref(false);
const error = ref<string | null>(null);
const subtitle = ref('');
const backLink = computed(() =>
  communityId ? `/console/communities/${communityId}/events` : '/console/communities',
);

const categoryOptions = [
  { label: '徒步越野', value: 'hiking' },
  { label: 'ランニング', value: 'running' },
  { label: 'サイクリング', value: 'cycling' },
  { label: 'キャンプ', value: 'camping' },
  { label: '水上スポーツ', value: 'water' },
  { label: '親子', value: 'kids' },
  { label: '語学交流', value: 'language' },
  { label: 'その他', value: 'other' },
];

const load = async () => {
  if (communityId && !eventId) {
    const community = await fetchConsoleCommunity(communityId);
    subtitle.value = `コミュニティ: ${community.name}`;
  }

  if (!eventId) return;
  try {
    const event = await fetchConsoleEvent(eventId);
    subtitle.value = getLocalizedText(event.title);
    form.title = getLocalizedText(event.title);
    form.description = getLocalizedText(event.description);
    form.descriptionHtml = event.descriptionHtml ?? '';
    form.category = event.category ?? '';
    form.locationText = event.locationText;
    form.locationLat = event.locationLat ?? null;
    form.locationLng = event.locationLng ?? null;
    form.startTime = toLocalInput(event.startTime);
    form.endTime = toLocalInput(event.endTime ?? event.startTime);
    form.regStartTime = toLocalInput(event.regStartTime ?? event.startTime);
    form.regEndTime = toLocalInput(event.regEndTime ?? event.regDeadline);
    form.minParticipants = event.minParticipants ?? 0;
    form.maxParticipants = event.maxParticipants ?? 40;
    form.visibility = event.visibility;
    form.requireApproval = event.requireApproval;
    form.ticketPrice = event.ticketTypes[0]?.price ?? 0;
    form.config = { ...defaultConfig(), ...(event.config ?? {}) };
    registrationFields.value = buildBuilderFields(event.registrationFormSchema ?? []);
    if (event.galleries && event.galleries.length) {
      galleries.value = event.galleries;
    } else {
      await reloadGallery();
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'イベント読み込みに失敗しました';
  }
};

const reloadGallery = async () => {
  if (!eventId) return;
  try {
    galleries.value = await fetchEventGallery(eventId);
  } catch (err) {
    console.error(err);
  }
};

const getLocalizedText = (field: any) => {
  if (typeof field === 'object' && field) {
    return (field.original as string) || '';
  }
  return String(field ?? '');
};

const toLocalInput = (value?: string | null) => {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 16);
};

const buildContent = (text: string) => ({
  original: text,
  lang: 'ja',
  translations: {},
});

const toIso = (value: string) => (value ? new Date(value).toISOString() : undefined);

function buildRegistrationSchema() {
  return registrationFields.value
    .filter((field) => field.label.trim().length > 0)
    .map((field) => ({
      label: field.label,
      type: field.type,
      required: field.required ?? false,
      placeholder: field.placeholder,
      options: field.optionsText
        ? field.optionsText
            .split(',')
            .map((opt) => opt.trim())
            .filter(Boolean)
        : undefined,
    }));
}

const buildBuilderFields = (schema: RegistrationFormField[]): BuilderField[] =>
  schema.map((field, index) => ({
    uuid: `${field.label ?? 'field'}-${index}-${Date.now()}`,
    label: field.label ?? '',
    type: field.type ?? 'text',
    required: Boolean(field.required),
    placeholder: field.placeholder ?? '',
    optionsText: Array.isArray(field.options) ? field.options.join(', ') : '',
  }));

const addField = () => {
  registrationFields.value.push({
    uuid: Math.random().toString(36).slice(2),
    label: '',
    type: 'text',
    required: true,
    placeholder: '',
    optionsText: '',
  });
};

const removeField = (uuid: string) => {
  registrationFields.value = registrationFields.value.filter((field) => field.uuid !== uuid);
};

const handleSubmit = async () => {
  submitting.value = true;
  error.value = null;

  if (new Date(form.endTime) < new Date(form.startTime)) {
    error.value = '終了時間は開始より後に設定してください';
    submitting.value = false;
    return;
  }

  const payload = {
    title: buildContent(form.title),
    description: buildContent(form.description || form.title),
    descriptionHtml: form.descriptionHtml,
    category: form.category || null,
    locationText: form.locationText,
    locationLat: form.locationLat,
    locationLng: form.locationLng,
    startTime: toIso(form.startTime),
    endTime: toIso(form.endTime),
    regStartTime: toIso(form.regStartTime),
    regEndTime: toIso(form.regEndTime),
    regDeadline: toIso(form.regEndTime),
    minParticipants: form.minParticipants || null,
    maxParticipants: form.maxParticipants || null,
    visibility: form.visibility,
    requireApproval: form.requireApproval,
    config: { ...form.config },
    registrationFormSchema: buildRegistrationSchema(),
    status: 'open',
  };

  try {
    if (isEdit.value && eventId) {
      await updateConsoleEvent(eventId, {
        ...payload,
        ticketTypes: [
          {
            name: buildContent(`${form.title} チケット`),
            type: form.ticketPrice > 0 ? 'normal' : 'free',
            price: form.ticketPrice,
          },
        ],
      });
    } else if (communityId) {
      const event = await createConsoleEvent(communityId, {
        ...payload,
        ticketTypes: [
          {
            name: buildContent(`${form.title} チケット`),
            type: form.ticketPrice > 0 ? 'normal' : 'free',
            price: form.ticketPrice,
          },
        ],
      });
      router.replace(`/console/events/${event.id}/edit`);
      return;
    } else {
      throw new Error('コミュニティIDが必要です');
    }

    router.replace(backLink.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存に失敗しました';
  } finally {
    submitting.value = false;
  }
};

const handleCoverUpload = async (ev: Event) => {
  const input = ev.target as HTMLInputElement;
  if (!input.files || !input.files.length) return;
  if (!eventId) {
    coverError.value = '先にイベントを保存してください';
    input.value = '';
    return;
  }
  coverError.value = null;
  try {
    await uploadEventCovers(eventId, Array.from(input.files));
    await reloadGallery();
    input.value = '';
  } catch (err) {
    coverError.value = err instanceof Error ? err.message : '画像アップロードに失敗しました';
  }
};

const applyAssistantDraftFromStorage = () => {
  if (eventId) return;
  try {
    const raw = sessionStorage.getItem(CONSOLE_AI_EVENT_DRAFT_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (stored?.title && !form.title) {
      form.title = stored.title;
    }
    if (stored?.description) {
      form.description = stored.description;
      form.descriptionHtml = `<p>${stored.description}</p>`;
    }
    if (stored?.notes) {
      form.config.notes = stored.notes;
    }
    if (stored?.riskNotice) {
      form.config.riskNoticeText = stored.riskNotice;
    }
    if (stored?.ticketPrice != null) {
      form.ticketPrice = Number(stored.ticketPrice) || 0;
    }
    if (stored?.category && !form.category) {
      form.category = stored.category;
    }
  } catch (err) {
    console.warn('Failed to apply AI draft', err);
  } finally {
    sessionStorage.removeItem(CONSOLE_AI_EVENT_DRAFT_KEY);
  }
};

onMounted(async () => {
  await load();
  applyAssistantDraftFromStorage();
});
</script>

<style scoped>
.console-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
label {
  display: flex;
  flex-direction: column;
  font-weight: 600;
  gap: 0.3rem;
}
input,
textarea,
select {
  padding: 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid #cbd5f5;
}
.checkbox {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
}
.primary {
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: 0.5rem;
  background: #2563eb;
  color: white;
  cursor: pointer;
}
.primary.ghost {
  background: transparent;
  color: #2563eb;
  border: 1px solid #2563eb;
}
.secondary {
  padding: 0.6rem 1.2rem;
  border-radius: 0.5rem;
  border: 1px solid #64748b;
  background: white;
  color: #0f172a;
  cursor: pointer;
}
.ghost {
  padding: 0.5rem 1rem;
  border: 1px solid #94a3b8;
  background: white;
  border-radius: 0.5rem;
  cursor: pointer;
}
.danger {
  align-self: flex-end;
  padding: 0.4rem 0.8rem;
  border: 1px solid #b91c1c;
  background: white;
  color: #b91c1c;
  border-radius: 0.5rem;
  cursor: pointer;
}
.error {
  color: #b91c1c;
}
.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
}
.gallery-item {
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.gallery-item img {
  width: 100%;
  height: 160px;
  object-fit: cover;
}
.gallery-item figcaption {
  padding: 0.4rem;
  font-size: 0.85rem;
  text-align: center;
}
.upload-btn {
  cursor: pointer;
  color: #2563eb;
  font-weight: 600;
}
.upload-btn input {
  display: none;
}
.category-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.category-chip {
  padding: 0.4rem 0.8rem;
  border-radius: 999px;
  border: 1px solid #cbd5f5;
  background: white;
  cursor: pointer;
}
.category-chip.active {
  background: #2563eb;
  color: white;
}
.grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}
.field-builder {
  border: 1px dashed #cbd5f5;
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.hint {
  font-size: 0.9rem;
  color: #475569;
}
.console-section--mobile {
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 12px calc(48px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, #f6fbff 0%, #eef3f8 40%, #f9f9fb 100%);
  gap: 0.75rem;
}

.console-section--mobile .section-header {
  background: #fff;
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 15px 40px rgba(15, 23, 42, 0.08);
}

.console-section--mobile .section-header h2 {
  font-size: 18px;
}

.console-section--mobile .section-header p {
  font-size: 12px;
  color: var(--m-color-text-tertiary);
}

.console-section--mobile .card {
  border: none;
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
}

.console-section--mobile .card-header {
  flex-direction: column;
  gap: 6px;
}

.console-section--mobile .form {
  gap: 1rem;
}

.console-section--mobile input,
.console-section--mobile textarea,
.console-section--mobile select {
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  padding: 10px 12px;
}

.console-section--mobile .actions {
  position: sticky;
  bottom: 12px;
  justify-content: center;
}

.console-section--mobile .primary {
  width: 100%;
  border-radius: 999px;
  background: linear-gradient(135deg, #0090d9, #22bbaa);
  box-shadow: 0 20px 40px rgba(0, 144, 217, 0.35);
}

.console-section--mobile .primary.ghost {
  border-color: rgba(0, 144, 217, 0.3);
  color: #0090d9;
}

@media (max-width: 768px) {
  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
