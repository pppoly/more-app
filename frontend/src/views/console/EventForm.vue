<template>
  <section class="console-section">
    <header class="section-header">
      <div>
        <h2>{{ isEdit ? 'イベント編集' : 'イベント作成' }}</h2>
        <p>{{ subtitle }}</p>
      </div>
      <RouterLink :to="backLink">戻る</RouterLink>
    </header>

    <!-- AI Assistant (chat style) -->
<section class="mt-4 rounded-2xl bg-white shadow-sm overflow-hidden flex flex-col h-[420px]">
  <header class="px-3 py-2 border-b flex items-center justify-between">
    <div class="text-xs font-semibold text-slate-700">AI 活動アシスタント</div>
    <div class="text-[10px] text-slate-400">企画の相談・文案作成に使えます</div>
  </header>
  <div class="flex-1 px-3 py-2 bg-[#F5F7F9] overflow-y-auto space-y-2">
    <div v-for="msg in chatMessagesV2" :key="msg.id" :class="msg.role === 'user' ? 'text-right' : 'text-left'">
      <div
        v-if="msg.type === 'text'"
        :class="[
          'inline-block px-3 py-2 text-sm rounded-2xl max-w-[80%] text-left whitespace-pre-line',
          msg.role === 'user' ? 'bg-[#00B900] text-white ml-auto' : 'bg-white text-slate-800 shadow-sm',
        ]"
      >
        {{ msg.content }}
      </div>
      <div v-else-if="msg.type === 'proposal'" class="inline-block bg-white rounded-2xl p-3 shadow-sm max-w-[90%] text-left">
        <h3 class="text-xs text-slate-500 mb-1">AI 提案のイベント概要</h3>
        <p class="text-sm font-semibold mb-1">{{ msg.payload?.title }}</p>
        <p class="text-xs text-slate-600 whitespace-pre-line mb-2">{{ msg.payload?.description }}</p>
        <button class="w-full mt-1 py-1.5 text-xs rounded-full bg-[#00B900] text-white" @click="applyAiResultToFormFromMsg(msg)">
          この内容をフォームに反映する
        </button>
      </div>
      <div class="mt-0.5 text-[10px] text-slate-400" v-if="msg.createdAt">{{ msg.createdAt }}</div>
    </div>
    <div v-if="aiLoading" class="text-xs text-slate-500">AIが文章を考えています...</div>
  </div>
  <div v-if="aiError" class="px-3 text-[11px] text-rose-500">
    {{ aiError }}
  </div>
  <div class="flex items-center px-3 py-2 bg-white border-t border-slate-200">
    <button class="w-8 h-8 flex items-center justify-center text-slate-500" @click="requestGeneration">
      <span class="i-lucide-plus"></span>
    </button>
    <input
      v-model="chatDraft"
      type="text"
      class="flex-1 mx-2 px-3 py-2 rounded-full bg-slate-100 text-sm outline-none"
      placeholder="想举办什么样的活动？（例：親子BBQ・語学交換など）"
      @keyup.enter="handleSend"
    />
    <button
      class="w-8 h-8 flex items-center justify-center rounded-full"
      :class="chatDraft ? 'bg-[#00B900] text-white' : 'bg-slate-200 text-slate-500'"
      @click="handleSend"
      :disabled="!chatDraft || aiLoading"
    >
      <span class="i-lucide-send"></span>
    </button>
  </div>
</section>

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
  generateEventContent,
  uploadEventCovers,
  fetchEventGallery,
} from '../../api/client';
import type { GeneratedEventContent, RegistrationFormField, EventGalleryItem } from '../../types/api';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';
import LocationPicker from '../../components/console/LocationPicker.vue';

type ChatRole = 'user' | 'assistant';
type ChatMessageType = 'text' | 'proposal';
interface ChatMessage {
  id: string;
  role: ChatRole;
  type: ChatMessageType;
  content: string;
  createdAt: string;
  payload?: {
    title?: string;
    description?: string;
    raw?: (GeneratedEventContent & { summary?: string }) | null;
  };
}
interface BuilderField extends RegistrationFormField {
  uuid: string;
  optionsText?: string;
}

const route = useRoute();
const router = useRouter();
const communityId = route.params.communityId as string | undefined;
const eventId = route.params.eventId as string | undefined;
const isEdit = computed(() => Boolean(eventId));

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

const qaState = reactive({
  baseLanguage: '',
  topic: '',
  audience: '',
  style: '',
  details: '',
});

const questions = [
  {
    key: 'baseLanguage',
    prompt: 'こんにちは！まず、どの言語で考えたいですか？（日本語 / 中文 / English）',
  },
  {
    key: 'topic',
    prompt: 'これはどんなイベントですか？（例：親子自然探検、言語交換カフェなど）',
  },
  {
    key: 'audience',
    prompt: '主な対象者を教えてください。（例：3〜8歳の子どもを持つ多文化家庭）',
  },
  {
    key: 'style',
    prompt: 'イベントの雰囲気やスタイルは？（family-friendly / casual / formal など）',
  },
  {
    key: 'details',
    prompt: '場所・所要時間・持ち物など、自由に補足してください。',
  },
];

const formatTime = () => new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
const chatMessagesV2 = ref<ChatMessage[]>([]);
const chatDraft = ref('');
const currentQuestionIndex = ref(0);
const awaitingConfirmation = ref(false);
const chatMessagesLimit = 200;

