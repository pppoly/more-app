<template>
  <div class="lessons-page">
    <ConsoleTopBar v-if="showTopBar" title="レッスン管理" @back="goBack" />

    <div v-if="classDetail" class="hero">
      <div class="hero-bg"></div>
      <div class="hero-content">
        <div class="hero-body">
          <p class="class-label">現在の教室</p>
          <p class="class-title">{{ classDetail.title }}</p>
          <p class="class-meta">
            ¥{{ classDetail.priceYenPerLesson.toLocaleString() }} / 回・定員 {{ classDetail.defaultCapacity ?? '未設定' }}
          </p>
          <button class="primary add-btn" type="button" @click="openSheet">＋ レッスンを追加</button>
        </div>
        <div class="hero-visual" aria-hidden="true">
          <img :src="heroImageSrc" alt="" />
        </div>
      </div>
    </div>
    <p v-if="showTopBar" class="page-hint">この教室で開催する、各回のレッスン日程を管理します</p>
    <div v-if="loading" class="skeleton">
      <div class="sk-card" v-for="n in 3" :key="n">
        <div class="sk-line"></div>
        <div class="sk-line short"></div>
      </div>
    </div>
    <div v-else-if="error" class="state error">
      <p>{{ error }}</p>
      <button class="ghost" type="button" @click="load">再読み込み</button>
    </div>
    <div v-else>
      <div v-if="!lessons.length" class="state empty">
        <div class="empty-card">
          <p class="empty-title">まだレッスン日程がありません</p>
          <p class="empty-desc">参加者が申し込めるように、まず最初のレッスンを追加しましょう</p>
          <button class="ghost large" type="button" @click="openSheet">最初のレッスンを追加</button>
          <p class="hint">※ 右上の「＋」からも追加できます</p>
        </div>
      </div>
      <div v-else class="lesson-list">
        <article
          v-for="lesson in lessons"
          :key="lesson.id"
          class="lesson-card"
          @click="openRegistrations(lesson.id)"
        >
          <div class="row">
            <div>
              <p class="time">{{ formatLesson(lesson.startAt) }}</p>
              <p class="meta">定員: {{ lesson.capacity ?? classDetail?.defaultCapacity ?? '未設定' }}</p>
            </div>
            <div class="badge-stack">
              <span class="chip" :class="{ cancelled: lesson.status === 'cancelled' }">
                {{ statusLabel(lesson.status) }}
              </span>
              <div class="actions">
                <button
                  class="ghost"
                  type="button"
                  @click.stop="confirmCancel(lesson)"
                  :disabled="lesson.status === 'cancelled'"
                  v-if="(lesson.registrationCount ?? 0) > 0"
                >
                  {{ lesson.status === 'cancelled' ? 'キャンセル済' : 'キャンセル' }}
                </button>
                <button
                  v-if="(lesson.registrationCount ?? 0) === 0"
                  class="ghost danger"
                  type="button"
                  @click.stop="removeLesson(lesson.id)"
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>

    <teleport to="body">
      <div v-if="showSheet" class="sheet-overlay" @click.self="closeSheet">
        <div class="sheet">
            <div class="sheet-head">
            <p class="sheet-title">レッスンを追加</p>
            <button class="close" type="button" @click="closeSheet"><span class="i-lucide-x"></span></button>
          </div>
          <div class="sheet-body">
            <div class="batch-form">
              <div v-for="(row, index) in batchRows" :key="index" class="batch-row">
                <label class="field">
                  <span class="field-label">開始日時</span>
                  <IosDateTimePicker v-model="row.startAt" />
                </label>
                <label class="field">
                  <span class="field-label">終了日時（任意）</span>
                  <IosDateTimePicker v-model="row.endAt" />
                </label>
                <label class="field">
                  <span class="field-label">定員（任意）</span>
                  <input
                    v-model.number="row.capacity"
                    class="capacity-input"
                    type="tel"
                    inputmode="numeric"
                    min="0"
                    placeholder="未設定（教室の定員を使用）"
                  />
                </label>
                <div class="row-actions">
                  <button class="link" type="button" @click="removeRow(index)">削除</button>
                </div>
              </div>
            </div>
            <div class="sheet-actions">
              <button class="ghost" type="button" @click="closeSheet">閉じる</button>
              <button class="ghost" type="button" @click="addRow">＋ 行を追加</button>
              <button class="primary" type="button" :disabled="submitting || !validRows" @click="submitBatch">
                {{ submitting ? '作成中…' : '保存' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { batchCreateLessons, cancelLesson, deleteLesson, fetchClassDetail } from '../../../api/client';
import type { ClassDetail, Lesson } from '../../../types/api';
import { useToast } from '../../../composables/useToast';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';
import { isLineInAppBrowser } from '../../../utils/liff';
import IosDateTimePicker from '../../../components/common/IosDateTimePicker.vue';
import heroPlaceholder from '../../../assets/images/default-event.svg';
import { resolveAssetUrl } from '../../../utils/assetUrl';
import { useScrollMemory } from '../../../composables/useScrollMemory';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const lessons = ref<Lesson[]>([]);
const classDetail = ref<ClassDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const submitting = ref(false);
const toLocalInput = (date: Date) => {
  const pad = (num: number) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};
const parseLocalInput = (value: string) => {
  if (!value) return new Date();
  const [datePart, timePart] = value.split('T');
  if (!datePart || !timePart) return new Date(value);
  const [year, month, day] = datePart.split('-').map((v) => Number(v));
  const [hours, minutes] = timePart.split(':').map((v) => Number(v));
  if ([year, month, day, hours, minutes].some((v) => Number.isNaN(v))) {
    return new Date(value);
  }
  return new Date(year, (month ?? 1) - 1, day ?? 1, hours ?? 0, minutes ?? 0, 0, 0);
};
const defaultStart = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60);
  d.setSeconds(0, 0);
  return toLocalInput(d);
};
const defaultEnd = (startIso: string) => {
  const d = parseLocalInput(startIso);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d);
};

