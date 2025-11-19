<template>
  <section class="console-section" :class="{ 'console-section--mobile': isMobileLayout }">
    <header class="section-header" v-if="!isMobileLayout">
      <div>
        <h2>{{ isEdit ? 'イベント編集' : 'イベント作成' }}</h2>
        <p>{{ subtitle }}</p>
      </div>
      <RouterLink :to="backLink">戻る</RouterLink>
    </header>

    <section v-if="isMobileLayout" class="mobile-hero-card">
      <div class="hero-top">
        <p class="hero-eyebrow">{{ isEdit ? 'イベント編集' : 'AI と一緒に企画する' }}</p>
        <h1>{{ isEdit ? '活动编辑' : '智能创建活动' }}</h1>
        <p class="hero-desc">
          {{ aiPrefillNotice || '先定封面，再顺着导航把信息说清楚。' }}
        </p>
      </div>
      <div class="hero-cover-panel" ref="sectionCover">
        <div class="hero-cover-head">
          <p>活動カバー画像</p>
          <span>{{ coverDisplayItems.length ? '点击更换' : '请添加封面图' }}</span>
        </div>
        <div
          class="hero-cover-uploader"
          :class="{ 'hero-cover-uploader--filled': coverDisplayItems.length }"
          @click="triggerCoverPicker"
        >
          <input
            ref="coverInputRef"
            type="file"
            multiple
            accept="image/*"
            class="hidden-input"
            @change="handleCoverUpload"
          />
          <template v-if="!coverDisplayItems.length">
            <div class="hero-cover-avatar">
              <span>+</span>
            </div>
          </template>
          <div v-else class="hero-cover-gallery">
            <figure v-for="item in coverDisplayItems" :key="item.id" class="hero-cover-thumb">
              <img :src="item.imageUrl" alt="cover" />
            </figure>
          </div>
        </div>
      </div>
      <nav class="hero-nav">
        <button type="button" @click="scrollToSection('basic')">基本</button>
        <button type="button" @click="scrollToSection('schedule')">人数</button>
        <button type="button" @click="scrollToSection('config')">设定</button>
        <button type="button" @click="scrollToSection('form')">表单</button>
      </nav>
    </section>

    <section v-else-if="aiPrefillNotice" class="ai-prefill">
      <p>{{ aiPrefillNotice }}</p>
    </section>

    <section
      v-if="aiChecklist.length || aiConfirmQuestions.length"
      class="card checklist-card"
      ref="sectionChecklist"
    >
      <h3>AI からの確認項目</h3>
      <div v-if="aiChecklist.length" class="checklist-section">
        <p>不足している情報</p>
        <label v-for="item in aiChecklist" :key="item.id" class="checklist-item">
          <input type="checkbox" v-model="item.checked" />
          <span>{{ item.text }}</span>
        </label>
      </div>
      <div v-if="aiConfirmQuestions.length" class="checklist-section">
        <p>承認事項</p>
        <label v-for="item in aiConfirmQuestions" :key="item.id" class="checklist-item">
          <input type="checkbox" v-model="item.checked" />
          <span>{{ item.text }}</span>
        </label>
      </div>
    </section>

    <!-- Cover uploader -->
    <section v-if="!isMobileLayout" class="card cover-card" ref="sectionCover">
      <div
        class="cover-card-uploader"
        :class="{ 'cover-card-uploader--filled': coverDisplayItems.length }"
        @click="triggerCoverPicker"
      >
        <input
          ref="coverInputRef"
          type="file"
          multiple
          accept="image/*"
          class="hidden-input"
          @change="handleCoverUpload"
        />
        <template v-if="!coverDisplayItems.length">
          <div class="cover-card-avatar">
            <span>+</span>
          </div>
          <p class="cover-card-text">请添加活动封面图</p>
        </template>
        <div v-else class="cover-card-gallery">
          <figure v-for="item in coverDisplayItems" :key="item.id" class="cover-card-thumb">
            <img :src="item.imageUrl" alt="cover" />
          </figure>
        </div>
      </div>

      <p v-if="coverError" class="status error">{{ coverError }}</p>
    </section>

    <form class="form" @submit.prevent="handleSubmit">
      <!-- Category -->
      <section class="card" ref="sectionCategory">
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
      <section class="ios-panel" ref="sectionBasic">
        <div class="ios-form">
          <button type="button" class="ios-row ios-row--action" @click="openFieldEditor('title')">
            <span class="ios-label">タイトル</span>
            <span class="ios-value" :class="{ 'ios-value--placeholder': !form.title }">
              {{ form.title || '请输入 >' }}
            </span>
          </button>
          <button
            type="button"
            class="ios-row ios-row--action ios-row--textarea"
            @click="openFieldEditor('description')"
          >
            <span class="ios-label">ショート説明</span>
            <span
              class="ios-value ios-value--multiline"
              :class="{ 'ios-value--placeholder': !form.description }"
            >
              {{ form.description ? form.description : '请输入 >' }}
            </span>
          </button>
          <button type="button" class="ios-row ios-row--action" @click="toggleLocationSheet(true)">
            <span class="ios-label">場所</span>
            <span class="ios-value" :class="{ 'ios-value--placeholder': !form.locationText }">
              {{ form.locationText || '选择' }}
            </span>
          </button>
          <button type="button" class="ios-row ios-row--action" @click="openFieldEditor('startTime')">
            <span class="ios-label">開始日時</span>
            <span class="ios-value" :class="{ 'ios-value--placeholder': !form.startTime }">
              {{ form.startTime ? formatDisplayDate(form.startTime) : '选择' }}
            </span>
          </button>
          <button type="button" class="ios-row ios-row--action" @click="openFieldEditor('endTime')">
            <span class="ios-label">終了日時</span>
            <span class="ios-value" :class="{ 'ios-value--placeholder': !form.endTime }">
              {{ form.endTime ? formatDisplayDate(form.endTime) : '选择' }}
            </span>
          </button>
          <button type="button" class="ios-row ios-row--action" @click="openFieldEditor('regStartTime')">
            <span class="ios-label">受付開始</span>
            <span class="ios-value" :class="{ 'ios-value--placeholder': !form.regStartTime }">
              {{ form.regStartTime ? formatDisplayDate(form.regStartTime) : '选择' }}
            </span>
          </button>
          <button type="button" class="ios-row ios-row--action" @click="openFieldEditor('regEndTime')">
            <span class="ios-label">受付締切</span>
            <span class="ios-value" :class="{ 'ios-value--placeholder': !form.regEndTime }">
              {{ form.regEndTime ? formatDisplayDate(form.regEndTime) : '选择' }}
            </span>
          </button>
        </div>
      </section>

      <!-- Participants -->
      <section class="ios-panel" ref="sectionSchedule">
        <div class="ios-form">
          <button type="button" class="ios-row ios-row--action" @click="openFieldEditor('minParticipants')">
            <span class="ios-label">最低参加人数</span>
            <span class="ios-value" :class="{ 'ios-value--placeholder': form.minParticipants == null }">
              {{ form.minParticipants == null ? '选择' : `${form.minParticipants} 人` }}
            </span>
          </button>
          <button type="button" class="ios-row ios-row--action" @click="openFieldEditor('maxParticipants')">
            <span class="ios-label">最大参加人数</span>
            <span class="ios-value" :class="{ 'ios-value--placeholder': form.maxParticipants == null }">
              {{ form.maxParticipants == null ? '选择' : `${form.maxParticipants} 人` }}
            </span>
          </button>
        </div>
      </section>

      <!-- Config -->
      <section class="ios-panel" ref="sectionConfig">
        <div class="ios-form">
          <label class="ios-row ios-row--toggle">
            <span class="ios-label">参加承認</span>
            <input type="checkbox" v-model="form.requireApproval" class="ios-switch" />
          </label>
          <label class="ios-row ios-row--toggle">
            <span class="ios-label">強制チェックイン</span>
            <input type="checkbox" v-model="form.config.requireCheckin" class="ios-switch" />
          </label>
          <label class="ios-row ios-row--toggle">
            <span class="ios-label">キャンセル待ち</span>
            <input type="checkbox" v-model="form.config.enableWaitlist" class="ios-switch" />
          </label>
          <label class="ios-row ios-row--toggle">
            <span class="ios-label">免責事項</span>
            <input type="checkbox" v-model="form.config.riskNoticeEnabled" class="ios-switch" />
          </label>
        </div>
        <div class="ios-form">
          <button type="button" class="ios-row ios-row--action" @click="openFieldEditor('visibility')">
            <span class="ios-label">公開範囲</span>
            <span class="ios-value">{{ getSelectLabel('visibility', form.visibility) }}</span>
          </button>
          <button type="button" class="ios-row ios-row--action" @click="openFieldEditor('visibleRange')">
            <span class="ios-label">Console 可視範囲</span>
            <span class="ios-value">{{ getSelectLabel('visibleRange', form.config.visibleRange) }}</span>
          </button>
          <button
            type="button"
            class="ios-row ios-row--action ios-row--textarea"
            @click="openFieldEditor('refundPolicy')"
          >
            <span class="ios-label">返金ポリシー</span>
            <span
              class="ios-value ios-value--multiline"
              :class="{ 'ios-value--placeholder': !form.config.refundPolicy }"
            >
              {{ form.config.refundPolicy ? form.config.refundPolicy : '请输入 >' }}
            </span>
          </button>
        </div>
      </section>

      <!-- Rich text -->
      <section class="card" ref="sectionRichText">
        <h3>詳細 (富テキスト)</h3>
        <QuillEditor v-model:content="form.descriptionHtml" theme="snow" content-type="html" />
      </section>

      <!-- Ticket -->
      <section class="card" ref="sectionTickets">
        <h3>チケット</h3>
        <label>
          参加費 (円)
          <input v-model.number="form.ticketPrice" type="number" min="0" />
        </label>
      </section>

      <!-- Dynamic form -->
      <section class="card" ref="sectionForm">
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

      <div class="actions" v-if="!isMobileLayout">
        <button type="submit" class="primary" :disabled="submitting">
          {{ submitting ? '保存中…' : '保存' }}
        </button>
      </div>
      <p v-if="error" class="status error">{{ error }}</p>
    </form>

    <div v-if="isMobileLayout" class="bottom-nav">
      <button type="button" class="nav-btn ghost" :disabled="!eventId" @click="handlePreview">
        预览活动
      </button>
      <button
        type="button"
        class="nav-btn secondary"
        :disabled="submitting"
        @click="handleSaveDraft"
      >
        {{ actionLoading === 'draft' ? '保存中…' : '保存草稿' }}
      </button>
      <button
        type="button"
        class="nav-btn primary"
        :disabled="submitting"
        @click="handlePublish"
      >
        {{ actionLoading === 'publish' ? '发布中…' : '发布活动' }}
      </button>
    </div>

    <div v-if="editingField" class="field-modal" @click.self="closeFieldEditor">
      <div
        class="field-sheet"
        :class="{
          'field-sheet--wide': ['text', 'number'].includes(fieldMeta[editingField].type),
          'field-sheet--large': fieldMeta[editingField].type === 'textarea',
        }"
      >
        <header class="field-sheet-head">
          <button type="button" @click="closeFieldEditor">取消</button>
          <p>{{ fieldMeta[editingField].label }}</p>
          <button type="button" class="highlight" @click="confirmFieldEditor">完成</button>
        </header>
        <div class="field-sheet-body">
          <input
            v-if="['text', 'number'].includes(fieldMeta[editingField].type)"
            v-model="fieldDraft"
            :type="fieldMeta[editingField].type === 'number' ? 'number' : 'text'"
            :placeholder="fieldMeta[editingField].placeholder"
          />
          <textarea
            v-else-if="fieldMeta[editingField].type === 'textarea'"
            v-model="fieldDraft"
            rows="5"
            :placeholder="fieldMeta[editingField].placeholder"
          ></textarea>
          <div
            v-else-if="fieldMeta[editingField].type === 'select'"
            class="select-option-list"
          >
            <button
              v-for="opt in selectOptions[editingField] || []"
              :key="opt.value"
              type="button"
              class="select-option"
              :class="{ active: fieldDraft === opt.value }"
              @click="fieldDraft = opt.value"
            >
              <span>{{ opt.label }}</span>
              <span v-if="fieldDraft === opt.value" class="i-lucide-check"></span>
            </button>
          </div>
          <input
            v-else
            v-model="fieldDraft"
            type="datetime-local"
          />
        </div>
      </div>
    </div>

    <div v-if="showLocationSheet" class="field-modal" @click.self="toggleLocationSheet(false)">
      <div class="field-sheet field-sheet--large">
        <header class="field-sheet-head">
          <button type="button" @click="toggleLocationSheet(false)">取消</button>
          <p>选择活动地点</p>
          <button type="button" class="highlight" @click="toggleLocationSheet(false)">完成</button>
        </header>
        <div class="field-sheet-body">
          <LocationPicker
            v-model:address="form.locationText"
            v-model:lat="form.locationLat"
            v-model:lng="form.locationLng"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { RouteLocationRaw } from 'vue-router';
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