const aiLoading = ref(false);
const aiError = ref<string | null>(null);
const aiResult = ref<(GeneratedEventContent & { summary: string }) | null>(null);

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

const extractText = (content: any) => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object') return content.original ?? '';
  return '';
};

const snsCaption = (channel: 'line' | 'instagram') => {
  if (!aiResult.value) return '';
  const lang = qaState.baseLanguage || 'ja';
  const captions = aiResult.value.snsCaptions?.[channel];
  if (!captions) return '';
  return captions[lang] || captions.ja || Object.values(captions)[0] || '';
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

const buildRegistrationSchema = () =>
  registrationFields.value
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

const pushMessage = (role: ChatRole, type: ChatMessageType, content: string, payload?: ChatMessage['payload']) => {
  chatMessagesV2.value.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    type,
    content,
    createdAt: formatTime(),
    payload,
  });
  if (chatMessagesV2.value.length > chatMessagesLimit) {
    chatMessagesV2.value.shift();
  }
};

const handleSend = () => {
  if (!chatDraft.value.trim() || aiLoading.value) return;
  const content = chatDraft.value.trim();
  chatDraft.value = '';
  pushMessage('user', 'text', content);
  handleChatAnswer(content);
};

const handleChatAnswer = (text: string) => {
  if (awaitingConfirmation.value) {
    if (shouldGenerate(text)) {
      pushMessage('assistant', 'text', '了解しました。少々お待ちください。');
      requestGeneration();
    } else {
      pushMessage('assistant', 'text', '了解しました。準備ができたら「生成」と入力してください。');
    }
    return;
  }

  const question = questions[currentQuestionIndex.value];
  if (question) {
    (qaState as any)[question.key] = text;
  }

  if (currentQuestionIndex.value < questions.length - 1) {
    currentQuestionIndex.value += 1;
    pushMessage('assistant', 'text', questions[currentQuestionIndex.value].prompt);
  } else {
    awaitingConfirmation.value = true;
    pushMessage(
      'assistant',
      'text',
      'ありがとう！この内容をもとにAIでイベント案内文を作成しても良いですか？「生成」や「再入力」など自由に回答してください。',
    );
  }
};

const shouldGenerate = (text: string) => {
  const normalized = text.trim().toLowerCase();
  const positiveWords = ['生成', 'はい', 'yes', 'ok', '好的', '好', 'go', 'start'];
  return positiveWords.some((word) => normalized.includes(word) || text.includes(word));
};

const requestGeneration = async () => {
  const payload = {
    baseLanguage: qaState.baseLanguage || 'ja',
    topic: qaState.topic || form.title || 'コミュニティイベント',
    audience: qaState.audience || '地域の仲間',
    style: qaState.style || 'family-friendly',
    details: qaState.details || form.description || form.descriptionHtml || '詳細未定',
  };
  aiLoading.value = true;
  aiError.value = null;
  try {
    const result = await generateEventContent(payload);
    const summary = buildSummary(payload);
    aiResult.value = { ...result, summary };
    pushMessage('assistant', 'text', summary);
    pushMessage('assistant', 'text', 'こちらがAI案です。内容を確認してください。');
    pushMessage('assistant', 'proposal', '', {
      title: extractText(result.title),
      description: extractText(result.description),
      raw: aiResult.value,
    });
    awaitingConfirmation.value = false;
  } catch (err) {
    aiError.value = err instanceof Error ? err.message : 'AI生成に失敗しました';
    pushMessage('assistant', 'text', aiError.value ?? 'AI生成に失敗しました。もう一度お試しください。');
  } finally {
    aiLoading.value = false;
  }
};

const buildSummary = (state: typeof qaState) => {
  const lang = state.baseLanguage || 'ja';
  return `AIの理解：これは「${state.audience || '地域の参加者'}」向けの「${state.topic || 'コミュニティ活動'}」イベントで、雰囲気は「${state.style || 'カジュアル'}」。主な内容は「${state.details || '主催者のオリジナル企画'}」というイメージです。（${lang}ベース）`;
};

const applyAiToForm = () => {
  if (!aiResult.value) return;
  const title = extractText(aiResult.value.title);
  const description = extractText(aiResult.value.description);
  if (title) {
    form.title = title;
  }
  if (description) {
    form.description = description;
    form.descriptionHtml = `<p>${description}</p>`;
  }
  const notes = extractText(aiResult.value.notes);
  if (notes) {
    form.config.notes = notes;
  }
  const risk = extractText(aiResult.value.riskNotice);
  if (risk) {
    form.config.riskNoticeText = risk;
  }
};

const applyAiResultToFormFromMsg = (msg: ChatMessage) => {
  if (msg.type !== 'proposal' || !msg.payload) return;
  if (msg.payload.raw) {
    aiResult.value = msg.payload.raw;
    applyAiToForm();
    return;
  }
  if (msg.payload.title) {
    form.title = msg.payload.title;
  }
  if (msg.payload.description) {
    form.description = msg.payload.description;
    form.descriptionHtml = `<p>${msg.payload.description}</p>`;
  }
};

onMounted(() => {
  if (!chatMessagesV2.value.length) {
    pushMessage('assistant', 'text', questions[0].prompt);
  }
});

onMounted(() => {
  load();
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
</style>
