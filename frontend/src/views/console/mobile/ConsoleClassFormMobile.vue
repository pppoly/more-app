<template>
  <div class="class-form">
    <ConsoleTopBar v-if="showTopBar" :title="isEdit ? '教室を編集' : '教室を作成'" @back="goBack" />
    <div class="info-banner">
      <p class="info-text">教室は長期のコースです。作成後に、レッスンの日程（各回）を追加します</p>
    </div>
    <form @submit.prevent="handleSubmit" class="form">
      <div v-if="loading" class="skeleton">
        <div class="sk-line title"></div>
        <div class="sk-line"></div>
        <div class="sk-line"></div>
      </div>
      <div v-else>
      <section class="group">
        <p class="group-title">教室基本情報</p>
        <label class="field">
          <div class="field-row">
            <span class="field-label">カバー画像（16:9）</span>
            <div class="cover-upload">
            <div class="cover-drop">
              <input ref="coverInput" type="file" accept="image/*" class="sr-only" @change="handleCoverUpload" />
              <div v-if="coverPreview" class="cover-preview">
                <img :src="coverPreview" alt="" />
              </div>
                <div v-else class="cover-empty">
                  <span class="i-lucide-image-plus"></span>
                  <p>{{ uploadingCover ? '処理中…' : 'タップしてアップロード' }}</p>
                </div>
              </div>
            </div>
          </div>
          <p class="hint">自動で中央を16:9に切り抜きます</p>
        </label>
        <label class="field">
          <span>タイトル *</span>
          <input
            v-model="form.title"
            type="text"
            required
            placeholder="例：にほんごきょうしつ【しょしんしゃむけ】"
          />
          <p class="hint">参加者に表示される教室名です</p>
        </label>
        <label class="field">
          <span>説明</span>
          <textarea
            v-model="form.description"
            rows="5"
            class="description-input"
            placeholder="例：買い物の会話や電話のかけ方など、生活に役立つ日本語を学びます。"
          ></textarea>
        </label>
        <label class="field">
          <span>場所</span>
          <input v-model="form.locationName" type="text" placeholder="例：MISHOP 第1会議室" />
          <p class="hint">参加者に表示される場所です</p>
        </label>
      </section>
      <section class="group">
        <p class="group-title">価格・定員</p>
        <label class="field">
          <span>参加費（1回あたり） *</span>
          <div class="input-row">
            <input v-model.number="form.priceYenPerLesson" type="number" min="0" required />
            <span class="suffix">/ 回</span>
          </div>
          <p class="hint">※ 各回ごとに支払いが行われます</p>
        </label>
        <label class="field">
          <span>デフォルト定員（各回）</span>
          <input
            v-model.number="form.defaultCapacity"
            type="number"
            min="0"
            placeholder="未設定可（回ごとに変更できます）"
          />
        </label>
      </section>
      <div class="footer">
        <button class="primary" type="submit" :disabled="submitting">
          {{ submitting ? '保存中…' : '教室を作成して次へ' }}
        </button>
      </div>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { createConsoleClass, fetchConsoleClasses, updateConsoleClass, uploadClassCover } from '../../../api/client';
import { useToast } from '../../../composables/useToast';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';
import { isLineInAppBrowser } from '../../../utils/liff';
import { resolveAssetUrl } from '../../../utils/assetUrl';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const classId = computed(() => (route.params.classId as string) || (route.query.classId as string) || '');
const isEdit = computed(() => Boolean(classId.value));
const loading = ref(false);
const submitting = ref(false);
const showTopBar = computed(() => !isLineInAppBrowser());
const form = ref({
  title: '',
  description: '',
  locationName: '',
  priceYenPerLesson: 0,
  defaultCapacity: null as number | null,
});
const coverInput = ref<HTMLInputElement | null>(null);
const coverPreview = ref<string | null>(null);
const pendingCoverFile = ref<File | null>(null);
const uploadingCover = ref(false);

const cropImage = (file: File, aspectRatio: number, targetWidth: number) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        let cropWidth = width;
        let cropHeight = cropWidth / aspectRatio;
        if (cropHeight > height) {
          cropHeight = height;
          cropWidth = cropHeight * aspectRatio;
        }
        const startX = (width - cropWidth) / 2;
        const startY = (height - cropHeight) / 2;
        const outputWidth = Math.min(targetWidth, cropWidth);
        const outputHeight = outputWidth / aspectRatio;
        const canvas = document.createElement('canvas');
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not supported'));
          return;
        }
        ctx.drawImage(img, startX, startY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const dataUrlToFile = async (dataUrl: string, filename: string) => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
};

const handleCoverUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || uploadingCover.value) return;
  uploadingCover.value = true;
  try {
    const dataUrl = await cropImage(file, 16 / 9, 1280);
    coverPreview.value = dataUrl;
    const uploadFile = await dataUrlToFile(dataUrl, `class-cover-${Date.now()}.jpg`);
    if (isEdit.value && classId.value) {
      const { imageUrl } = await uploadClassCover(classId.value, uploadFile);
      coverPreview.value = resolveAssetUrl(imageUrl);
      pendingCoverFile.value = null;
    } else {
      pendingCoverFile.value = uploadFile;
    }
  } catch (err) {
    console.warn(err);
  } finally {
    uploadingCover.value = false;
    if (target) target.value = '';
  }
};

const handleSubmit = async () => {
  try {
    submitting.value = true;
    let createdId: string | null = null;
    if (isEdit.value) {
      await updateConsoleClass(classId.value, form.value);
      createdId = classId.value;
    } else {
      const res = await createConsoleClass(form.value);
      createdId = (res as any)?.id ?? null;
    }
    if (createdId && pendingCoverFile.value) {
      try {
        const { imageUrl } = await uploadClassCover(createdId, pendingCoverFile.value);
        coverPreview.value = resolveAssetUrl(imageUrl);
        pendingCoverFile.value = null;
      } catch (err) {
        console.warn(err);
      }
    }
    toast.show('教室を作成しました');
    if (!isEdit.value) {
      try {
        sessionStorage.setItem('console_classes_refresh', '1');
      } catch {
        // ignore storage errors
      }
      router.replace({ name: 'ConsoleMobileClasses' });
      return;
    }
    if (createdId) {
      router.push({ name: 'ConsoleMobileLessons', params: { classId: createdId } });
    } else {
      router.push({ name: 'ConsoleMobileClasses' });
    }
  } catch (err: any) {
    toast.show(err?.message ?? '保存に失敗しました');
  } finally {
    submitting.value = false;
  }
};

const goBack = () => router.back();

const loadExisting = async () => {
  if (!isEdit.value) return;
  try {
    loading.value = true;
    const all = await fetchConsoleClasses();
    const target = all.find((c) => c.id === classId.value);
    if (!target) {
      toast.show('教室が見つかりません');
      router.back();
      return;
    }
    form.value.title = target.title || '';
    form.value.description = (target as any).description || '';
    form.value.locationName = target.locationName || '';
    form.value.priceYenPerLesson = target.priceYenPerLesson || 0;
    form.value.defaultCapacity = target.defaultCapacity ?? null;
    coverPreview.value = target.coverImageUrl ? resolveAssetUrl(target.coverImageUrl) : null;
  } catch (err: any) {
    toast.show(err?.message ?? '読み込みに失敗しました');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadExisting().catch(() => {});
});
</script>

<style scoped>
.class-form {
  padding: 16px;
  max-width: 520px;
  margin: 0 auto;
  box-sizing: border-box;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}
.group {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}
.group + .group {
  margin-top: 14px;
}
.group-title {
  margin: 0 0 8px;
  font-weight: 700;
  color: #0f172a;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-weight: 600;
}
.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.field-label {
  font-weight: 600;
  color: #0f172a;
  min-width: 110px;
}
input,
textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
  font-size: 14px;
  background: #f8fafc;
}
input:focus,
textarea:focus {
  outline: 2px solid #c7d2fe;
}
.cover-upload {
  display: flex;
  justify-content: flex-end;
  flex: 1;
}
.cover-drop {
  width: 140px;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  border: 1px dashed rgba(15, 23, 42, 0.2);
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}
.cover-drop:hover {
  border-color: rgba(37, 99, 235, 0.5);
  background: #eef2ff;
}
.cover-preview {
  width: 100%;
  height: 100%;
}
.cover-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #64748b;
  font-size: 12px;
}
.cover-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
.description-input {
  min-height: 140px;
}
.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}
.input-row input {
  flex: 1;
  min-width: 0;
}
.suffix {
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
}
.hint {
  margin: 0;
  color: #6b7280;
  font-size: 12px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
.primary {
  width: 100%;
  height: 48px;
  border: none;
  background: linear-gradient(135deg, #2563eb, #60a5fa);
  color: #fff;
  border-radius: 12px;
  padding: 0 16px;
  font-weight: 700;
}
.footer {
  position: sticky;
  bottom: 0;
  padding: 12px 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), #fff 40%, #fff 100%);
}
.info-banner {
  border: 1px solid #e5e7eb;
  background: #f8fafc;
  color: #0f172a;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 12px;
}
.info-text {
  margin: 0;
}
.skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sk-line {
  height: 12px;
  background: #e5e7eb;
  border-radius: 10px;
}
.sk-line.title {
  width: 70%;
}
</style>
