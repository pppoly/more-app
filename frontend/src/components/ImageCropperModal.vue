<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="modelValue && image" class="cropper-overlay">
        <div class="cropper-panel">
          <p class="cropper-title">{{ title }}</p>
          <div
            class="cropper-viewport"
            :style="viewportStyle"
            @pointerdown.prevent="startDrag"
            @pointermove.prevent="onDrag"
            @pointerup="endDrag"
            @pointerleave="endDrag"
          >
            <div class="cropper-image">
              <div class="cropper-shift" :style="shiftStyle">
                <img :src="src" :style="imageStyle" draggable="false" />
              </div>
            </div>
            <div class="cropper-mask" />
            <div v-if="showCircleGuide" class="cropper-guide" :style="guideStyle" />
          </div>
          <div class="cropper-slider">
            <input type="range" :min="1" :max="maxScale" step="0.01" v-model.number="scale" @input="clampOffsets" />
          </div>
          <div class="cropper-actions">
            <button type="button" class="ghost" @click="emitClose">{{ cancelText }}</button>
            <button type="button" class="primary" :disabled="loading" @click="handleConfirm">
              {{ loading ? 'アップロード中…' : confirmText }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

interface Props {
  modelValue: boolean;
  src: string | null;
  aspectRatio?: number; // width / height
  resultWidth?: number;
  resultType?: string;
  resultQuality?: number;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  maxScale?: number;
  showCircleGuide?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  aspectRatio: 1,
  resultWidth: 512,
  resultType: 'image/jpeg',
  resultQuality: 0.9,
  title: '画像を調整',
  confirmText: '使用する',
  cancelText: 'キャンセル',
  loading: false,
  maxScale: 2.5,
  showCircleGuide: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'confirm', value: Blob): void;
  (e: 'cancel'): void;
}>();

const image = ref<HTMLImageElement | null>(null);
const scale = ref(1);
const offset = ref({ x: 0, y: 0 });
const baseSize = ref({ width: 0, height: 0 });
const dragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const dragOrigin = ref({ x: 0, y: 0 });

const VIEWPORT_WIDTH = 320;
const viewportWidth = computed(() => VIEWPORT_WIDTH);
const viewportHeight = computed(() => VIEWPORT_WIDTH / props.aspectRatio);

const viewportStyle = computed(() => ({
  width: `${viewportWidth.value}px`,
  height: `${viewportHeight.value}px`,
}));

const guideStyle = computed(() => {
  const size = Math.min(viewportWidth.value, viewportHeight.value) - 6;
  return {
    width: `${size}px`,
    height: `${size}px`,
  };
});

const shiftStyle = computed(() => ({
  width: `${baseSize.value.width}px`,
  height: `${baseSize.value.height}px`,
  transform: `translate(calc(-50% + ${offset.value.x}px), calc(-50% + ${offset.value.y}px))`,
}));

const imageStyle = computed(() => ({
  width: `${baseSize.value.width}px`,
  height: `${baseSize.value.height}px`,
  transform: `scale(${scale.value})`,
}));

const loadImage = () => {
  if (!props.src) {
    image.value = null;
    return;
  }
  const img = new Image();
  img.onload = () => {
    image.value = img;
    const baseScale = Math.max(viewportWidth.value / img.naturalWidth, viewportHeight.value / img.naturalHeight);
    baseSize.value = {
      width: img.naturalWidth * baseScale,
      height: img.naturalHeight * baseScale,
    };
    scale.value = 1;
    offset.value = { x: 0, y: 0 };
    clampOffsets();
  };
  img.src = props.src;
};

watch(
  () => props.src,
  () => {
    if (props.modelValue) loadImage();
  },
);

watch(
  () => props.modelValue,
  (open) => {
    if (open) loadImage();
  },
);

watch(
  () => scale.value,
  () => clampOffsets(),
);

const clampOffsets = () => {
  const maxX = Math.max(0, (baseSize.value.width * scale.value - viewportWidth.value) / 2);
  const maxY = Math.max(0, (baseSize.value.height * scale.value - viewportHeight.value) / 2);
  offset.value = {
    x: Math.min(maxX, Math.max(-maxX, offset.value.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.value.y)),
  };
};

