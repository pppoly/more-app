<template>
  <div class="success-page">
    <ConsoleTopBar v-if="showTopBar" class="topbar" title="申込完了" @back="router.back()" />
    <div class="content">
      <div class="hero">
        <div class="hero-icon" aria-hidden="true">
          <svg viewBox="0 0 64 64" role="img">
            <defs>
              <linearGradient id="success-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0ea5e9" />
                <stop offset="100%" stop-color="#22c55e" />
              </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="30" fill="url(#success-grad)" />
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
          <h1>{{ headline }}</h1>
          <p>{{ message }}</p>
        </div>
      </div>

      <div v-if="payload?.title || payload?.timeText || payload?.locationText" class="summary">
        <p v-if="payload?.title" class="summary-title">{{ payload.title }}</p>
        <p v-if="payload?.timeText" class="summary-line">{{ payload.timeText }}</p>
        <p v-if="payload?.locationText" class="summary-line">{{ payload.locationText }}</p>
      </div>

      <div class="actions">
        <RouterLink
          v-if="resolvedEventId"
          class="btn secondary"
          :to="{ name: 'event-detail', params: { eventId: resolvedEventId } }"
        >
          イベント詳細へ戻る
        </RouterLink>
        <RouterLink class="btn primary" to="/me/events">マイチケットを見る</RouterLink>
        <RouterLink class="btn secondary" to="/events">イベント一覧へ戻る</RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ConsoleTopBar from '../../components/console/ConsoleTopBar.vue';
import { MOBILE_EVENT_SUCCESS_KEY } from '../../constants/mobile';
import { isLineInAppBrowser } from '../../utils/liff';

const props = defineProps<{ eventId?: string }>();

const route = useRoute();
const router = useRouter();
const showTopBar = computed(() => !isLineInAppBrowser());

type SuccessPayload = {
  eventId?: string;
  title?: string;
  timeText?: string;
  locationText?: string;
  paymentStatus?: 'free' | 'paid' | string;
  status?: string;
  paymentRequired?: boolean;
  amount?: number | null;
};
const payload = ref<SuccessPayload | null>(null);

const resolvedEventId = computed(() => {
  return payload.value?.eventId ?? props.eventId ?? (route.params.eventId as string | undefined) ?? null;
});

const registrationStatus = computed(() => payload.value?.status ?? null);
const paymentRequired = computed(() => Boolean(payload.value?.paymentRequired));
const amount = computed(() => (typeof payload.value?.amount === 'number' ? payload.value.amount : null));

const isPendingApproval = computed(() => registrationStatus.value === 'pending');
const isFree = computed(() => {
  if (payload.value?.paymentStatus === 'free') return true;
  if (amount.value !== null) return amount.value <= 0;
  return false;
});

const headline = computed(() => {
  if (isPendingApproval.value) return '申し込みを受け付けました';
  if (isFree.value) return '申し込みが完了しました';
  return 'お支払いが完了しました';
});
const message = computed(() => {
  if (isPendingApproval.value) {
    if ((amount.value ?? 0) > 0 && !paymentRequired.value) {
      return '主催者の承認後にお支払いが必要です。承認までお待ちください。';
    }
    return '主催者の承認をお待ちください。';
  }
  if (isFree.value) return '参加登録を受け付けました。マイチケットで確認できます。';
  return 'Stripeでのお支払いを受け付けました。参加ステータスは数分以内に反映されます。';
});

onMounted(() => {
  // 成功ページのデータをクリアし、参照元がなければ一覧へ戻る
  try {
    const raw = sessionStorage.getItem(MOBILE_EVENT_SUCCESS_KEY);
    if (!raw) {
      router.replace('/events');
      return;
    }
    try {
      payload.value = JSON.parse(raw) as SuccessPayload;
    } catch {
      payload.value = null;
    }
    sessionStorage.removeItem(MOBILE_EVENT_SUCCESS_KEY);
  } catch {
    router.replace('/events');
  }
});
</script>

<style scoped>
.success-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f8fafc;
  align-items: center;
  justify-content: flex-start;
  padding: 12px 16px calc(24px + env(safe-area-inset-bottom, 0px));
  gap: 12px;
  box-sizing: border-box;
}

.topbar {
  width: 100%;
  margin-left: calc(-16px - env(safe-area-inset-left, 0px));
  margin-right: calc(-16px - env(safe-area-inset-right, 0px));
}

.content {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  margin: 6px 0 0;
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
}

.summary {
  border-radius: 14px;
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  padding: 14px;
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.06);
}

.summary-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.summary-line {
  margin: 6px 0 0;
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
  min-height: 48px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  box-sizing: border-box;
  border: 1px solid transparent;
}

.btn.primary {
  border: none;
  background: linear-gradient(135deg, #0ea5e9, #22c55e);
  color: #fff;
  letter-spacing: 0.01em;
  box-shadow: 0 10px 22px rgba(14, 165, 233, 0.2);
}

.btn.secondary {
  border: 1px solid rgba(15, 23, 42, 0.16);
  background: #fff;
  color: #0f172a;
}
</style>