type FieldKey =
  | 'title'
  | 'description'
  | 'startTime'
  | 'endTime'
  | 'regStartTime'
  | 'regEndTime'
  | 'minParticipants'
  | 'maxParticipants'
  | 'visibility'
  | 'visibleRange'
  | 'refundPolicy';

interface BuilderField extends RegistrationFormField {
  uuid: string;
  optionsText?: string;
}

const route = useRoute();
const router = useRouter();
const communityId = route.params.communityId as string | undefined;
const eventId = route.params.eventId as string | undefined;
const isEdit = computed(() => Boolean(eventId));
const isMobileLayout = computed(() => {
  if (route.meta?.layout === 'console-mobile') return true;
  if (String(route.name ?? '').startsWith('ConsoleMobile')) return true;
  return route.matched.some((record) => record.meta?.layout === 'console-mobile');
});

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
  subtitle: '',
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
  minParticipants: null as number | null,
  maxParticipants: null as number | null,
  visibility: 'public',
  requireApproval: false,
  ticketPrice: 0,
  config: defaultConfig(),
});

const registrationFields = ref<BuilderField[]>([]);
const galleries = ref<EventGalleryItem[]>([]);
const coverInputRef = ref<HTMLInputElement | null>(null);
const pendingCoverFiles = ref<File[]>([]);
const localCoverPreviews = ref<EventGalleryItem[]>([]);
const coverError = ref<string | null>(null);
const sectionChecklist = ref<HTMLElement | null>(null);
const sectionCover = ref<HTMLElement | null>(null);
const sectionCategory = ref<HTMLElement | null>(null);
const sectionBasic = ref<HTMLElement | null>(null);
const sectionSchedule = ref<HTMLElement | null>(null);
const sectionConfig = ref<HTMLElement | null>(null);
const sectionRichText = ref<HTMLElement | null>(null);
const sectionTickets = ref<HTMLElement | null>(null);
const sectionForm = ref<HTMLElement | null>(null);

