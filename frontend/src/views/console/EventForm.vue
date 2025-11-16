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
    <section class="ai-panel">
      <div class="ai-panel-header">
        <div>
          <h3>AI 活動助手 (LINE風チャット)</h3>
          <p>いくつか質問に答えると、AI がイベント案内文を提案します。</p>
        </div>
        <button type="button" class="link" @click="chatEnabled = !chatEnabled">
          {{ chatEnabled ? 'AIを折りたたむ' : 'AIチャットを再開する' }}
        </button>
      </div>
      <p class="hint">
        AIを使わずに手動で入力することもできます。その場合は下のフォームをそのままご利用ください。
      </p>
      <div v-if="chatEnabled" class="chat-wrapper">
        <div class="chat-messages">
          <div
            v-for="(message, index) in chatMessages"
            :key="index"
            :class="['chat-bubble', message.role]
          ">
            <span>{{ message.text }}</span>
          </div>
          <div v-if="aiLoading" class="chat-bubble ai-loading">AIが文章を考えています...</div>
        </div>
        <div class="chat-actions">
          <input
            v-model="chatInput"
            type="text"
            class="chat-input"
            placeholder="回答を入力..."
            @keyup.enter="sendCurrentChat"
            :disabled="aiLoading"
          />
          <button type="button" class="primary" @click="sendCurrentChat" :disabled="aiLoading">送信</button>
          <button type="button" class="ghost" @click="requestGeneration" :disabled="aiLoading">
            直接生成
          </button>
        </div>
      </div>
      <div v-else class="hint">AI はいつでも再開できます。必要であればフォームを直接ご記入ください。</div>

      <div v-if="aiResult" class="ai-preview-card">
        <header>
          <h4>AIが提案するイベント案内</h4>
          <div class="preview-actions">
            <button type="button" class="primary" @click="applyAiToForm">この内容をフォームに反映する</button>
            <button type="button" class="secondary" @click="requestGeneration" :disabled="aiLoading">再生成</button>
          </div>
        </header>
        <dl>
          <div>
            <dt>AIの理解</dt>
            <dd>{{ aiResult.summary }}</dd>
          </div>
          <div>
            <dt>タイトル案</dt>
            <dd>{{ extractText(aiResult.title) }}</dd>
          </div>
          <div>
            <dt>イベント紹介文</dt>
            <dd>{{ extractText(aiResult.description) }}</dd>
          </div>
          <div>
            <dt>注意事項</dt>
            <dd>{{ extractText(aiResult.notes) }}</dd>
          </div>
          <div>
            <dt>リスク告知</dt>
            <dd>{{ extractText(aiResult.riskNotice) }}</dd>
          </div>
          <div>
            <dt>SNS 文案</dt>
            <dd>
              LINE: {{ snsCaption('line') }}<br />
              Instagram: {{ snsCaption('instagram') }}
            </dd>
          </div>
        </dl>
      </div>
      <p v-if="aiError" class="status error">{{ aiError }}</p>
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
        <label>
          会場住所 / 集合場所
          <input v-model="form.locationText" type="text" required />
        </label>
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

type ChatRole = 'system' | 'user' | 'aiPreview';
interface ChatMessage {
  role: ChatRole;
  text: string;
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

const chatEnabled = ref(true);
const chatMessages = ref<ChatMessage[]>([{ role: 'system', text: questions[0].prompt }]);
const chatInput = ref('');
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

const sendCurrentChat = () => {
  if (!chatInput.value.trim() || aiLoading.value) return;
  pushMessage('user', chatInput.value.trim());
  handleChatAnswer(chatInput.value.trim());
  chatInput.value = '';
};

const pushMessage = (role: ChatRole, text: string) => {
  chatMessages.value.push({ role, text });
  if (chatMessages.value.length > chatMessagesLimit) {
    chatMessages.value.shift();
  }
};

const handleChatAnswer = (text: string) => {
  if (awaitingConfirmation.value) {
    if (shouldGenerate(text)) {
      requestGeneration();
    } else {
      pushMessage('system', '了解しました。準備ができたら「生成」と入力してください。');
    }
    return;
  }

  const question = questions[currentQuestionIndex.value];
  if (question) {
    (qaState as any)[question.key] = text;
  }

  if (currentQuestionIndex.value < questions.length - 1) {
    currentQuestionIndex.value += 1;
    pushMessage('system', questions[currentQuestionIndex.value].prompt);
  } else {
    awaitingConfirmation.value = true;
    pushMessage(
      'system',
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
    pushMessage('aiPreview', summary);
    awaitingConfirmation.value = false;
  } catch (err) {
    aiError.value = err instanceof Error ? err.message : 'AI生成に失敗しました';
    pushMessage('system', aiError.value ?? 'AI生成に失敗しました。もう一度お試しください。');
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
.ai-panel {
  margin: 1.5rem 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  border: 1px solid #cbd5f5;
  border-radius: 0.75rem;
  padding: 1.5rem;
  background: #f8fafc;
}
.ai-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.link {
  background: transparent;
  border: none;
  color: #2563eb;
  cursor: pointer;
  text-decoration: underline;
}
.chat-wrapper {
  border: 1px solid #cbd5f5;
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: #fff;
}
.chat-messages {
  max-height: 260px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.chat-bubble {
  padding: 0.6rem 0.9rem;
  border-radius: 0.75rem;
  max-width: 80%;
  line-height: 1.4;
  font-size: 0.95rem;
}
.chat-bubble.system {
  background: #e2e8f0;
  align-self: flex-start;
}
.chat-bubble.user {
  background: #dbeafe;
  align-self: flex-end;
}
.chat-bubble.aiPreview {
  background: #fef9c3;
  align-self: center;
  border: 1px solid #fde047;
}
.chat-bubble.ai-loading {
  background: #fff7ed;
  align-self: center;
}
.chat-actions {
  display: flex;
  gap: 0.5rem;
}
.chat-input {
  flex: 1;
  border-radius: 0.5rem;
  border: 1px solid #cbd5f5;
  padding: 0.5rem;
}
.ai-preview-card {
  border: 1px solid #cbd5f5;
  border-radius: 0.75rem;
  background: white;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.ai-preview-card header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.ai-preview-card dl {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.ai-preview-card dt {
  font-weight: 600;
  color: #475569;
}
.ai-preview-card dd {
  margin: 0;
}
.preview-actions {
  display: flex;
  gap: 0.5rem;
}
</style>
