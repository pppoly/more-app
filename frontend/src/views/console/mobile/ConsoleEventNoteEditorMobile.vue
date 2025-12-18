<template>
  <section class="note-editor">
    <header class="note-editor__nav">
      <button type="button" class="nav-btn ghost" @click="handleCancel">キャンセル</button>
      <p>イベント詳細</p>
      <button type="button" class="nav-btn primary" @click="handleSave">
        {{ saving ? '保存中…' : '完了' }}
      </button>
    </header>

    <div class="note-editor__meta">
      <div class="note-meta-stats">
        <span>{{ saveStatus || todayLabel }}</span>
        <span class="note-meta-muted">{{ charCount }} 文字</span>
      </div>
    </div>

    <section class="note-editor__blocks" @click="focusBody">
      <div v-for="(block, index) in blocks" :key="block.id" class="note-block">
        <textarea
          v-if="block.type === 'text'"
          v-model="block.value"
          class="note-textarea"
          :placeholder="index === 0 ? 'ここにイベントの詳細・流れ・注意事項を書いてください（箇条書きでもOK）' : '続けて入力...'"
          :data-block-id="block.id"
          @focus="captureCaret(block.id, $event)"
          @click="captureCaret(block.id, $event)"
          @keyup="captureCaret(block.id, $event)"
          @input="captureCaret(block.id, $event)"
        ></textarea>
        <div v-else class="note-image" :data-block-id="block.id" @click="selectImage(block.id)">
          <img :src="block.src" alt="note image" />
          <button
            v-if="selectedImageId === block.id"
            type="button"
            class="note-photo__delete"
            @click.stop="removeBlock(block.id)"
          >
            ×
          </button>
        </div>
      </div>
    </section>

    <p v-if="statusMessage" class="note-editor__status">{{ statusMessage }}</p>

    <input
      ref="fileInputRef"
      type="file"
      multiple
      accept="image/*"
      class="hidden-input"
      @change="handleImagePick"
    />

    <div class="note-floating-actions">
      <button type="button" class="floating-add" @click="triggerImagePicker(lastFocusedTextId, 'after')">
        ＋
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  CONSOLE_EVENT_NOTE_CONTEXT_KEY,
  CONSOLE_EVENT_NOTE_RESULT_KEY,
} from '../../../constants/console';

type NoteBlock =
  | {
      id: string;
      type: 'text';
      value: string;
    }
  | {
      id: string;
      type: 'image';
      src: string;
    };

interface LegacyNoteImage {
  id: string;
  src: string;
}

const MAX_NOTE_IMAGES = 9;
// raw file size limit lowered to prevent payload blowup on event submit
const MAX_NOTE_IMAGE_SIZE = 2 * 1024 * 1024;

const router = useRouter();
const route = useRoute();
const currentCommunityId = route.params.communityId as string | undefined;
const currentEventId = route.query.eventId as string | undefined;