const submitting = ref(false);
const error = ref<string | null>(null);
const subtitle = ref('');
const backLink = computed<RouteLocationRaw>(() =>
  communityId
    ? { name: 'console-community-events', params: { communityId } }
    : { name: 'console-communities' },
);
const aiPrefillNotice = ref<string | null>(null);
const aiChecklist = ref<Array<{ id: string; text: string; checked: boolean }>>([]);
const aiConfirmQuestions = ref<Array<{ id: string; text: string; checked: boolean }>>([]);
const coverDisplayItems = computed(() =>
  eventId ? galleries.value : localCoverPreviews.value,
);
const editingField = ref<FieldKey | null>(null);
const fieldDraft = ref('');
const showLocationSheet = ref(false);
const actionLoading = ref<'draft' | 'publish' | null>(null);
type FieldMetaType = 'text' | 'textarea' | 'datetime' | 'number';

const fieldMeta: Record<FieldKey, { label: string; type: FieldMetaType; placeholder?: string }> = {
  title: { label: 'タイトル', type: 'text', placeholder: '请输入 >' },
  description: { label: 'ショート説明', type: 'textarea', placeholder: '请输入 >' },
  startTime: { label: '開始日時', type: 'datetime' },
  endTime: { label: '終了日時', type: 'datetime' },
  regStartTime: { label: '受付開始', type: 'datetime' },
  regEndTime: { label: '受付締切', type: 'datetime' },
  minParticipants: { label: '最低参加人数', type: 'number', placeholder: '请输入 >' },
  maxParticipants: { label: '最大参加人数', type: 'number', placeholder: '请输入 >' },
  visibility: { label: '公開範囲', type: 'select' },
  visibleRange: { label: 'Console 可視範囲', type: 'select' },
  refundPolicy: { label: '返金ポリシー', type: 'textarea', placeholder: '例：イベント3日前まで全額返金' },
};

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

