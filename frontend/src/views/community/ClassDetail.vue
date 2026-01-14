<template>
  <div class="class-detail">
    <ConsoleTopBar v-if="showTopBar" title="コース" @back="goBack" />
    <div class="content" v-if="!registrationDone">
      <header class="summary-card hero-card" v-if="detail">
        <div class="row">
          <h1 class="class-title">{{ detail.title }}</h1>
          <p class="price">¥{{ detail.priceYenPerLesson.toLocaleString() }} / 1回</p>
        </div>
        <p v-if="detail.locationName" class="location">{{ detail.locationName }}</p>
        <p class="description" v-if="displaySecondary(detail)">{{ displaySecondary(detail) }}</p>
      </header>

      <section class="section">
        <div class="section-head">
        <p class="section-title">日程を選択</p>
        <p class="section-sub">1回ごとの申し込みです</p>
      </div>
      <div class="lesson-options">
        <button
            v-for="lesson in detail?.upcomingLessons || []"
            :key="lesson.id"
            class="lesson-row"
            :class="{
              active: lesson.id === selectedLessonId,
              disabled: lesson.status !== 'scheduled' || registeredLessons.has(lesson.id),
            }"
            :disabled="lesson.status !== 'scheduled' || registeredLessons.has(lesson.id)"
            @click="selectLesson(lesson.id)"
          >
            <div>
              <p class="lesson-date">{{ formatRange(lesson) }}</p>
              <p class="lesson-meta">{{ statusLabel(lesson.status) }}</p>
            </div>
            <div class="lesson-side">
              <span class="lesson-capacity">{{ capacityText(lesson) }}</span>
              <span class="pill small" v-if="lesson.status !== 'scheduled'">{{ statusLabel(lesson.status) }}</span>
              <span class="pill small success" v-else-if="registeredLessons.has(lesson.id)">申込済み</span>
              <span class="pill small selected" v-else-if="lesson.id === selectedLessonId">選択中</span>
            </div>
          </button>
          <p v-if="!(detail?.upcomingLessons?.length)" class="empty">日程が登録されていません</p>
        </div>
      </section>

    </div>

    <footer v-if="!registrationDone" class="cta-bar">
      <button
        class="primary"
        type="button"
        :disabled="submitting || !selectedLesson || registeredLessons.has(selectedLessonId || '')"
        @click="handleSubmit"
      >
        {{ submitting ? '処理中...' : selectedLesson ? 'この日程で申し込む' : '日程を選んで申し込む' }}
      </button>
    </footer>

    <div v-if="registrationDone" class="success-page">
      <div class="success-content">
        <div class="hero">
          <div class="hero-icon" aria-hidden="true">
            <svg viewBox="0 0 64 64" role="img">
              <defs>
                <linearGradient id="class-success-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#2563eb" />
                  <stop offset="100%" stop-color="#22c55e" />
                </linearGradient>
              </defs>
              <circle cx="32" cy="32" r="30" fill="url(#class-success-grad)" />
              <path
                d="M22 32.5 29.5 40 42 24"
                fill="none"
                stroke="#ffffff"
                stroke-width="5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <div class="hero-text">
            <h1>申込が完了しました</h1>
            <p>マイチケットで申込状況を確認できます</p>
          </div>
        </div>

        <div class="actions">
          <button class="btn primary" type="button" @click="router.push({ name: 'my-events' })">マイチケットへ</button>
          <button class="btn secondary" type="button" @click="goBack">コース一覧に戻る</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { createClassRegistration, createStripeCheckout, fetchClassDetail } from '../../api/client';
import type { ClassDetail, Lesson } from '../../types/api';
import { useToast } from '../../composables/useToast';
import ConsoleTopBar from '../../components/console/ConsoleTopBar.vue';
import { isLineInAppBrowser } from '../../utils/liff';
import { MOBILE_EVENT_PENDING_PAYMENT_KEY } from '../../constants/mobile';

const route = useRoute();
const router = useRouter();
const toast = useToast();

const detail = ref<ClassDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const selectedLessonId = ref<string | null>(null);
const submitting = ref(false);
const showSheet = ref(false);
const showTopBar = computed(() => !isLineInAppBrowser());
const registrationDone = ref(false);
const registeredLessons = ref<Set<string>>(new Set());

const REG_KEY = 'class_registrations';

const loadLocalRegs = () => {
  try {
    const raw = localStorage.getItem(REG_KEY);
    const list = raw ? (JSON.parse(raw) as Array<{ classId: string; lessonId?: string }>) : [];
    registeredLessons.value = new Set(
      list.filter((r) => r.classId === (route.params.classId as string)).map((r) => r.lessonId || ''),
    );
  } catch {
    registeredLessons.value = new Set();
  }
};

