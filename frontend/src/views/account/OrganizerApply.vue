<template>
  <section class="apply-page">
    <div class="swiper" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove" @touchend="onTouchEnd">
      <div class="swiper-track" :style="trackStyle">
        <div v-for="(slide, index) in slides" :key="slide.id" class="swiper-slide">
          <div class="slide-card" :style="slideStyle(slide)" :class="['mood-' + (slide.mood || 'calm')]">
            <div class="visual">
              <div class="blob blob-1"></div>
              <div class="blob blob-2"></div>
              <div class="figure" :class="'figure-' + (slide.mood || 'calm')"></div>
            </div>
            <div class="copy">
              <p v-if="index === 0" class="pill pill--light">{{ t('organizerApply.badge') }}</p>
              <h2 class="slide-title">{{ slide.title }}</h2>
              <p class="slide-desc">{{ slide.desc }}</p>
              <p v-if="slide.hint" class="slide-hint">{{ slide.hint }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="dots">
      <button
        v-for="(slide, index) in slides"
        :key="slide.id"
        class="dot"
        :class="{ active: index === currentIndex }"
        @click="goTo(index)"
        aria-label="go-to-slide"
      ></button>
    </div>

    <div class="apply-bottom">
      <button type="button" class="primary" :disabled="submitting" @click="handleApplyAction">
        {{ submitting ? t('organizerApply.ctaProgress') : t('organizerApply.cta') }}
      </button>
    </div>

    <div v-if="showForm" class="modal-mask" @click.self="closeForm">
      <div class="modal-sheet">
        <div class="sheet-header">
          <div class="sheet-handle"></div>
          <h3>{{ t('organizerApply.form.title') }}</h3>
          <p class="sheet-desc">{{ t('organizerApply.form.desc') }}</p>
        </div>
        <form class="sheet-form" @submit.prevent="submit">
          <label>
            {{ t('organizerApply.form.reason') }} <span class="required">*</span>
            <textarea v-model="form.reason" rows="4" required :placeholder="t('organizerApply.form.reasonPlaceholder')"></textarea>
          </label>
          <label>
            {{ t('organizerApply.form.experience') }}
            <textarea v-model="form.experience" rows="3" :placeholder="t('organizerApply.form.experiencePlaceholder')"></textarea>
          </label>
          <p v-if="message" class="status">{{ message }}</p>
          <div class="sheet-actions">
            <button type="button" class="secondary secondary--ghost" @click="closeForm">{{ t('common.cancel') }}</button>
            <button type="submit" class="primary" :disabled="submitting">
              {{ submitting ? t('organizerApply.ctaProgress') : t('organizerApply.form.submit') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useAuth } from '../../composables/useAuth';
import { fetchMyOrganizerApplication, submitOrganizerApplication } from '../../api/client';
import type { OrganizerApplicationStatus } from '../../types/api';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

const auth = useAuth();
const user = auth.user;
const initializing = auth.initializing;
const router = useRouter();
const route = useRoute();
const { t } = useI18n();

const status = ref<OrganizerApplicationStatus | null>(null);
const loadingStatus = ref(false);
const submitting = ref(false);
const message = ref('');
const showForm = ref(false);
const form = reactive({
  reason: '',
  experience: '',
});
const isApproved = computed(() => Boolean(status.value?.isOrganizer || status.value?.application?.status === 'approved'));
const slides = computed(() => [
  { id: 'cover', title: t('organizerApply.slides.cover.title'), desc: t('organizerApply.slides.cover.desc'), hint: t('organizerApply.slides.cover.hint'), mood: 'calm', colors: ['#e9f1ff', '#f7fbff'] },
  { id: 'pain1', title: t('organizerApply.slides.pain1.title'), desc: t('organizerApply.slides.pain1.desc'), hint: t('organizerApply.slides.pain1.hint'), mood: 'blue', colors: ['#e8f0ff', '#f5f8ff'] },
  { id: 'pain2', title: t('organizerApply.slides.pain2.title'), desc: t('organizerApply.slides.pain2.desc'), hint: t('organizerApply.slides.pain2.hint'), mood: 'purple', colors: ['#f0e8ff', '#f9f5ff'] },
  { id: 'pain3', title: t('organizerApply.slides.pain3.title'), desc: t('organizerApply.slides.pain3.desc'), hint: t('organizerApply.slides.pain3.hint'), mood: 'slate', colors: ['#eef2ff', '#f7f9ff'] },
  { id: 'pain4', title: t('organizerApply.slides.pain4.title'), desc: t('organizerApply.slides.pain4.desc'), hint: t('organizerApply.slides.pain4.hint'), mood: 'green', colors: ['#eaf7f1', '#f7fffb'] },
  { id: 'turn', title: t('organizerApply.slides.turn.title'), desc: t('organizerApply.slides.turn.desc'), hint: t('organizerApply.slides.turn.hint'), mood: 'amber', colors: ['#fff4e5', '#fffaf2'] },
  { id: 'hope', title: t('organizerApply.slides.hope.title'), desc: t('organizerApply.slides.hope.desc'), hint: t('organizerApply.slides.hope.hint'), mood: 'teal', colors: ['#e8f9f7', '#f4fdfc'] },
  { id: 'ai', title: t('organizerApply.slides.ai.title'), desc: t('organizerApply.slides.ai.desc'), hint: t('organizerApply.slides.ai.hint'), mood: 'indigo', colors: ['#ecf0ff', '#f6f8ff'] },
  { id: 'cta', title: t('organizerApply.slides.cta.title'), desc: t('organizerApply.slides.cta.desc'), hint: t('organizerApply.slides.cta.hint'), cta: true, mood: 'cta', colors: ['#e6f5ff', '#f7fbff'] },
]);
const currentIndex = ref(0);
const trackStyle = computed(() => ({
  transform: `translateX(-${currentIndex.value * 100}%)`,
}));
const slideStyle = (slide: { colors?: string[] }) => {
  const [from, to] = slide.colors ?? ['#eef2ff', '#ffffff'];
  return {
    background: `linear-gradient(135deg, ${from}, ${to})`,
  };
};
const loadStatus = async () => {
  if (!user.value) {
    status.value = null;
    return;
  }
  loadingStatus.value = true;
  try {
    status.value = await fetchMyOrganizerApplication();
  } catch (error) {
    console.error('Failed to load organizer status', error);
  } finally {
    loadingStatus.value = false;
  }
};

watch(
  () => user.value?.id,
  (val) => {
    if (val) {
      loadStatus();
      if (typeof window !== 'undefined') {
        const bookingRedirect = window.localStorage.getItem('booking:redirect');
        const favoriteRedirect = window.localStorage.getItem('favorite:redirect');
        const queryRedirect = route.query.redirect as string | undefined;
        const redirect = bookingRedirect || favoriteRedirect || queryRedirect;
        if (bookingRedirect) {
          window.localStorage.removeItem('booking:redirect');
        }
        if (favoriteRedirect) {
          window.localStorage.removeItem('favorite:redirect');
        }
        if (redirect) {
          router.replace(redirect);
        }
      }
    } else {
      status.value = null;
    }
  },
  { immediate: true },
);

const handleApplyAction = () => {
  if (isApproved.value) {
    router.push({ name: 'console-communities' });
    return;
  }
  showForm.value = true;
  message.value = '';
  form.reason = '';
  form.experience = '';
};

const closeForm = () => {
  if (submitting.value) return;
  showForm.value = false;
};

let touchStartX = 0;
let touchDeltaX = 0;

const goTo = (index: number) => {
  const total = slides.value.length;
  if (index < 0 || index >= total) return;
  currentIndex.value = index;
};

const onTouchStart = (e: TouchEvent) => {
  if (!e.touches.length) return;
  touchStartX = e.touches[0].clientX;
  touchDeltaX = 0;
};

const onTouchMove = (e: TouchEvent) => {
  if (!e.touches.length) return;
  touchDeltaX = e.touches[0].clientX - touchStartX;
};

const onTouchEnd = () => {
  const total = slides.value.length;
  const threshold = 50;
  if (Math.abs(touchDeltaX) > threshold) {
    if (touchDeltaX < 0 && currentIndex.value < total - 1) {
      currentIndex.value += 1;
    }
    if (touchDeltaX > 0 && currentIndex.value > 0) {
      currentIndex.value -= 1;
    }
  }
  touchStartX = 0;
  touchDeltaX = 0;
};

let autoTimer: number | null = null;
const startAuto = () => {
  stopAuto();
  autoTimer = window.setInterval(() => {
    const total = slides.value.length;
    currentIndex.value = currentIndex.value >= total - 1 ? 0 : currentIndex.value + 1;
  }, 5000);
};
const stopAuto = () => {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
};

onMounted(() => {
  startAuto();
});

onUnmounted(() => {
  stopAuto();
});

const submit = async () => {
  if (!user.value) {
    router.push({ name: 'auth-login', query: { redirect: route.fullPath } });
    return;
  }
  if (!form.reason.trim()) {
    message.value = t('organizer.apply.form.reasonRequired');
    return;
  }
  submitting.value = true;
  message.value = '';
  try {
    await submitOrganizerApplication({
      reason: form.reason.trim(),
      experience: form.experience.trim() || undefined,
    });
    message.value = t('organizer.apply.form.success');
    showForm.value = false;
    await auth.fetchCurrentUser();
    await loadStatus();
  } catch (error) {
    console.error(error);
    message.value = t('organizer.apply.form.error');
  } finally {
    submitting.value = false;
  }
};

</script>

<style scoped>
.apply-page {
  background: #f4f6fb;
  height: 100vh;
  overflow: hidden;
  padding: 12px 0 100px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.swiper {
  width: 100%;
  overflow: hidden;
}
.swiper-track {
  display: flex;
  transition: transform 0.3s ease;
}
.swiper-slide {
  flex: 0 0 100%;
  padding: 0 16px;
  box-sizing: border-box;
}
.slide-card {
  background: #fff;
  border-radius: 20px;
  padding: 32px 20px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  min-height: calc(70vh - 40px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.slide-title {
  margin: 0;
  font-size: 22px;
  line-height: 1.35;
  color: #0f172a;
}
.slide-desc {
  margin: 0;
  font-size: 17px;
  line-height: 1.6;
  color: #334155;
}
.slide-hint {
  margin: 0;
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
  white-space: pre-line;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(37, 99, 235, 0.08);
  color: #2563eb;
  align-self: flex-start;
}
.pill--light {
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
  border: 1px solid rgba(37, 99, 235, 0.2);
}
.primary {
  border: none;
  border-radius: 999px;
  padding: 14px 16px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #22c55e);
  text-align: center;
  width: 100%;
  box-shadow: 0 12px 28px rgba(37, 99, 235, 0.25);
}
.cta-button {
  margin-top: 8px;
}
.visual {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.blob {
  position: absolute;
  width: 240px;
  height: 240px;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.6;
}
.blob-1 {
  top: -60px;
  right: -40px;
}
.blob-2 {
  bottom: -80px;
  left: -60px;
}
.figure {
  position: absolute;
  width: 140px;
  height: 140px;
  border-radius: 24px;
  top: 24px;
  left: 24px;
  background: linear-gradient(160deg, #ffffffaa, #ffffff33);
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.1);
  transform: rotate(-4deg);
}
.figure::after {
  content: '';
  position: absolute;
  inset: 18px;
  border-radius: 18px;
  background: linear-gradient(135deg, #ffffff88, transparent);
}
.copy {
  position: relative;
  z-index: 1;
}
.mood-blue .blob-1 {
  background: #9dd2ff;
}
.mood-blue .blob-2 {
  background: #b4c9ff;
}
.mood-purple .blob-1 {
  background: #d5c6ff;
}
.mood-purple .blob-2 {
  background: #f2d8ff;
}
.mood-slate .blob-1 {
  background: #cfd7e6;
}
.mood-slate .blob-2 {
  background: #e3e8f2;
}
.mood-green .blob-1 {
  background: #b3f1d0;
}
.mood-green .blob-2 {
  background: #d8f9e7;
}
.mood-amber .blob-1 {
  background: #ffd8a8;
}
.mood-amber .blob-2 {
  background: #ffe9c7;
}
.mood-teal .blob-1 {
  background: #a7f0e0;
}
.mood-teal .blob-2 {
  background: #c8fff2;
}
.mood-indigo .blob-1 {
  background: #c9d7ff;
}
.mood-indigo .blob-2 {
  background: #dfe6ff;
}
.mood-cta .blob-1 {
  background: #9cd4ff;
}
.mood-cta .blob-2 {
  background: #bff1d9;
}
.secondary {
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  padding: 12px 16px;
  color: #0f172a;
  text-align: center;
  background: #f8fafc;
}
.secondary--ghost {
  background: #f8fafc;
}
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 30;
  padding: 0 10px 10px;
}
.modal-sheet {
  width: 100%;
  background: #fff;
  border-radius: 20px 20px 0 0;
  padding: 20px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  box-shadow: 0 -10px 28px rgba(15, 23, 42, 0.18);
  max-width: 480px;
  margin: 0 auto;
}
.sheet-header {
  text-align: center;
  margin-bottom: 12px;
}
.sheet-handle {
  width: 44px;
  height: 4px;
  border-radius: 999px;
  background: #e2e8f0;
  margin: 0 auto 10px;
}
.sheet-desc {
  margin: 6px 0 0;
  color: #475569;
  font-size: 13px;
}
.sheet-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
}
.sheet-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-weight: 600;
  color: #0f172a;
  font-size: 14px;
  width: 100%;
}
.sheet-form textarea {
  width: 100%;
  border-radius: 12px;
  border: 1px solid #cbd5e1;
  padding: 12px;
  font-size: 14px;
  background: #f8fafc;
  min-height: 96px;
  box-sizing: border-box;
}
.sheet-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}
.status {
  color: #334155;
}
.apply-bottom {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 10px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 -10px 24px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(6px);
  z-index: 20;
  display: flex;
  justify-content: center;
}
.apply-bottom .primary {
  max-width: 480px;
}
.dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 70px; /* leave space for bottom CTA */
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  border: none;
  background: #cbd5e1;
}
.dot.active {
  width: 18px;
  background: linear-gradient(135deg, #2563eb, #22c55e);
}
</style>