const selectOptions: Partial<Record<FieldKey, Array<{ label: string; value: string }>>> = {
  visibility: [
    { label: '公開 (public)', value: 'public' },
    { label: 'コミュニティのみ', value: 'community-only' },
    { label: '非公開', value: 'private' },
  ],
  visibleRange: [
    { label: '公開 (public)', value: 'public' },
    { label: 'コミュニティ', value: 'community' },
    { label: '非公開', value: 'private' },
  ],
};

const getSelectLabel = (key: 'visibility' | 'visibleRange', value?: string | null) => {
  const list = selectOptions[key] || [];
  const target = list.find((item) => item.value === value);
  return target?.label || '选择';
};

const formatDisplayDate = (value: string) => {
  if (!value) return '选择';
  try {
    return new Date(value).toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
};

const openFieldEditor = (key: FieldKey) => {
  editingField.value = key;
  const current = (form as any)[key];
  if (current != null && current !== '') {
    fieldDraft.value = String(current);
  } else if (fieldMeta[key].type === 'select') {
    fieldDraft.value = selectOptions[key]?.[0]?.value ?? '';
  } else {
    fieldDraft.value = '';
  }
};

const closeFieldEditor = () => {
  editingField.value = null;
  fieldDraft.value = '';
};

const confirmFieldEditor = () => {
  if (!editingField.value) return;
  const meta = fieldMeta[editingField.value];
  if (meta.type === 'number') {
    const trimmed = fieldDraft.value.trim();
    if (!trimmed) {
      (form as any)[editingField.value] = null;
    } else {
      const parsed = Number(trimmed);
      (form as any)[editingField.value] = Number.isFinite(parsed) ? parsed : null;
    }
  } else if (meta.type === 'select') {
    (form as any)[editingField.value] = fieldDraft.value;
  } else {
    (form as any)[editingField.value] = fieldDraft.value;
  }
  closeFieldEditor();
};

const toggleLocationSheet = (state?: boolean) => {
  showLocationSheet.value = typeof state === 'boolean' ? state : !showLocationSheet.value;
};

const toChecklistItems = (items: string[]) =>
  items.map((text, idx) => ({
    id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2)}`,
    text,
    checked: false,
  }));

const applyAiDraft = (draft: any) => {
  if (!draft) return;
  form.title = draft.title || form.title;
  if (draft.subtitle) {
    form.subtitle = draft.subtitle;
  }
  if (draft.description) {
    form.description = draft.description;
    form.descriptionHtml = `<p>${draft.description}</p>`;
  }
  if (draft.logistics) {
    form.locationText = draft.logistics.locationText || form.locationText;
    if (draft.logistics.startTime) {
      form.startTime = toLocalInput(draft.logistics.startTime);
    }
    if (draft.logistics.endTime) {
      form.endTime = toLocalInput(draft.logistics.endTime);
    }
  }
  if (draft.visibility) {
    form.visibility = draft.visibility;
  }
  if (Array.isArray(draft.ticketTypes) && draft.ticketTypes.length) {
    form.ticketPrice = draft.ticketTypes[0].price ?? form.ticketPrice;
  }
  if (Array.isArray(draft.registrationForm) && draft.registrationForm.length) {
    registrationFields.value = draft.registrationForm.map((field: any) => ({
      uuid: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label: field.label || '質問',
      type: field.type || 'text',
      required: field.required ?? true,
      placeholder: field.placeholder ?? '',
      optionsText: Array.isArray(field.options) ? field.options.join(', ') : '',
    }));
  }
  if (Array.isArray(draft.requirements) && draft.requirements.length) {
    form.config.notes = draft.requirements.map((req: any) => req.label).join('\n');
  }
  aiChecklist.value = toChecklistItems(draft.checklist || []);
  aiConfirmQuestions.value = toChecklistItems(draft.confirmQuestions || []);
  aiPrefillNotice.value = 'AI 草稿を読み込みました。各項目を確認してください。';
};

const loadAiDraftFromSession = () => {
  if (isEdit.value) return;
  const raw = sessionStorage.getItem(CONSOLE_AI_EVENT_DRAFT_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    applyAiDraft(parsed);
    sessionStorage.removeItem(CONSOLE_AI_EVENT_DRAFT_KEY);
  } catch (err) {
    console.warn('Failed to parse AI draft', err);
  }
};

const load = async () => {
  if (communityId && !eventId) {
    const community = await fetchConsoleCommunity(communityId);
    subtitle.value = `コミュニティ: ${community.name}`;
  }

  if (!eventId) {
    loadAiDraftFromSession();
    return;
  }
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

const scrollToSection = (section: string) => {
  const map: Record<string, HTMLElement | null> = {
    checklist: sectionChecklist.value,
    cover: sectionCover.value,
    category: sectionCategory.value,
    basic: sectionBasic.value,
    schedule: sectionSchedule.value,
    config: sectionConfig.value,
    rich: sectionRichText.value,
    tickets: sectionTickets.value,
    form: sectionForm.value,
  };
  const el = map[section];
  if (el) {
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - 80,
      behavior: 'smooth',
    });
  }
};

const triggerCoverPicker = () => {
  if (coverInputRef.value) {
    coverInputRef.value.click();
  }
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

const persistEvent = async (status: 'draft' | 'open') => {
  submitting.value = true;
  actionLoading.value = status;
  error.value = null;

  if (new Date(form.endTime) < new Date(form.startTime)) {
    error.value = '終了時間は開始より後に設定してください';
    submitting.value = false;
    actionLoading.value = null;
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
    minParticipants: form.minParticipants ?? null,
    maxParticipants: form.maxParticipants ?? null,
    visibility: form.visibility,
    requireApproval: form.requireApproval,
    config: { ...form.config },
    registrationFormSchema: buildRegistrationSchema(),
    status,
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
      await uploadPendingCovers(eventId);
      if (status === 'open') {
        router.replace(backLink.value);
      }
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
      await uploadPendingCovers(event.id);
      router.replace({ name: 'console-event-edit', params: { eventId: event.id } });
      return;
    } else {
      throw new Error('コミュニティIDが必要です');
    }

  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存に失敗しました';
  } finally {
    submitting.value = false;
    actionLoading.value = null;
  }
};

const handleSaveDraft = () => persistEvent('draft');
const handlePublish = () => persistEvent('open');
const handleSubmit = () => handlePublish();

const handlePreview = () => {
  if (!eventId) {
    error.value = '请先保存草稿后再预览活动';
    return;
  }
  router.push({ name: 'event-detail', params: { eventId } });
};

const revokeLocalCoverPreviews = () => {
  localCoverPreviews.value.forEach((item) => {
    URL.revokeObjectURL(item.imageUrl);
  });
  localCoverPreviews.value = [];
};

const setLocalCoverPreviews = (files: File[]) => {
  revokeLocalCoverPreviews();
  localCoverPreviews.value = files.map((file, idx) => ({
    id: `local-${Date.now()}-${idx}`,
    imageUrl: URL.createObjectURL(file),
    order: idx,
  }));
};

const uploadPendingCovers = async (targetEventId: string) => {
  if (!pendingCoverFiles.value.length) return;
  try {
    await uploadEventCovers(targetEventId, pendingCoverFiles.value);
  } finally {
    pendingCoverFiles.value = [];
    revokeLocalCoverPreviews();
    if (eventId && targetEventId === eventId) {
      await reloadGallery();
    }
  }
};

const handleCoverUpload = async (ev: Event) => {
  const input = ev.target as HTMLInputElement;
  if (!input.files || !input.files.length) return;
  const files = Array.from(input.files);
  if (!eventId) {
    coverError.value = null;
    pendingCoverFiles.value = files;
    setLocalCoverPreviews(files);
    input.value = '';
    return;
  }
  coverError.value = null;
  try {
    await uploadEventCovers(eventId, files);
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

onUnmounted(() => {
  revokeLocalCoverPreviews();
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
.ai-prefill {
  background: #ecfeff;
  border: 1px solid #67e8f9;
  border-radius: 1rem;
  padding: 0.85rem;
  font-size: 0.9rem;
  color: #0f172a;
}
.checklist-card {
  gap: 0.5rem;
}
.checklist-section {
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  padding-top: 0.5rem;
}
.checklist-section p {
  margin: 0 0 0.4rem;
  font-size: 0.9rem;
  color: #475569;
  font-weight: 600;
}
.checklist-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: #0f172a;
  padding: 0.2rem 0;
}
.checklist-item input {
  width: 16px;
  height: 16px;
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
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 12px calc(150px + env(safe-area-inset-bottom, 0px));
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
  padding: 18px;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.98);
}

.console-section--mobile h3 {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 6px;
}

.console-section--mobile label {
  font-size: 13px;
  color: #0f172a;
}





.ios-form {
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  overflow: hidden;
  background: #fff;
  margin-bottom: 18px;
  position: relative;
  border: 1px solid rgba(15, 23, 42, 0.08);
}

.ios-panel .ios-form::before,
.ios-panel .ios-form::after {
  content: '';
  position: absolute;
  left: 16px;
  right: 16px;
  height: 1px;
  background: rgba(15, 23, 42, 0.06);
}

.ios-panel .ios-form::before {
  top: 0;
}

.ios-panel .ios-form::after {
  bottom: 0;
}

.ios-panel .ios-form:last-of-type {
  margin-bottom: 0;
}

.ios-row {
  display: flex;
  align-items: center;
  padding: 18px 20px;
  background: rgba(255, 255, 255, 0.98);
  gap: 16px;
  font-size: 16px;
  position: relative;
}

.ios-row::after {
  content: '';
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: 0;
  height: 1px;
  background: rgba(15, 23, 42, 0.08);
  opacity: 0.5;
}

.ios-row--action {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.ios-row:last-child {
  border-bottom: none;
}
.ios-row:last-child::after {
  opacity: 0;
}

.ios-row--field {
  align-items: center;
}

.ios-label {
  flex: 0 0 32%;
  font-size: 16px;
  color: #0f172a;
  font-weight: 600;
}

.ios-field {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.ios-field input,
.ios-field textarea {
  width: 100%;
  border: none;
  background: transparent;
  text-align: right;
  font-size: 15px;
  color: #0f172a;
}

.ios-field textarea {
  min-height: 72px;
  text-align: left;
  resize: none;
}

.ios-value {
  flex: 1;
  font-size: 16px;
  color: #0f172a;
  text-align: right;
}

.ios-value--multiline {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-align: right;
  opacity: 0.9;
}

.ios-value--placeholder {
  color: rgba(15, 23, 42, 0.45);
}

.select-option-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.select-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: #fff;
  font-size: 15px;
  cursor: pointer;
}

.select-option.active {
  border-color: #0090d9;
  color: #0090d9;
  box-shadow: 0 10px 25px rgba(0, 144, 217, 0.15);
}

.ios-row--toggle {
  justify-content: space-between;
}

.ios-switch {
  appearance: none;
  width: 46px;
  height: 28px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.2);
  position: relative;
  transition: background 0.2s ease;
}

.ios-switch::after {
  content: '';
  position: absolute;
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}

.ios-switch:checked {
  background: linear-gradient(135deg, #00a2ff, #07c8a3);
}

.ios-switch:checked::after {
  transform: translateX(18px);
}

.ios-select {
  border: none;
  background: transparent;
  font-size: 15px;
  color: #0f172a;
  text-align: right;
  padding: 6px 0;
}

.ios-row--textarea {
  align-items: flex-start;
}

.ios-textarea {
  flex: 1;
  border: none;
  background: rgba(15, 23, 42, 0.04);
  border-radius: 16px;
  padding: 10px 12px;
  font-size: 14px;
  min-height: 80px;
  resize: none;
}

.field-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(5px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 20px;
  z-index: 60;
}

.field-sheet {
  width: 100%;
  max-width: 540px;
  background: #fff;
  border-radius: 28px;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
  box-shadow: 0 -20px 50px rgba(15, 23, 42, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.field-sheet--wide .field-sheet-body input {
  font-size: 18px;
}

.field-sheet--large {
  max-height: 90vh;
}

.field-sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  font-size: 14px;
  font-weight: 600;
}

.field-sheet-head button {
  background: none;
  border: none;
  font-size: 14px;
  color: #64748b;
  cursor: pointer;
}

.field-sheet-head .highlight {
  color: #0090d9;
}

.field-sheet-body {
  padding: 0 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-sheet-body input,
.field-sheet-body textarea {
  width: 100%;
  border: none;
  background: #f4f6fb;
  padding: 14px;
  border-radius: 16px;
  font-size: 16px;
}

.field-sheet-body textarea {
  min-height: 140px;
}

.field-sheet--large .field-sheet-body {
  padding-bottom: 0;
  height: 70vh;
  overflow-y: auto;
}

.ios-row--textarea {
  align-items: flex-start;
}

.ios-row--picker .ios-field {
  justify-content: flex-start;
  align-items: stretch;
}

.ios-row--picker .ios-field :deep(input) {
  text-align: left;
}

.ios-row--picker .ios-field :deep(.location-picker) {
  width: 100%;
}

.console-section--mobile .card-header {
  flex-direction: column;
  gap: 6px;
}

.console-section--mobile .form {
  gap: 1rem;
}

.mobile-hero-card {
  background: linear-gradient(135deg, #081a32, #0f3c57 55%, #0f6971);
  border-radius: 24px;
  padding: 20px;
  color: #ecf5ff;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mobile-hero-card .hero-text h1 {
  font-size: 28px;
  margin: 6px 0;
  letter-spacing: 0.03em;
}

.mobile-hero-card .hero-eyebrow {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: rgba(255, 255, 255, 0.7);
}

.mobile-hero-card .hero-desc {
  font-size: 13px;
  color: rgba(236, 245, 255, 0.7);
  line-height: 1.5;
}

.mobile-hero-card .hero-status {
  padding: 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 12px;
}

.mobile-hero-card .hero-nav {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.mobile-hero-card .hero-nav button {
  flex: 1;
  min-width: 72px;
  border: none;
  border-radius: 999px;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  backdrop-filter: blur(6px);
}

.mobile-hero-card .hero-nav button:active {
  background: rgba(255, 255, 255, 0.3);
}

.cover-card {
  gap: 1rem;
}

.cover-card-uploader,
.hero-cover-uploader {
  border: 1px dashed rgba(8, 26, 50, 0.25);
  border-radius: 28px;
  background: rgba(8, 26, 50, 0.02);
  padding: 24px 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.cover-card-uploader--filled,
.hero-cover-uploader--filled {
  border-style: solid;
  background: rgba(8, 26, 50, 0.04);
}

.cover-card-avatar,
.hero-cover-avatar {
  width: 96px;
  height: 96px;
  border-radius: 999px;
  border: 2px dashed rgba(8, 26, 50, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  color: rgba(8, 26, 50, 0.45);
  background: #fff;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
}

.cover-card-text {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.cover-card-gallery,
.hero-cover-gallery {
  width: 100%;
  display: flex;
  gap: 10px;
  overflow-x: auto;
}

.cover-card-thumb,
.hero-cover-thumb {
  width: 100px;
  height: 100px;
  border-radius: 22px;
  overflow: hidden;
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.15);
  flex-shrink: 0;
}

.cover-card-thumb img,
.hero-cover-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-top {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hero-cover-panel {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 26px;
  padding: 18px;
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.25);
  color: #0f172a;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hero-cover-head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: rgba(15, 23, 42, 0.7);
}

.hidden-input {
  display: none;
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

.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 10px;
  padding: 12px 16px calc(env(safe-area-inset-bottom, 0px) + 18px);
  background: linear-gradient(180deg, rgba(246, 251, 255, 0.2) 0%, rgba(246, 251, 255, 0.95) 45%, #f6fbff 100%);
  box-shadow: 0 -8px 30px rgba(15, 23, 42, 0.1);
  z-index: 40;
}

.nav-btn {
  flex: 1;
  padding: 14px 10px;
  border-radius: 999px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.15);
  cursor: pointer;
}

.nav-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nav-btn.ghost {
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(15, 23, 42, 0.12);
  color: #0f172a;
  box-shadow: none;
}

.nav-btn.secondary {
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.15);
  color: #0f172a;
}

.nav-btn.primary {
  background: linear-gradient(135deg, #0090d9, #0ccbaf);
  color: #fff;
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
