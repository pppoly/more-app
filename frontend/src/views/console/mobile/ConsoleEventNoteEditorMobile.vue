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

    <section class="note-editor__blocks" @click.self="handleBlockAreaClick">
      <div v-for="(block, index) in blocks" :key="block.id" class="note-block">
        <template v-if="block.type === 'text'">
          <textarea
            v-model="block.value"
            class="note-textarea"
            :placeholder="index === 0 ? 'ここにイベントの詳細・流れ・注意事項を書いてください（箇条書きでもOK）' : '続けて入力...'"
            :data-block-id="block.id"
            @focus="captureCaret(block.id, $event)"
            @click="captureCaret(block.id, $event)"
            @keyup="captureCaret(block.id, $event)"
            @input="handleTextInput(block.id, $event)"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd(block.id, $event)"
          ></textarea>
        </template>
        <template v-else>
          <div
            class="note-image"
            :data-block-id="block.id"
            @click="handleImageTap(block.id, $event)"
          >
            <img :src="block.src" alt="note image" />
          </div>
          <div v-if="selectedImageId === block.id" class="note-image__actions">
            <button
              type="button"
              class="note-image__action"
              :class="{ 'is-disabled': !canMoveImage(block.id, 'up') }"
              :disabled="!canMoveImage(block.id, 'up')"
              @click.stop="moveImage(block.id, 'up')"
            >
              上へ
            </button>
            <button
              type="button"
              class="note-image__action"
              :class="{ 'is-disabled': !canMoveImage(block.id, 'down') }"
              :disabled="!canMoveImage(block.id, 'down')"
              @click.stop="moveImage(block.id, 'down')"
            >
              下へ
            </button>
            <button
              type="button"
              class="note-image__action note-image__action--danger"
              @click.stop="removeBlock(block.id)"
            >
              削除
            </button>
          </div>
        </template>
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
      <button type="button" class="floating-add" @click="triggerImagePicker()">
        ＋
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  CONSOLE_EVENT_NOTE_CONTEXT_KEY,
  CONSOLE_EVENT_NOTE_RESULT_KEY,
  CONSOLE_EVENT_NOTE_RETURN_KEY,
} from '../../../constants/console';