const batchRows = ref<Array<{ startAt: string; endAt?: string; capacity?: number | null }>>([
  { startAt: defaultStart(), endAt: defaultEnd(defaultStart()), capacity: null },
]);
const showSheet = ref(false);
const showTopBar = computed(() => !isLineInAppBrowser());
const heroImageSrc = computed(() =>
  classDetail.value?.coverImageUrl ? resolveAssetUrl(classDetail.value.coverImageUrl) : heroPlaceholder,
);
useScrollMemory();

const formatLesson = (startAt: string) => {
  const d = new Date(startAt);
  return `${d.getFullYear()}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d
    .getHours()
    .toString()
    .padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

const statusLabel = (status: string) => {
  if (status === 'cancelled') return 'キャンセル';
  return '受付中';
};

const load = async () => {
  try {
    loading.value = true;
    const detail = await fetchClassDetail(route.params.classId as string);
    classDetail.value = detail;
    lessons.value = detail.upcomingLessons || [];
  } catch (err: any) {
    error.value = err?.message ?? '読み込みに失敗しました';
  } finally {
    loading.value = false;
  }
};

const addRow = () => {
  const start = defaultStart();
  batchRows.value.push({ startAt: start, endAt: defaultEnd(start), capacity: null });
};
const removeRow = (index: number) => {
  batchRows.value.splice(index, 1);
};

const submitBatch = async () => {
  try {
    submitting.value = true;
    await batchCreateLessons(route.params.classId as string, batchRows.value);
    toast.show('レッスン日程を追加しました');
    const start = defaultStart();
    batchRows.value = [{ startAt: start, endAt: defaultEnd(start), capacity: null }];
    await load();
    closeSheet();
  } catch (err: any) {
    toast.show(err?.message ?? '作成に失敗しました');
  } finally {
    submitting.value = false;
  }
};

const cancel = async (lessonId: string) => {
  try {
    await cancelLesson(lessonId);
    toast.show('キャンセルしました');
    await load();
  } catch (err: any) {
    toast.show(err?.message ?? 'キャンセルに失敗しました');
  }
};

const confirmCancel = async (lesson: Lesson) => {
  if (lesson.status === 'cancelled') return;
  if (
    !window.confirm(
      'このレッスンをキャンセルしますか？参加者がいる場合は自動で返金され、履歴は残ります。',
    )
  )
    return;
  await cancel(lesson.id);
};

const removeLesson = async (lessonId: string) => {
  if (!window.confirm('このレッスンを削除しますか？')) return;
  try {
    await deleteLesson(lessonId);
    toast.show('削除しました');
    await load();
  } catch (err: any) {
    toast.show(err?.message ?? '削除に失敗しました');
  }
};

const openRegistrations = (lessonId: string) => {
  const target = lessons.value.find((l) => l.id === lessonId);
  router.push({
    name: 'ConsoleMobileLessonRegistrations',
    params: { lessonId },
    query: {
      startAt: target?.startAt,
      endAt: (target as any)?.endAt ?? '',
      classTitle: classDetail.value?.title ?? '',
      locationName: classDetail.value?.locationName ?? '',
      lessonStatus: target?.status ?? '',
    },
  });
};

onMounted(load);

const openSheet = () => {
  showSheet.value = true;
};

const closeSheet = () => {
  showSheet.value = false;
};

const validRows = computed(() => batchRows.value.some((row) => row.startAt));

const goBack = () => {
  router.back();
};
</script>

<style scoped>
.lessons-page {
  padding: 16px;
}
.hero {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 12px;
  background: linear-gradient(135deg, #e0f2fe, #bfdbfe);
}
.hero-bg {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 20% 20%, rgba(59, 130, 246, 0.2), transparent 40%),
    radial-gradient(circle at 80% 0%, rgba(59, 130, 246, 0.15), transparent 35%),
    linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(37, 99, 235, 0.1));
  pointer-events: none;
}
.hero-content {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
}
.hero-body {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 4px;
}
.hero-visual {
  width: 132px;
  aspect-ratio: 16 / 9;
  height: auto;
  border-radius: 14px;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
  flex: 0 0 auto;
}
.hero-visual img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.class-label {
  margin: 0;
  font-size: 12px;
  color: #0f172a;
  font-weight: 700;
  opacity: 0.8;
}
.class-title {
  margin: 0;
  font-weight: 800;
  font-size: 18px;
  color: #0f172a;
}
.class-meta {
  margin: 0;
  color: #0f172a;
  font-size: 13px;
}
.add-btn {
  margin-top: 8px;
  align-self: flex-start;
  height: 40px;
  padding: 0 14px;
}
.page-hint {
  margin: 0 0 12px;
  color: #6b7280;
  font-size: 13px;
}
.primary {
  height: 44px;
  border: none;
  border-radius: 10px;
  padding: 0 12px;
  font-weight: 700;
  background: linear-gradient(135deg, #2563eb, #60a5fa);
  color: #fff;
  min-width: 44px;
}
.ghost {
  border: 1px solid #e5e7eb;
  background: #fff;
  padding: 8px 10px;
  border-radius: 10px;
  min-height: 36px;
  color: #0f172a;
}
.ghost.danger {
  color: #dc2626;
  border-color: #fecdd3;
}
.batch-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.batch-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f8fafc;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-label {
  font-size: 12px;
  color: #475569;
  font-weight: 700;
}
.capacity-input {
  width: 100%;
  box-sizing: border-box;
  height: 44px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  font-size: 16px;
  appearance: none;
}
.field :deep(.ios-picker) {
  padding: 0;
}
.field :deep(select) {
  background: #fff;
}
.row-actions {
  display: flex;
  justify-content: flex-end;
}
.link {
  border: none;
  background: transparent;
  color: #2563eb;
}
.state {
  padding: 12px;
  text-align: center;
  color: #6b7280;
}
.state.empty {
  display: flex;
  justify-content: center;
}
.state.error {
  color: #dc2626;
}
.empty-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  max-width: 340px;
  width: 100%;
  background: #fff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.empty-title {
  margin: 0;
  font-weight: 800;
  color: #0f172a;
}
.empty-desc {
  margin: 0;
  color: #475569;
  font-size: 14px;
  line-height: 1.4;
}
.ghost.large {
  height: 44px;
}
.lesson-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lesson-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
  cursor: pointer;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.time {
  margin: 0;
  font-weight: 700;
}
.status {
  font-size: 12px;
  background: #eef2ff;
  color: #4338ca;
  padding: 2px 8px;
  border-radius: 999px;
}
.meta {
  margin: 6px 0;
  color: #6b7280;
}
.badge-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 12px;
  font-weight: 700;
}
.chip.cancelled {
  background: #fee2e2;
  color: #b91c1c;
}
.save-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #16a34a;
  text-align: right;
}
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: flex-end;
  z-index: 1000;
}
.sheet {
  width: 100%;
  background: #fff;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
  padding: 16px;
  box-sizing: border-box;
}
.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.sheet-title {
  margin: 0;
  font-weight: 800;
  font-size: 16px;
}
.close {
  background: transparent;
  border: none;
  font-size: 18px;
}
.sheet-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sheet-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
