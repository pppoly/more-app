<template>
  <section class="note-editor">
    <header class="note-editor__nav">
      <button type="button" class="nav-btn ghost" @click="handleCancel">取消</button>
      <p>活动详情</p>
      <button type="button" class="nav-btn primary" @click="handleSave">
        {{ saving ? '保存中…' : '完成' }}
      </button>
    </header>

    <div class="note-editor__meta">
      <span>{{ todayLabel }}</span>
      <span>{{ charCount }} 字</span>
    </div>

    <section class="note-editor__blocks">
      <div v-for="(block, index) in blocks" :key="block.id" class="note-block">
        <div
          class="note-block__actions"
          v-if="block.type === 'text' && shouldShowAction(block, 'before', index)"
        >
          <button type="button" class="insert-btn ghost" @click="triggerImagePicker(block.id, 'before')">
            ＋ 在这里插入图片
          </button>
        </div>
        <div
          class="note-block__actions"
          v-if="block.type === 'image'"
        >
          <button type="button" class="insert-btn ghost" @click="insertTextBlock(block.id, 'before')">
            ＋ 在这里添加文字
          </button>
        </div>
        <textarea
          v-if="block.type === 'text'"
          v-model="block.value"
          class="note-textarea"
          :placeholder="index === 0 ? '像 iOS 备忘录一样，讲述你的活动故事…' : '继续输入...'"
          :data-block-id="block.id"
          @focus="captureCaret(block.id, $event)"
          @click="captureCaret(block.id, $event)"
          @keyup="captureCaret(block.id, $event)"
          @input="captureCaret(block.id, $event)"
        ></textarea>
        <div v-else class="note-image">
          <img :src="block.src" alt="note image" />
          <button type="button" class="note-photo__delete" @click="removeBlock(block.id)">×</button>
        </div>
        <div
          class="note-block__actions"
          v-if="block.type === 'text' && shouldShowAction(block, 'after', index)"
        >
          <button type="button" class="insert-btn ghost" @click="triggerImagePicker(block.id, 'after')">
            ＋ 在这里插入图片
          </button>
        </div>
        <div
          class="note-block__actions"
          v-if="block.type === 'image'"
        >
          <button type="button" class="insert-btn ghost" @click="insertTextBlock(block.id, 'after')">
            ＋ 在这里添加文字
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
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
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
const MAX_NOTE_IMAGE_SIZE = 5 * 1024 * 1024;

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

const createTextBlock = (value = ''): NoteBlock => ({
  id: `text-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type: 'text',
  value,
});

const createImageBlock = (src: string): NoteBlock => ({
  id: `image-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type: 'image',
  src,
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
          list.push(createImageBlock(img.getAttribute('src')!));
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
      initial.push(createImageBlock(img.src));
    });
  }
  blocks.value = initial;
  ensureTextBlockExists();
};

initBlocks();

const captureCaret = (blockId: string, event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  textSelections.value = {
    ...textSelections.value,
    [blockId]: target.selectionStart ?? (target.value?.length ?? 0),
  };
};