const parseContext = (): { text?: string; html?: string; images?: LegacyNoteImage[] } => {
  try {
    const raw = sessionStorage.getItem(CONSOLE_EVENT_NOTE_CONTEXT_KEY);
    if (!raw) return {};
    sessionStorage.removeItem(CONSOLE_EVENT_NOTE_CONTEXT_KEY);
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const context = parseContext();
const blocks = ref<NoteBlock[]>([]);
const statusMessage = ref('');
const saving = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const textSelections = ref<Record<string, number>>({});
const pendingInsertTarget = ref<{ blockId: string | null; position: 'before' | 'after' }>({
  blockId: null,
  position: 'after',
});
const lastFocusedTextId = ref<string | null>(null);
const selectedImageId = ref<string | null>(null);
const saveStatus = ref('');
const saveTimer = ref<number | null>(null);
const debounceTimer = ref<number | null>(null);

const todayLabel = new Intl.DateTimeFormat('ja-JP', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
}).format(new Date());

const charCount = computed(() =>
  blocks.value
    .filter((block) => block.type === 'text')
    .reduce((sum, block) => sum + block.value.trim().length, 0),
);

const createId = () => Math.random().toString(36).slice(2, 9);

const createTextBlock = (value = ''): NoteBlock => ({
  id: `text-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type: 'text',
  value,
});

const ensureTextBlockExists = () => {
  if (!blocks.value.length) {
    blocks.value.push(createTextBlock());
    return;
  }
  if (blocks.value.every((block) => block.type === 'image')) {
    blocks.value.unshift(createTextBlock());
  }
};

const parseHtmlToBlocks = (html: string): NoteBlock[] => {
  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') return [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const list: NoteBlock[] = [];
    doc.body.childNodes.forEach((node) => {
      if (node.nodeName === 'P') {
        const element = node as HTMLElement;
        const normalized = element.innerHTML.replace(/<br\s*\/?>/gi, '\n');
        const plain = normalized.replace(/<[^>]+>/g, '');
        list.push(createTextBlock(plain));
      } else if (node.nodeName === 'FIGURE') {
        const img = (node as HTMLElement).querySelector('img');
        if (img?.getAttribute('src')) {
          list.push({ id: `image-${createId()}`, type: 'image', src: img.getAttribute('src')! });
        }
      } else if (node.nodeName === '#text') {
        const textContent = node.textContent?.trim();
        if (textContent) {
          list.push(createTextBlock(textContent));
        }
      }
    });
    return list.filter((block) => {
      if (block.type === 'text') {
        return block.value.trim().length > 0;
      }
      return Boolean(block.src);
    });
  } catch {
    return [];
  }
};

const initBlocks = () => {
  let initial: NoteBlock[] = [];
  if (context.html) {
    initial = parseHtmlToBlocks(context.html);
  } else if (context.text) {
    initial = [createTextBlock(context.text)];
  }
  if (!initial.length) {
    initial = [createTextBlock()];
  }
  if (
    context.images &&
    context.images.length &&
    !initial.some((block) => block.type === 'image')
  ) {
    context.images.forEach((img) => {
      initial.push({ id: `image-${createId()}`, type: 'image', src: img.src });
    });
  }
  blocks.value = initial;
  ensureTextBlockExists();
};

initBlocks();
nextTick(() => {
  focusBody();
});

const captureCaret = (blockId: string, event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  textSelections.value = {
    ...textSelections.value,
    [blockId]: target.selectionStart ?? (target.value?.length ?? 0),
  };
  lastFocusedTextId.value = blockId;
  selectedImageId.value = null;
};

const triggerImagePicker = (blockId: string | null, position: 'before' | 'after' = 'after') => {
  const firstText = blocks.value.find((b) => b.type === 'text');
  const targetId = blockId || lastFocusedTextId.value || firstText?.id || null;
  pendingInsertTarget.value = { blockId: targetId, position };
  if (blocks.value.filter((block) => block.type === 'image').length >= MAX_NOTE_IMAGES) {
    statusMessage.value = '画像は最大9枚まで追加できます';
    return;
  }
  fileInputRef.value?.click();
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const compressDataUrl = (dataUrl: string, maxSide = 1100, quality = 0.75) =>
  new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const longest = Math.max(width, height);
      const scale = longest > maxSide ? maxSide / longest : 1;
      const targetW = Math.max(1, Math.round(width * scale));
      const targetH = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);
      const output = canvas.toDataURL('image/jpeg', quality);
      resolve(output.length < dataUrl.length ? output : dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

const handleImagePick = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (!input.files) return;
  const imageCount = blocks.value.filter((block) => block.type === 'image').length;
  const available = MAX_NOTE_IMAGES - imageCount;
  if (available <= 0) {
    statusMessage.value = '画像は最大9枚まで追加できます';
    input.value = '';
    return;
  }
  const files = Array.from(input.files).slice(0, available);
  for (const file of files) {
    if (!file.type?.startsWith('image/')) {
      statusMessage.value = '画像ファイルのみ対応しています';
      continue;
    }
    if (file.size > MAX_NOTE_IMAGE_SIZE) {
      statusMessage.value = '画像サイズが大きすぎます。小さめの画像をお試しください';
      continue;
    }
    try {
      let src = await readFileAsDataUrl(file);
      src = await compressDataUrl(src, 1000, 0.72);
      if (src.length > 600 * 1024) {
        statusMessage.value = '画像サイズが大きすぎます。1000px 以下・圧縮後600KB以下にしてください';
        continue;
      }
      insertImageAtCursor(src, pendingInsertTarget.value.blockId, pendingInsertTarget.value.position);
      statusMessage.value = '';
    } catch {
      statusMessage.value = '画像の読み込みに失敗しました。別の画像をお試しください';
    }
  }
  input.value = '';
  pendingInsertTarget.value = { blockId: null, position: 'after' };
};

const insertImageAtCursor = (src: string, blockId: string | null, position: 'before' | 'after') => {
  if (!blockId) {
    const insertIndex = position === 'before' ? 0 : blocks.value.length;
    const newId = createId();
    blocks.value.splice(insertIndex, 0, { id: `image-${newId}`, type: 'image', src });
    ensureTextBlockExists();
    nextTick(() => scrollToBlock(`image-${newId}`));
    return;
  }
  const index = blocks.value.findIndex((block) => block.id === blockId);
  if (index === -1 || blocks.value[index].type !== 'text') {
    const newId = createId();
    blocks.value.push({ id: `image-${newId}`, type: 'image', src });
    ensureTextBlockExists();
    nextTick(() => scrollToBlock(`image-${newId}`));
    return;
  }
  const target = blocks.value[index] as Extract<NoteBlock, { type: 'text' }>;
  const caret = textSelections.value[target.id] ?? target.value.length;
  let before = target.value.slice(0, caret);
  let after = target.value.slice(caret);
  if (before && !before.endsWith('\n')) {
    before = `${before}\n`;
  }
  if (after && !after.startsWith('\n')) {
    after = `\n${after}`;
  }
  // 先更新当前块为前半段（可为空）
  blocks.value[index] = { ...target, value: before };
  const newId = createId();
  // 画像ブロックをその直後に入れる
  blocks.value.splice(index + 1, 0, { id: `image-${newId}`, type: 'image', src });
  // 後半があれば新しいテキストブロックとして続ける
  if (after) {
    blocks.value.splice(index + 2, 0, createTextBlock(after));
  }
  nextTick(() => scrollToBlock(`image-${newId}`));
};

const scrollToBlock = (id: string) => {
  const el = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};

const removeBlock = (blockId: string) => {
  blocks.value = blocks.value.filter((block) => block.id !== blockId);
  ensureTextBlockExists();
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const buildHtmlFromBlocks = () => {
  return blocks.value
    .map((block) => {
      if (block.type === 'text') {
        const paragraphs = block.value
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean);
        if (!paragraphs.length) return '';
        return paragraphs
          .map(
            (paragraph) =>
              `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`,
          )
          .join('');
      }
      if (block.src) {
        return `<figure class="note-image"><img src="${block.src}" alt="イベント詳細画像" /></figure>`;
      }
      return '';
    })
    .filter(Boolean)
    .join('');
};

const buildPlainText = () =>
  blocks.value
    .filter((block) => block.type === 'text')
    .map((block) => block.value.trim())
    .filter(Boolean)
    .join('\n\n');

const collectImages = (): LegacyNoteImage[] =>
  blocks.value
    .filter((block): block is Extract<NoteBlock, { type: 'image' }> => block.type === 'image')
    .map((block) => ({
      id: block.id,
      src: block.src,
    }));

const navigateBackToForm = () => {
  if (!currentCommunityId) {
    router.back();
    return;
  }
  router.replace({
    name: 'ConsoleMobileEventForm',
    params: { communityId: currentCommunityId },
    query: currentEventId ? { eventId: currentEventId } : undefined,
  });
};

const buildPayload = () => ({
  text: buildPlainText(),
  html: buildHtmlFromBlocks(),
  images: collectImages(),
});

let lastSaved = '';
const saveDraft = (silent = false) => {
  try {
    const payload = buildPayload();
    const serialized = JSON.stringify(payload);
    // 4MB 目安で保存をスキップし、クラッシュを防ぐ
    if (serialized.length > 4 * 1024 * 1024) {
      statusMessage.value = '保存できません（容量が大きすぎます）。画像を減らしてください。';
      saveStatus.value = '';
      return;
    }
    sessionStorage.setItem(CONSOLE_EVENT_NOTE_RESULT_KEY, serialized);
    lastSaved = serialized;
    const time = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    saveStatus.value = `保存済み ${time}`;
  } catch (err) {
    statusMessage.value = '保存できません（容量制限）。画像を減らしてください。';
    return;
  }
  if (saveTimer.value) window.clearTimeout(saveTimer.value);
  if (!silent) {
    saveTimer.value = window.setTimeout(() => {
      saveStatus.value = '';
    }, 1800);
  }
};

watch(
  () => [blocks.value],
  () => {
    if (debounceTimer.value) window.clearTimeout(debounceTimer.value);
    saveStatus.value = '保存中…';
    debounceTimer.value = window.setTimeout(() => saveDraft(true), 800);
  },
  { deep: true },
);

const handleSave = () => {
  if (saving.value) return;
  try {
    const payload = buildPayload();
    const serialized = JSON.stringify(payload);
    if (!lastSaved || serialized !== lastSaved) {
      if (serialized.length > 4 * 1024 * 1024) {
        statusMessage.value = '保存できません（容量が大きすぎます）。画像を減らしてください。';
        return;
      }
      sessionStorage.setItem(CONSOLE_EVENT_NOTE_RESULT_KEY, serialized);
      const time = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date());
      saveStatus.value = `保存済み ${time}`;
      lastSaved = serialized;
    }
  } catch (err) {
    statusMessage.value = '保存できません（容量制限）。画像を減らしてください。';
    return;
  }
  saving.value = false;
  navigateBackToForm();
};

const handleCancel = () => {
  const currentSerialized = JSON.stringify(buildPayload());
  if (lastSaved && currentSerialized !== lastSaved) {
    const confirmLeave = window.confirm('変更を破棄しますか？');
    if (!confirmLeave) return;
  }
  navigateBackToForm();
};

const selectImage = (id: string) => {
  selectedImageId.value = id;
  pendingInsertTarget.value = { blockId: id, position: 'after' };
};

const focusBody = () => {
  const firstTextArea = document.querySelector<HTMLTextAreaElement>('.note-textarea');
  if (firstTextArea) {
    firstTextArea.focus();
    const len = firstTextArea.value.length;
    firstTextArea.setSelectionRange(len, len);
    const id = firstTextArea.dataset.blockId;
    if (id) {
      lastFocusedTextId.value = id;
      textSelections.value = { ...textSelections.value, [id]: len };
    }
  }
};

</script>

<style scoped>
.note-editor {
  min-height: 100vh;
  background: #f5f7fb;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 18px calc(env(safe-area-inset-bottom, 0px) + 24px);
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.note-editor__nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nav-btn {
  border: none;
  border-radius: 999px;
  padding: 10px 18px;
  font-size: 15px;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}

.nav-btn.ghost {
  background: rgba(255, 255, 255, 0.85);
  color: #0f172a;
}

.nav-btn.primary {
  background: #0f3057;
  color: #fff;
}

.note-editor__nav p {
  font-weight: 600;
  letter-spacing: 0.05em;
}

.note-editor__meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.note-meta-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: rgba(15, 23, 42, 0.5);
  font-size: 13px;
  letter-spacing: 0.08em;
}

.note-meta-muted {
  color: rgba(15, 23, 42, 0.5);
}

.note-editor__blocks {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.note-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.note-textarea {
  width: 100%;
  min-height: 160px;
  border: none;
  outline: none;
  font-size: 18px;
  line-height: 1.6;
  background: transparent;
  resize: none;
  color: #0f172a;
}

.note-textarea::placeholder {
  color: rgba(15, 23, 42, 0.35);
}

.note-image {
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  position: relative;
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.15);
}

.note-image img {
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
}

.note-photo__delete {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: none;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 16px;
  line-height: 1;
}

.note-editor__hint {
  font-size: 13px;
  color: rgba(15, 23, 42, 0.5);
}

.note-editor__status {
  font-size: 13px;
  color: #d93838;
  background: #fff5f5;
  padding: 8px 10px;
  border-radius: 10px;
}

.hidden-input {
  display: none;
}

.note-floating-actions {
  position: fixed;
  right: 18px;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
}

.floating-add {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #4f8ef8, #6e66ff);
  color: #fff;
  font-size: 26px;
  box-shadow: 0 10px 30px rgba(26, 40, 77, 0.25);
}
</style>