const saveLocalReg = (lessonId: string) => {
  try {
    const raw = localStorage.getItem(REG_KEY);
    const list = raw ? (JSON.parse(raw) as Array<{ classId: string; lessonId?: string }>) : [];
    list.push({ classId: route.params.classId as string, lessonId });
    localStorage.setItem(REG_KEY, JSON.stringify(list));
    registeredLessons.value.add(lessonId);
  } catch {
    // ignore storage errors
  }
};

const displaySecondary = (cls: any) => {
  const loc = cls.locationName;
  const desc = cls.description;
  const text =
    typeof desc === 'string'
      ? desc
      : desc?.ja || desc?.['ja-JP'] || desc?.zh || desc?.['zh-CN'] || desc?.original || '';
  const cleaned = text?.trim() || '';
  const isJunk = !cleaned || cleaned.length < 4 || (!/[ぁ-んァ-ン一-龥]/.test(cleaned) && cleaned.length < 8);
  if (loc && loc.trim().length > 0) return loc;
  if (!isJunk) return cleaned;
  return '';
};

const selectedLesson = computed(() =>
  detail.value?.upcomingLessons.find((l) => l.id === selectedLessonId.value),
);
const defaultLessonDurationMinutes = computed(() => {
  const lessons = detail.value?.upcomingLessons ?? [];
  for (const lesson of lessons) {
    if (!lesson.endAt) continue;
    const start = new Date(lesson.startAt);
    const end = new Date(lesson.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (end > start) {
      return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
    }
  }
  return null;
});

const formatLesson = (startAt: string) => {
  const d = new Date(startAt);
  const day = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${day}) ${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
};

const formatRange = (lesson: Lesson) => {
  if (!lesson) return '';
  const start = new Date(lesson.startAt);
  let end = lesson.endAt ? new Date(lesson.endAt) : null;
  const day = ['日', '月', '火', '水', '木', '金', '土'][start.getDay()];
  const startText = `${start.getMonth() + 1}/${start.getDate()}(${day}) ${start
    .getHours()
    .toString()
    .padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;
  if (!end || Number.isNaN(end.getTime()) || end <= start) {
    const fallbackMinutes = defaultLessonDurationMinutes.value;
    if (fallbackMinutes && fallbackMinutes > 0) {
      end = new Date(start.getTime() + fallbackMinutes * 60 * 1000);
    } else {
      end = null;
    }
  }
  const endText = end
    ? `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`
    : '';
  const durationMinutes =
    end && end > start
      ? Math.round((end.getTime() - start.getTime()) / (1000 * 60))
      : defaultLessonDurationMinutes.value ?? null;
  const duration = durationMinutes && durationMinutes > 0 ? `${durationMinutes}分` : '';
  return endText ? `${startText} 〜 ${endText}${duration ? `（${duration}）` : ''}` : startText;
};

const capacityText = (lesson: Lesson) => {
  const fallback = detail.value?.defaultCapacity ?? null;
  const capacity = lesson.capacity ?? fallback;
  return `定員: ${capacity ?? '未設定'}`;
};

const statusLabel = (status: string) => {
  if (status === 'cancelled') return 'キャンセル';
  if (status === 'scheduled') return '受付中';
  return status;
};

const load = async () => {
  try {
    loading.value = true;
    loadLocalRegs();
    const data = await fetchClassDetail(route.params.classId as string);
    detail.value = data;
    if (data.upcomingLessons?.length) {
      const firstAvailable = data.upcomingLessons.find((l) => !registeredLessons.value.has(l.id) && l.status === 'scheduled');
      selectedLessonId.value = firstAvailable ? firstAvailable.id : null;
    }
  } catch (err: any) {
    error.value = err?.message ?? '読み込みに失敗しました';
  } finally {
    loading.value = false;
  }
};

const openLessonSheet = () => {
  if (!detail.value?.upcomingLessons?.length) {
    toast.show('日程が登録されていません');
    return;
  }
  showSheet.value = true;
};
const closeSheet = () => {
  showSheet.value = false;
};
const selectLesson = (lessonId: string) => {
  selectedLessonId.value = lessonId;
  closeSheet();
};

const handleSubmit = async () => {
  const lessonId = selectedLessonId.value;
  if (!lessonId) {
    toast.show('日程を選択してください');
    return;
  }
  if (registeredLessons.value.has(lessonId)) {
    toast.show('この日程はすでに申込済みです');
    return;
  }
  try {
    submitting.value = true;
    const res = await createClassRegistration(route.params.classId as string, lessonId);
    if (res.paymentRequired) {
      const checkout = await createStripeCheckout(res.registrationId);
      if (checkout.resume) {
        toast.show('未完了の決済があります。決済を再開してください。');
      }
      sessionStorage.setItem(
        MOBILE_EVENT_PENDING_PAYMENT_KEY,
        JSON.stringify({
          registrationId: res.registrationId,
          source: 'class',
          classId: route.params.classId,
        }),
      );
      window.location.href = checkout.checkoutUrl;
      return;
    }
    registrationDone.value = true;
    toast.show('申込が完了しました');
    saveLocalReg(lessonId);
  } catch (err: any) {
    toast.show(err?.message ?? '申込に失敗しました');
  } finally {
    submitting.value = false;
  }
};

onMounted(load);

const goBack = () => {
  router.back();
};
</script>

<style scoped>
.class-detail {
  padding: 0;
}
.content {
  padding: 16px 16px 80px;
}
.summary-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.hero-card {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #eff6ff, #e0f2fe);
  border-color: #dbeafe;
}
.hero-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 20% 20%, rgba(59, 130, 246, 0.15), transparent 35%),
    radial-gradient(circle at 80% 0%, rgba(59, 130, 246, 0.12), transparent 30%);
  pointer-events: none;
}
.hero-card .row,
.hero-card .location,
.hero-card .description {
  position: relative;
}
.class-title {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.3;
  color: #0f172a;
}
.price {
  margin: 0;
  font-weight: 800;
  color: #0f172a;
}
.location {
  margin: 6px 0 0;
  color: #475569;
  font-size: 13px;
}
.description {
  margin: 6px 0 0;
  color: #6b7280;
  line-height: 1.5;
}
.banner {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
  background: #f0fdf4;
}
.banner-title {
  margin: 0;
  font-weight: 800;
  color: #166534;
}
.banner-sub {
  margin: 4px 0 0;
  color: #475569;
  font-size: 13px;
}
.banner-actions {
  margin-top: 8px;
}

.pill {
  background: #e0e7ff;
  color: #1d4ed8;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.pill.success {
  background: #dcfce7;
  color: #15803d;
}
.success-page {
  min-height: 100vh;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 16px calc(32px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}
.success-content {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  text-align: left;
}
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}
.hero-icon {
  width: 88px;
  height: 88px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
}
.hero-icon svg {
  width: 88px;
  height: 88px;
  display: block;
}
.hero-text h1 {
  margin: 0;
  font-size: 21px;
  font-weight: 700;
  color: #0f172a;
}
.hero-text p {
  margin: 4px 0 0;
  font-size: 13px;
  color: #475569;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.btn {
  width: 100%;
  height: 48px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  box-sizing: border-box;
  border: none;
}
.btn.primary {
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  letter-spacing: 0.01em;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.2);
}
.btn.secondary {
  border: 1px solid rgba(15, 23, 42, 0.16);
  background: #fff;
  color: #0f172a;
}
.section {
  margin-top: 20px;
}
.section-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.section-title {
  margin: 0;
  font-weight: 700;
  font-size: 16px;
}
.section-sub {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}
.picker {
  margin-top: 12px;
  width: 100%;
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.picker-value {
  margin: 0;
  font-weight: 700;
  font-size: 15px;
}
.placeholder {
  color: #9ca3af;
}
.cta-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px calc(env(safe-area-inset-bottom, 0px) + 12px);
  background: rgba(255, 255, 255, 0.96);
  border-top: 1px solid #e5e7eb;
}
.primary {
  width: 100%;
  height: 48px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #60a5fa);
  color: #fff;
  font-weight: 700;
  font-size: 16px;
}
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-end;
  z-index: 60;
}
.sheet {
  background: #fff;
  width: 100%;
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  padding: 12px 16px 24px;
}
.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sheet-title {
  margin: 0;
  font-weight: 700;
}
.close {
  border: none;
  background: transparent;
}
.lesson-list {
  margin-top: 8px;
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lesson-row {
  width: 100%;
  text-align: left;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  background: #f9fafb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  transition: background 0.1s ease, transform 0.1s ease;
}
.lesson-row.active {
  border-color: #2563eb;
  background: #eef2ff;
}
.lesson-row.disabled {
  opacity: 0.5;
}
.lesson-date {
  margin: 0;
  font-weight: 700;
}
.lesson-meta {
  margin: 2px 0 0;
  color: #6b7280;
  font-size: 13px;
}
.lesson-side {
  display: grid;
  align-items: center;
  justify-items: end;
  gap: 6px;
  min-width: 96px;
}
.lesson-capacity {
  font-size: 12px;
  color: #4b5563;
  background: #e5e7eb;
  padding: 2px 8px;
  border-radius: 999px;
  min-width: 74px;
  text-align: center;
}
.empty {
  text-align: center;
  color: #6b7280;
  margin: 12px 0;
}
</style>