const startDrag = (event: PointerEvent) => {
  if (!props.modelValue) return;
  dragging.value = true;
  dragStart.value = { x: event.clientX, y: event.clientY };
  dragOrigin.value = { ...offset.value };
  (event.currentTarget as HTMLElement | null)?.setPointerCapture(event.pointerId);
};

const onDrag = (event: PointerEvent) => {
  if (!dragging.value) return;
  const dx = event.clientX - dragStart.value.x;
  const dy = event.clientY - dragStart.value.y;
  offset.value = {
    x: dragOrigin.value.x + dx,
    y: dragOrigin.value.y + dy,
  };
  clampOffsets();
};

const endDrag = (event: PointerEvent) => {
  if (!dragging.value) return;
  dragging.value = false;
  (event.currentTarget as HTMLElement | null)?.releasePointerCapture(event.pointerId);
};

const emitClose = () => {
  emit('update:modelValue', false);
  emit('cancel');
};

const handleConfirm = async () => {
  if (!image.value) return;
  const blob = await createCroppedBlob();
  emit('confirm', blob);
};

const createCroppedBlob = () =>
  new Promise<Blob>((resolve, reject) => {
    if (!image.value) {
      reject(new Error('画像が読み込まれていません'));
      return;
    }
    const canvas = document.createElement('canvas');
    const resultWidth = props.resultWidth;
    const resultHeight = Math.round(resultWidth / props.aspectRatio);
    canvas.width = resultWidth;
    canvas.height = resultHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('画像処理に失敗しました'));
      return;
    }

    const coverScale = Math.max(viewportWidth.value / image.value.naturalWidth, viewportHeight.value / image.value.naturalHeight);
    const effectiveScale = coverScale * scale.value;
    const cropNaturalWidth = viewportWidth.value / effectiveScale;
    const cropNaturalHeight = viewportHeight.value / effectiveScale;
    const centerX = image.value.naturalWidth / 2 - offset.value.x / effectiveScale;
    const centerY = image.value.naturalHeight / 2 - offset.value.y / effectiveScale;
    let sourceX = centerX - cropNaturalWidth / 2;
    let sourceY = centerY - cropNaturalHeight / 2;
    sourceX = Math.max(0, Math.min(image.value.naturalWidth - cropNaturalWidth, sourceX));
    sourceY = Math.max(0, Math.min(image.value.naturalHeight - cropNaturalHeight, sourceY));

    ctx.drawImage(
      image.value,
      sourceX,
      sourceY,
      cropNaturalWidth,
      cropNaturalHeight,
      0,
      0,
      resultWidth,
      resultHeight,
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('画像生成に失敗しました'));
          return;
        }
        resolve(blob);
      },
      props.resultType,
      props.resultQuality,
    );
  });

onBeforeUnmount(() => {
  image.value = null;
});
</script>

<style scoped>
.cropper-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 9999;
}
.cropper-panel {
  width: min(92vw, 420px);
  background: #ffffff;
  color: #0f172a;
  border-radius: 20px;
  padding: 18px;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cropper-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 700;
}
.cropper-viewport {
  position: relative;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 14px;
  background: #fff;
  touch-action: none;
  border: 2px solid rgba(15, 23, 42, 0.2);
}
.cropper-image {
  position: absolute;
  inset: 0;
}
.cropper-shift {
  position: absolute;
  left: 50%;
  top: 50%;
  transform-origin: center;
}
.cropper-shift img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  pointer-events: none;
}
.cropper-mask {
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.9);
  border-radius: 14px;
  z-index: 1;
}
.cropper-guide {
  position: absolute;
  inset: 0;
  margin: auto;
  border: 2px dashed rgba(15, 23, 42, 0.6);
  border-radius: 50%;
  pointer-events: none;
  z-index: 2;
  background: transparent;
}
.cropper-slider {
  padding: 6px 4px 0;
}
.cropper-slider input[type='range'] {
  width: 100%;
}
.cropper-actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.cropper-actions button {
  flex: 1;
  border-radius: 12px;
  padding: 12px;
  font-weight: 700;
  border: none;
}
.cropper-actions .ghost {
  background: rgba(15, 23, 42, 0.06);
  color: #0f172a;
}
.cropper-actions .primary {
  background: linear-gradient(135deg, #0ea5e9, #22d3ee);
  color: #0b1220;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
