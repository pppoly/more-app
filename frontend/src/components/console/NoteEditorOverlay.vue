<template>
  <Teleport to="body">
    <div class="note-overlay">
      <section class="note-editor">
        <header class="note-editor__nav">
          <button type="button" class="nav-btn ghost" @click="$emit('close')">取消</button>
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
            <textarea
              v-if="block.type === 'text'"
              v-model="block.value"
              class="note-textarea"
              :placeholder="index === 0 ? '像 iOS 备忘录一样，讲述你的活动故事…' : '继续输入...'"
            ></textarea>
            <div v-else class="note-image">
              <img :src="block.src" alt="note image" />
              <button type="button" class="note-photo__delete" @click="removeBlock(block.id)">×</button>
            </div>
            <div class="note-block__actions" v-if="block.type === 'text'">
              <button
                type="button"
                class="insert-btn ghost"
                @click="triggerImagePicker(block.id)"
              >
                ＋ 添加图片
              </button>
            </div>
          </div>
        </section>

        <p class="note-editor__hint">
          尺寸 750×X，最多上传 9 张，默认第一张为详情页主图
        </p>
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
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

interface NoteBlock {
  id: string;
  type: 'text' | 'image';
  value?: string;
  src?: string;
}

interface NotePayload {
  text: string;
  html: string;
  images: Array<{ id: string; src: string }>;
}

const props = defineProps<{
  context: {
    text?: string;
    html?: string;
    images?: Array<{ id: string; src: string }>;
  };
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', payload: NotePayload): void;
}>();

const blocks = ref<NoteBlock[]>([]);
const statusMessage = ref('');
const saving = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

const todayLabel = new Intl.DateTimeFormat('ja-JP', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
}).format(new Date());

const charCount = computed(() =>
  blocks.value
    .filter((block) => block.type === 'text')
    .reduce((sum, block) => sum + (block.value?.trim().length || 0), 0),
);

const MAX_IMAGES = 9;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

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

const initBlocks = () => {
  const initial: NoteBlock[] = [];
  if (props.context.text) {
    initial.push(createTextBlock(props.context.text));
  } else {
    initial.push(createTextBlock(''));
  }
  (props.context.images || []).forEach((image) => {
    initial.push(createImageBlock(image.src));
  });
  blocks.value = initial;
};

watch(
  () => props.context,
  () => {
    initBlocks();
  },
  { immediate: true },
);

const triggerImagePicker = (afterBlockId: string | null) => {
  pendingInsertAfterId.value = afterBlockId;
  fileInputRef.value?.click();
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const pendingInsertAfterId = ref<string | null>(null);

const handleImagePick = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) return;
  if (blocks.value.filter((block) => block.type === 'image').length >= MAX_IMAGES) {
    statusMessage.value = '最多上传 9 张图片';
    input.value = '';
    return;
  }
  for (const file of Array.from(input.files)) {
    if (!file.type?.startsWith('image/')) {
      statusMessage.value = '仅支持图片文件';
      continue;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      statusMessage.value = '图片过大，请压缩后重试';
      continue;
    }
    const src = await readFileAsDataUrl(file);
    insertImageBlock(src);
    statusMessage.value = '';
  }
  input.value = '';
};

const findInsertIndex = () => {
  if (!pendingInsertAfterId.value) return blocks.value.length;
  const index = blocks.value.findIndex((block) => block.id === pendingInsertAfterId.value);
  return index >= 0 ? index + 1 : blocks.value.length;
};

const insertImageBlock = (src: string) => {
  const insertIndex = findInsertIndex();
  blocks.value.splice(insertIndex, 0, createImageBlock(src));
  pendingInsertAfterId.value = null;
};

const removeBlock = (id: string) => {
  if (blocks.value.length === 1) {
    blocks.value = [createTextBlock('')];
    return;
  }
  blocks.value = blocks.value.filter((block) => block.id !== id);
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const buildHtml = () =>
  blocks.value
    .map((block) => {
      if (block.type === 'text') {
        const paragraphs = (block.value || '')
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean);
        return paragraphs
          .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
          .join('');
      }
      if (block.src) {
        return `<figure class="note-image"><img src="${block.src}" alt="活动详情图片" /></figure>`;
      }
      return '';
    })
    .filter(Boolean)
    .join('');

const buildText = () =>
  blocks.value
    .filter((block) => block.type === 'text')
    .map((block) => (block.value || '').trim())
    .filter(Boolean)
    .join('\n\n');

const buildImages = () =>
  blocks.value
    .filter((block): block is Extract<NoteBlock, { type: 'image' }> => block.type === 'image')
    .map((block) => ({
      id: block.id,
      src: block.src ?? '',
    }));

const handleSave = () => {
  if (saving.value) return;
  saving.value = true;
  emit('save', {
    text: buildText(),
    html: buildHtml(),
    images: buildImages(),
  });
  saving.value = false;
};

const previousBodyOverflow = ref<string | null>(null);
const previousHtmlOverflow = ref<string | null>(null);

onMounted(() => {
  previousBodyOverflow.value = document.body.style.overflow;
  previousHtmlOverflow.value = document.documentElement.style.overflow;
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
});

onBeforeUnmount(() => {
  document.body.style.overflow = previousBodyOverflow.value ?? '';
  document.documentElement.style.overflow = previousHtmlOverflow.value ?? '';
});
</script>

<style scoped>
.note-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 999;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
}

.note-editor {
  width: min(520px, 100%);
  max-height: calc(100vh - 32px);
  background: #fdf9f0;
  border-radius: 24px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
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
  min-height: 140px;
  border: none;
  outline: none;
  font-size: 16px;
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
  margin: 0;
}

.note-editor__status {
  font-size: 13px;
  color: #d93838;
  margin: 0;
}

.insert-btn {
  border-radius: 12px;
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