const triggerImagePicker = (blockId: string | null, position: 'before' | 'after' = 'after') => {
  pendingInsertTarget.value = { blockId, position };
  if (blocks.value.filter((block) => block.type === 'image').length >= MAX_NOTE_IMAGES) {
    statusMessage.value = '最多上传 9 张图片';
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

const handleImagePick = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (!input.files) return;
  const imageCount = blocks.value.filter((block) => block.type === 'image').length;
  const available = MAX_NOTE_IMAGES - imageCount;
  if (available <= 0) {
    statusMessage.value = '最多上传 9 张图片';
    input.value = '';
    return;
  }
  const files = Array.from(input.files).slice(0, available);
  for (const file of files) {
    if (!file.type?.startsWith('image/')) {
      statusMessage.value = '仅支持上传图片文件';
      continue;
    }
    if (file.size > MAX_NOTE_IMAGE_SIZE) {
      statusMessage.value = '图片太大，换一张小一点的试试';
      continue;
    }
    try {
      const src = await readFileAsDataUrl(file);
      insertImageBlock(src);
      statusMessage.value = '';
    } catch {
      statusMessage.value = '图片读取失败，换一张再试试';
    }
  }
  input.value = '';
};

const findInsertIndex = () => {
  const target = pendingInsertTarget.value;
  if (!target.blockId) {
    return target.position === 'before' ? 0 : blocks.value.length;
  }
  const index = blocks.value.findIndex((block) => block.id === target.blockId);
  if (index === -1) {
    return target.position === 'before' ? 0 : blocks.value.length;
  }
  return target.position === 'before' ? index : index + 1;
};

const splitTextBlockAtSelection = (blockIndex: number) => {
  const block = blocks.value[blockIndex];
  if (!block || block.type !== 'text') return { insertIndex: blockIndex, trailingBlock: null };
  const caret = textSelections.value[block.id] ?? block.value.length;
  if (caret <= 0 || caret >= block.value.length) {
    return { insertIndex: blockIndex, trailingBlock: null };
  }
  const before = block.value.slice(0, caret);
  const after = block.value.slice(caret);
  block.value = before;
  const trailingBlock = createTextBlock(after);
  blocks.value.splice(blockIndex + 1, 0, trailingBlock);
  return { insertIndex: blockIndex, trailingBlock };
};

const insertImageBlock = (src: string) => {
  const target = pendingInsertTarget.value;
  if (!target.blockId) {
    const insertIndex = target.position === 'before' ? 0 : blocks.value.length;
    blocks.value.splice(insertIndex, 0, createImageBlock(src));
    ensureTextBlockExists();
    pendingInsertTarget.value = { blockId: null, position: 'after' };
    return;
  }
  const index = blocks.value.findIndex((block) => block.id === target.blockId);
  if (index === -1) {
    blocks.value.push(createImageBlock(src));
    ensureTextBlockExists();
    pendingInsertTarget.value = { blockId: null, position: 'after' };
    return;
  }
  if (blocks.value[index].type === 'text') {
    const { insertIndex, trailingBlock } = splitTextBlockAtSelection(index);
    let insertPosition = insertIndex + (target.position === 'before' ? 0 : 1);
    if (trailingBlock && target.position === 'after') {
      insertPosition += 1;
    }
    blocks.value.splice(insertPosition, 0, createImageBlock(src));
  } else {
    const insertPosition = target.position === 'before' ? index : index + 1;
    blocks.value.splice(insertPosition, 0, createImageBlock(src));
  }
  ensureTextBlockExists();
  pendingInsertTarget.value = { blockId: null, position: 'after' };
};

const insertTextBlock = (blockId: string | null, position: 'before' | 'after') => {
  const newBlock = createTextBlock();
  if (!blockId) {
    const insertIndex = position === 'before' ? 0 : blocks.value.length;
    blocks.value.splice(insertIndex, 0, newBlock);
    return;
  }
  const index = blocks.value.findIndex((block) => block.id === blockId);
  if (index === -1) {
    blocks.value.splice(position === 'before' ? 0 : blocks.value.length, 0, newBlock);
    return;
  }
  const insertIndex = position === 'before' ? index : index + 1;
  blocks.value.splice(insertIndex, 0, newBlock);
};

const removeBlock = (blockId: string) => {
  blocks.value = blocks.value.filter((block) => block.id !== blockId);
  ensureTextBlockExists();
};

const shouldShowAction = (block: NoteBlock, position: 'before' | 'after', index: number) => {
  if (block.type === 'text') {
    const neighbor =
      position === 'before' ? blocks.value[index - 1] : blocks.value[index + 1];
    if (neighbor?.type === 'image') {
      return false;
    }
  }
  return true;
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
        return `<figure class="note-image"><img src="${block.src}" alt="活动详情图片" /></figure>`;
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

const handleCancel = () => {
  navigateBackToForm();
};

const handleSave = () => {
  if (saving.value) return;
  saving.value = true;
  const payload = {
    text: buildPlainText(),
    html: buildHtmlFromBlocks(),
    images: collectImages(),
  };
  sessionStorage.setItem(CONSOLE_EVENT_NOTE_RESULT_KEY, JSON.stringify(payload));
  saving.value = false;
  navigateBackToForm();
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
  justify-content: space-between;
  color: rgba(15, 23, 42, 0.5);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
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

.note-block__actions {
  display: flex;
  justify-content: flex-start;
}

.note-editor__hint {
  font-size: 13px;
  color: rgba(15, 23, 42, 0.5);
}

.note-editor__status {
  font-size: 13px;
  color: #d93838;
}

.insert-btn {
  border-radius: 16px;
  border: none;
  padding: 12px;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.1);
  width: 100%;
}

.insert-btn.primary {
  background: rgba(15, 23, 42, 0.85);
  color: #fff;
}

.insert-btn.ghost {
  background: rgba(255, 255, 255, 0.85);
  color: rgba(15, 23, 42, 0.8);
  border: 1px dashed rgba(15, 23, 42, 0.2);
  width: auto;
  padding: 8px 14px;
  box-shadow: none;
}

.hidden-input {
  display: none;
}
</style>