type NoteBlock =
  | {
      id: string;
      type: 'text';
      value: string;
      rawHtml?: string;
      rawText?: string;
      rawHtmlIsBlock?: boolean;
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
// allow up to 10MB per image; compression still applied
const MAX_NOTE_IMAGE_SIZE = 10 * 1024 * 1024;

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
// Keep original HTML for untouched blocks to avoid losing formatting.
const originalHtml = context.html ?? '';
const allowOriginalHtml = ref(true);
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
const initialSnapshot = ref('');
const isComposing = ref(false);
const lastInsertTargetId = ref<string | null>(null);
const initialPayloadSnapshot = ref('');

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

const normalizeText = (value: string) => value.replace(/\r\n/g, '\n').trim();

const extractPlainText = (html: string) =>
  html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');

const createTextBlock = (
  value = '',
  options: {
    rawHtml?: string;
    rawText?: string;
    rawHtmlIsBlock?: boolean;
  } = {},
): NoteBlock => ({
  id: `text-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type: 'text',
  value,
  ...options,
});

const serializeBlocks = (list: NoteBlock[]) =>
  list
    .map((block) =>
      block.type === 'text'
        ? `t:${normalizeText(block.value)}`
        : `i:${block.src}`,
    )
    .join('|');

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
        const plain = extractPlainText(element.innerHTML);
        list.push(
          createTextBlock(plain, {
            rawHtml: element.innerHTML,
            rawText: plain,
            rawHtmlIsBlock: false,
          }),
        );
      } else if (node.nodeName === 'UL' || node.nodeName === 'OL') {
        const element = node as HTMLElement;
        const items = Array.from(element.querySelectorAll('li'))
          .map((li) => li.textContent?.trim() ?? '')
          .filter(Boolean);
        if (items.length) {
          const isOrdered = node.nodeName === 'OL';
          const text = items
            .map((item, index) => (isOrdered ? `${index + 1}. ${item}` : `・ ${item}`))
            .join('\n');
          list.push(
            createTextBlock(text, {
              rawHtml: element.outerHTML,
              rawText: text,
              rawHtmlIsBlock: true,
            }),
          );
        }
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
  const shouldInjectImages =
    context.images &&
    context.images.length &&
    !initial.some((block) => block.type === 'image');
  if (shouldInjectImages) {
    allowOriginalHtml.value = false;
    context.images.forEach((img) => {
      initial.push({ id: `image-${createId()}`, type: 'image', src: img.src });
    });
  }
  blocks.value = initial;
  ensureTextBlockExists();
  initialSnapshot.value = serializeBlocks(blocks.value);
};

initBlocks();
nextTick(() => {
  resizeAllTextareas();
  try {
    const serialized = JSON.stringify(buildPayload());
    initialPayloadSnapshot.value = serialized;
    lastSaved = serialized;
  } catch {
    initialPayloadSnapshot.value = '';
  }
  if (shouldAutoFocus()) {
    focusBody({ moveToEnd: true });
  }
});

const updateCaretPosition = (blockId: string, target: HTMLTextAreaElement | null) => {
  if (!target || isComposing.value) return;
  const position = target.selectionStart ?? (target.value?.length ?? 0);
  textSelections.value = {
    ...textSelections.value,
    [blockId]: position,
  };
  lastFocusedTextId.value = blockId;
  lastInsertTargetId.value = null;
  selectedImageId.value = null;
};

const captureCaret = (blockId: string, event: Event) => {
  if (isComposing.value) return;
  const target = event.target as HTMLTextAreaElement | null;
  if (!target) return;
  // Delay one frame to read the updated caret position on mobile.
  window.requestAnimationFrame(() => updateCaretPosition(blockId, target));
};

const handleCompositionStart = () => {
  isComposing.value = true;
};

const handleCompositionEnd = (blockId: string, event: Event) => {
  isComposing.value = false;
  updateCaretPosition(blockId, event.target as HTMLTextAreaElement | null);
  resizeTextarea(event.target as HTMLTextAreaElement | null);
};

const resizeTextarea = (target: HTMLTextAreaElement | null) => {
  if (!target) return;
  target.style.height = 'auto';
  target.style.height = `${target.scrollHeight}px`;
};

const resizeAllTextareas = () => {
  if (typeof document === 'undefined') return;
  document
    .querySelectorAll<HTMLTextAreaElement>('.note-textarea')
    .forEach((textarea) => resizeTextarea(textarea));
};

const handleTextInput = (blockId: string, event: Event) => {
  captureCaret(blockId, event);
  resizeTextarea(event.target as HTMLTextAreaElement | null);
};

const focusTextBlock = (blockId: string, position: 'start' | 'end' = 'start') => {
  if (typeof document === 'undefined') return;
  const target = document.querySelector<HTMLTextAreaElement>(`.note-textarea[data-block-id="${blockId}"]`);
  if (!target) return;
  target.focus();
  const pos = position === 'end' ? target.value.length : 0;
  target.setSelectionRange(pos, pos);
  updateCaretPosition(blockId, target);
};

const shouldAutoFocus = () => {
  if (typeof document === 'undefined') return false;
  if (document.activeElement?.tagName === 'TEXTAREA') return false;
  return !blocks.value.some(
    (block) => block.type === 'text' && block.value.trim().length > 0,
  );
};

const focusBody = (options: { restoreSelection?: boolean; moveToEnd?: boolean } = {}) => {
  if (typeof document === 'undefined') return;
  const preferredId = lastFocusedTextId.value;
  const selector = preferredId
    ? `.note-textarea[data-block-id="${preferredId}"]`
    : '.note-textarea';
  const target =
    document.querySelector<HTMLTextAreaElement>(selector)
    || document.querySelector<HTMLTextAreaElement>('.note-textarea');
  if (!target) return;
  if (document.activeElement === target) return;
  target.focus();
  const key = target.dataset.blockId ?? '';
  const savedPos = key ? textSelections.value[key] : undefined;
  if (options.restoreSelection && typeof savedPos === 'number') {
    target.setSelectionRange(savedPos, savedPos);
    updateCaretPosition(key, target);
    return;
  }
  if (options.moveToEnd) {
    const len = target.value.length;
    target.setSelectionRange(len, len);
    updateCaretPosition(key, target);
  }
};

const handleBlockAreaClick = () => {
  if (typeof document === 'undefined') return;
  if (document.activeElement?.classList.contains('note-textarea')) return;
  focusBody({ restoreSelection: true });
};

const focusNeighborTextBlock = (imageId: string, direction: 'before' | 'after') => {
  const index = blocks.value.findIndex((block) => block.id === imageId);
  if (index === -1) return;
  const step = direction === 'before' ? -1 : 1;
  const neighbor = blocks.value[index + step];
  if (neighbor && neighbor.type === 'text') {
    nextTick(() => focusTextBlock(neighbor.id, direction === 'before' ? 'end' : 'start'));
    return;
  }
  const textBlock = createTextBlock();
  const insertIndex = direction === 'before' ? index : index + 1;
  blocks.value.splice(insertIndex, 0, textBlock);
  nextTick(() => focusTextBlock(textBlock.id, direction === 'before' ? 'end' : 'start'));
};

const handleImageTap = (blockId: string, event: MouseEvent | TouchEvent) => {
  const target = event.currentTarget as HTMLElement | null;
  if (!target) {
    selectedImageId.value = blockId;
    return;
  }
  const rect = target.getBoundingClientRect();
  let clientY = 0;
  if ('touches' in event && event.touches.length) {
    clientY = event.touches[0].clientY;
  } else if ('changedTouches' in event && event.changedTouches.length) {
    clientY = event.changedTouches[0].clientY;
  } else if ('clientY' in event) {
    clientY = event.clientY;
  }
  const offsetY = clientY - rect.top;
  const edge = rect.height * 0.18;
  if (offsetY <= edge) {
    selectedImageId.value = null;
    focusNeighborTextBlock(blockId, 'before');
    return;
  }
  if (offsetY >= rect.height - edge) {
    selectedImageId.value = null;
    focusNeighborTextBlock(blockId, 'after');
    return;
  }
  selectedImageId.value = blockId;
  lastInsertTargetId.value = blockId;
  pendingInsertTarget.value = { blockId, position: 'after' };
};

const canMoveImage = (blockId: string, direction: 'up' | 'down') => {
  const index = blocks.value.findIndex((block) => block.id === blockId);
  if (index === -1) return false;
  if (direction === 'up') return index > 0;
  return index < blocks.value.length - 1;
};

const moveImage = (blockId: string, direction: 'up' | 'down') => {
  const index = blocks.value.findIndex((block) => block.id === blockId);
  if (index === -1) return;
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= blocks.value.length) return;
  const list = blocks.value;
  [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
  blocks.value = [...list];
  selectedImageId.value = blockId;
  lastInsertTargetId.value = blockId;
  nextTick(() => scrollToBlock(blockId));
};

const handleSelectionChange = () => {
  if (typeof document === 'undefined') return;
  const active = document.activeElement as HTMLTextAreaElement | null;
  if (!active?.classList.contains('note-textarea')) return;
  const blockId = active.dataset.blockId;
  if (!blockId) return;
  updateCaretPosition(blockId, active);
};

onMounted(() => {
  if (typeof document === 'undefined') return;
  document.addEventListener('selectionchange', handleSelectionChange);
});

onUnmounted(() => {
  if (typeof document === 'undefined') return;
  document.removeEventListener('selectionchange', handleSelectionChange);
});

const findClosestBlockId = () => {
  if (typeof document === 'undefined') return null;
  const blocks = Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]'));
  if (!blocks.length) return null;
  const anchorEl = document.querySelector<HTMLElement>('.floating-add');
  const anchorY = anchorEl ? anchorEl.getBoundingClientRect().top : window.innerHeight * 0.5;
  let closest: { id: string; distance: number } | null = null;
  blocks.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const center = (rect.top + rect.bottom) / 2;
    const distance = Math.abs(center - anchorY);
    const id = el.dataset.blockId;
    if (!id) return;
    if (!closest || distance < closest.distance) {
      closest = { id, distance };
    }
  });
  return closest?.id ?? null;
};

const resolveInsertTargetId = () => {
  if (typeof document !== 'undefined') {
    const active = document.activeElement as HTMLElement | null;
    if (active?.classList.contains('note-textarea') && active.dataset.blockId) {
      return active.dataset.blockId;
    }
  }
  if (selectedImageId.value) return selectedImageId.value;
  if (lastFocusedTextId.value) return lastFocusedTextId.value;
  if (lastInsertTargetId.value) return lastInsertTargetId.value;
  const visibleId = findClosestBlockId();
  if (visibleId) return visibleId;
  const firstText = blocks.value.find((block) => block.type === 'text');
  return lastFocusedTextId.value || firstText?.id || null;
};

const openFilePicker = () => {
  const input = fileInputRef.value;
  if (!input) return;
  const showPicker = (input as HTMLInputElement & { showPicker?: () => void }).showPicker;
  if (typeof showPicker === 'function') {
    showPicker.call(input);
    return;
  }
  input.click();
};

const triggerImagePicker = (blockId?: string | null, position: 'before' | 'after' = 'after') => {
  if (!blockId && lastFocusedTextId.value) {
    focusBody({ restoreSelection: true });
  }
  const targetId = blockId ?? resolveInsertTargetId();
  pendingInsertTarget.value = { blockId: targetId, position };
  if (blocks.value.filter((block) => block.type === 'image').length >= MAX_NOTE_IMAGES) {
    statusMessage.value = '画像は最大9枚まで追加できます';
    return;
  }
  openFilePicker();
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
  const total = files.length;
  for (const [index, file] of files.entries()) {
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
      src = await compressDataUrl(src, 1400, 0.8);
      const insertedId = insertImageAtCursor(
        src,
        pendingInsertTarget.value.blockId,
        pendingInsertTarget.value.position,
        {
          focusAfter: index === total - 1,
          ensureTrailingText: index === total - 1,
        },
      );
      if (insertedId) {
        pendingInsertTarget.value = { blockId: insertedId, position: 'after' };
        lastInsertTargetId.value = insertedId;
      }
      statusMessage.value = '';
    } catch {
      statusMessage.value = '画像の読み込みに失敗しました。別の画像をお試しください';
    }
  }
  input.value = '';
  pendingInsertTarget.value = { blockId: null, position: 'after' };
};

const insertImageAtCursor = (
  src: string,
  blockId: string | null,
  position: 'before' | 'after',
  options?: { focusAfter?: boolean; ensureTrailingText?: boolean },
) => {
  const shouldFocus = options?.focusAfter !== false;
  const shouldEnsureTrailingText = options?.ensureTrailingText !== false;
  let focusId: string | null = null;
  const scheduleAfterInsert = (imageId: string) => {
    nextTick(() => {
      resizeAllTextareas();
      scrollToBlock(imageId);
      if (shouldFocus && focusId) {
        focusTextBlock(focusId, 'start');
      }
    });
  };
  if (!blockId) {
    const insertIndex = position === 'before' ? 0 : blocks.value.length;
    const newId = createId();
    blocks.value.splice(insertIndex, 0, { id: `image-${newId}`, type: 'image', src });
    if (shouldEnsureTrailingText) {
      const textBlock = createTextBlock();
      blocks.value.splice(insertIndex + 1, 0, textBlock);
      focusId = textBlock.id;
    }
    ensureTextBlockExists();
    scheduleAfterInsert(`image-${newId}`);
    return `image-${newId}`;
  }
  const index = blocks.value.findIndex((block) => block.id === blockId);
  if (index === -1) {
    const newId = createId();
    blocks.value.splice(position === 'before' ? 0 : blocks.value.length, 0, {
      id: `image-${newId}`,
      type: 'image',
      src,
    });
    if (shouldEnsureTrailingText) {
      const insertIndex = position === 'before' ? 0 : blocks.value.length - 1;
      const textBlock = createTextBlock();
      blocks.value.splice(insertIndex + 1, 0, textBlock);
      focusId = textBlock.id;
    }
    ensureTextBlockExists();
    scheduleAfterInsert(`image-${newId}`);
    return `image-${newId}`;
  }
  if (blocks.value[index].type !== 'text') {
    const newId = createId();
    const insertIndex = position === 'before' ? index : index + 1;
    blocks.value.splice(insertIndex, 0, { id: `image-${newId}`, type: 'image', src });
    const nextText = blocks.value.slice(insertIndex + 1).find((block) => block.type === 'text') as
      | Extract<NoteBlock, { type: 'text' }>
      | undefined;
    if (nextText) {
      focusId = nextText.id;
    } else if (shouldEnsureTrailingText) {
      const textBlock = createTextBlock();
      blocks.value.splice(insertIndex + 1, 0, textBlock);
      focusId = textBlock.id;
    }
    ensureTextBlockExists();
    scheduleAfterInsert(`image-${newId}`);
    return `image-${newId}`;
  }
  const target = blocks.value[index] as Extract<NoteBlock, { type: 'text' }>;
  const caret = textSelections.value[target.id] ?? target.value.length;
  const before = target.value.slice(0, caret);
  const after = target.value.slice(caret);
  const hasBeforeText = before.trim().length > 0;
  const newId = createId();
  const imageBlock = { id: `image-${newId}`, type: 'image' as const, src };
  if (!hasBeforeText) {
    // テキストが空の状態では空行を作らず、その行にサムネイルを置く
    blocks.value.splice(index, 1, imageBlock);
    if (after.trim().length > 0) {
      const textBlock = createTextBlock(after.replace(/^\n+/, ''));
      blocks.value.splice(index + 1, 0, textBlock);
      focusId = textBlock.id;
    } else if (shouldEnsureTrailingText) {
      const textBlock = createTextBlock();
      blocks.value.splice(index + 1, 0, textBlock);
      focusId = textBlock.id;
    }
    ensureTextBlockExists();
    scheduleAfterInsert(`image-${newId}`);
    return `image-${newId}`;
  }
  // 先に現在のブロックを前半に更新
  blocks.value[index] = { ...target, value: before };
  // 画像ブロックをその直後に入れる
  const insertIndex = index + 1;
  blocks.value.splice(insertIndex, 0, imageBlock);
  // 後半があれば新しいテキストブロックとして続ける
  if (after.trim().length > 0) {
    const textBlock = createTextBlock(after.replace(/^\n+/, ''));
    blocks.value.splice(insertIndex + 1, 0, textBlock);
    focusId = textBlock.id;
  } else if (shouldEnsureTrailingText) {
    const textBlock = createTextBlock();
    blocks.value.splice(insertIndex + 1, 0, textBlock);
    focusId = textBlock.id;
  }
  ensureTextBlockExists();
  scheduleAfterInsert(`image-${newId}`);
  return `image-${newId}`;
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

const parseListBlock = (value: string) => {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  const isBullet = lines.every((line) => /^・\s+/.test(line) || /^-\s+/.test(line));
  if (isBullet) {
    return {
      type: 'ul' as const,
      items: lines.map((line) => line.replace(/^・\s+|^-\s+/, '')),
    };
  }
  const isOrdered = lines.every((line) => /^\d+[.)]\s+/.test(line));
  if (isOrdered) {
    return {
      type: 'ol' as const,
      items: lines.map((line) => line.replace(/^\d+[.)]\s+/, '')),
    };
  }
  return null;
};

const buildHtmlFromBlocks = () => {
  if (allowOriginalHtml.value && originalHtml && serializeBlocks(blocks.value) === initialSnapshot.value) {
    return originalHtml;
  }
  return blocks.value
    .map((block) => {
      if (block.type === 'text') {
        const normalized = normalizeText(block.value);
        if (!normalized) return '';
        if (block.rawHtml && block.rawText && normalizeText(block.rawText) === normalized) {
          return block.rawHtmlIsBlock ? block.rawHtml : `<p>${block.rawHtml}</p>`;
        }
        const listBlock = parseListBlock(block.value);
        if (listBlock) {
          const items = listBlock.items
            .map((item) => `<li>${escapeHtml(item)}</li>`)
            .join('');
          return listBlock.type === 'ol' ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
        }
        const paragraphs = block.value
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean);
        if (!paragraphs.length) return '';
        return paragraphs
          .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
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

const consumeReturnMode = () => {
  try {
    const mode = sessionStorage.getItem(CONSOLE_EVENT_NOTE_RETURN_KEY);
    sessionStorage.removeItem(CONSOLE_EVENT_NOTE_RETURN_KEY);
    return mode;
  } catch {
    return null;
  }
};

const clearNoteResult = () => {
  try {
    sessionStorage.removeItem(CONSOLE_EVENT_NOTE_RESULT_KEY);
  } catch {
    // ignore
  }
};

const navigateBackToForm = (options?: { discardDraft?: boolean }) => {
  if (options?.discardDraft) {
    clearNoteResult();
  }
  const returnMode = consumeReturnMode();
  if (returnMode === 'back' && window.history.length > 1) {
    router.back();
    return;
  }
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
  saving.value = true;
  try {
    const payload = buildPayload();
    const serialized = JSON.stringify(payload);
    if (serialized.length > 4 * 1024 * 1024) {
      statusMessage.value = '保存できません（容量が大きすぎます）。画像を減らしてください。';
      saving.value = false;
      return;
    }
    sessionStorage.setItem(CONSOLE_EVENT_NOTE_RESULT_KEY, serialized);
    const time = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    saveStatus.value = `保存済み ${time}`;
    lastSaved = serialized;
  } catch (err) {
    statusMessage.value = '保存できません（容量制限）。画像を減らしてください。';
    saving.value = false;
    return;
  }
  saving.value = false;
  navigateBackToForm();
};

const handleCancel = () => {
  const currentSerialized = JSON.stringify(buildPayload());
  const baseline = initialPayloadSnapshot.value || lastSaved;
  if (baseline && currentSerialized !== baseline) {
    const confirmLeave = window.confirm('変更を破棄しますか？');
    if (!confirmLeave) return;
  }
  clearNoteResult();
  navigateBackToForm({ discardDraft: true });
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
  gap: 4px;
}

.note-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.note-textarea {
  width: 100%;
  min-height: 24px;
  border: none;
  outline: none;
  font-size: 18px;
  line-height: 1.45;
  background: transparent;
  resize: none;
  overflow: hidden;
  padding: 0;
  color: #0f172a;
}

.note-textarea::placeholder {
  color: rgba(15, 23, 42, 0.35);
}

.note-textarea:placeholder-shown {
  min-height: 22px;
}

.note-image {
  width: min(160px, 46vw);
  aspect-ratio: 1 / 1;
  overflow: hidden;
  position: relative;
  align-self: flex-start;
}

.note-image img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.note-image__actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.note-image__action {
  border: none;
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  background: #e2e8f0;
  color: #0f172a;
}

.note-image__action.is-disabled {
  opacity: 0.4;
}

.note-image__action--danger {
  background: #fee2e2;
  color: #b91c1c;
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
  position: fixed;
  left: -9999px;
  top: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
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
