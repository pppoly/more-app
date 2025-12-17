<template>
  <div class="success-page">
    <section class="success-card" :class="{ 'is-paid': isPaid }">
      <div class="status-chip" :class="{ 'chip-paid': isPaid }">
        {{ isPaid ? '有料チケット' : '無料 / 0円イベント' }}
      </div>
      <div class="success-icon" :class="{ 'icon-paid': isPaid }">
        <span :class="isPaid ? 'i-lucide-badge-check' : 'i-lucide-party-popper'"></span>
      </div>
      <h1>{{ headline }}</h1>
      <p class="success-message">{{ subline }}</p>

      <div v-if="isPaid" class="receipt-card">
        <div class="receipt-row">
          <span>支払い金額</span>
          <strong>{{ amountText }}</strong>
        </div>
        <div class="receipt-row">
          <span>チケット</span>
          <span>{{ ticketLabel }}</span>
        </div>
        <div class="receipt-row">
          <span>日程</span>
          <span>{{ payload?.timeText }}</span>
        </div>
        <div class="receipt-row">
          <span>会場 / 参加方法</span>
          <span>{{ payload?.locationText }}</span>
        </div>
      </div>

      <div v-else class="steps-card">
        <p class="step-title">次のステップ</p>
        <ul>
          <li>イベント詳細で集合場所と持ち物をチェック</li>
          <li>「マイイベント」で申込状況をいつでも確認</li>
        </ul>
      </div>

      <div class="event-meta">
        <p class="meta-title">{{ payload?.title }}</p>
        <p class="meta-line">{{ payload?.timeText }}</p>
        <p class="meta-line">{{ payload?.locationText }}</p>
      </div>

      <div class="success-actions">
        <RouterLink class="primary-btn" :to="eventDetailPath">イベント詳細へ戻る</RouterLink>
        <RouterLink class="ghost-btn" to="/me/events">マイイベントを見る</RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MOBILE_EVENT_SUCCESS_KEY } from '../../constants/mobile';

type SuccessPayload = {
  eventId: string;
  title: string;
  timeText: string;
  locationText: string;
  priceText?: string;
  registrationId?: string;
  ticketName?: string;
  amount?: number | null;
  paymentStatus: 'free' | 'paid';
  holdExpiresAt?: string;
};

const props = defineProps<{ eventId?: string }>();
const route = useRoute();
const router = useRouter();
const payload = ref<SuccessPayload | null>(null);

const isPaid = computed(() => payload.value?.paymentStatus === 'paid');
const headline = computed(() => (isPaid.value ? '参加が正式に確定しました' : '申込が完了しました'));
const subline = computed(() =>
  isPaid.value
    ? 'お支払いを確認しました。電子チケットとしてこの画面と「マイイベント」をご利用ください。'
    : '参加枠を確保しました。詳細を確認して当日の準備を進めましょう。',
);
const ticketLabel = computed(() => payload.value?.ticketName ?? payload.value?.priceText ?? '参加チケット');
const amountFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});
const amountText = computed(() => {
  const amount = payload.value?.amount;
  if (typeof amount === 'number') return amountFormatter.format(amount);
  if (payload.value?.priceText) return payload.value.priceText;
  return '未定';
});

const eventDetailPath = computed(() => {
  const eventId = payload.value?.eventId ?? props.eventId ?? (route.params.eventId as string | undefined);
  return eventId ? `/events/${eventId}` : '/events';
});

onMounted(() => {
  try {
    const raw = sessionStorage.getItem(MOBILE_EVENT_SUCCESS_KEY);
    if (!raw) {
      router.replace('/events');
      return;
    }
    payload.value = JSON.parse(raw) as SuccessPayload;
    sessionStorage.removeItem(MOBILE_EVENT_SUCCESS_KEY);
  } catch {
    router.replace('/events');
  }
});
</script>

<style scoped>
.success-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 60%, #e5e7eb 100%);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 32px 20px calc(60px + env(safe-area-inset-bottom, 0px));
}

.success-card {
  width: 100%;
  max-width: 460px;
  background: #fff;
  border-radius: 24px;
  padding: 28px;
  text-align: center;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.15);
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  overflow: hidden;
}
.success-card.is-paid {
  background: linear-gradient(145deg, #0f172a, #1d2b4a);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 25px 50px rgba(15, 23, 42, 0.35);
  color: #e2e8f0;
}

.status-chip {
  align-self: flex-start;
  padding: 6px 12px;
  border-radius: 12px;
  background: rgba(14, 165, 233, 0.1);
  color: #0f172a;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.02em;
}
.status-chip.chip-paid {
  background: rgba(59, 130, 246, 0.16);
  color: #1d4ed8;
  border: 1px solid rgba(59, 130, 246, 0.2);
}
.success-card.is-paid .status-chip {
  color: #dbeafe;
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(219, 234, 254, 0.3);
}

.success-icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: linear-gradient(135deg, #0ea5e9, #22c55e);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  color: #fff;
  margin: 0 auto;
  box-shadow: 0 15px 30px rgba(14, 165, 233, 0.3);
}
.success-card.is-paid .success-icon {
  background: linear-gradient(135deg, #16a34a, #22c55e);
  box-shadow: 0 15px 30px rgba(34, 197, 94, 0.35);
}

.success-card h1 {
  margin: 8px 0 0;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
}
.success-card.is-paid h1 {
  color: #f8fafc;
}

.success-message {
  margin: 0;
  font-size: 14px;
  color: #475569;
  line-height: 1.6;
}
.success-card.is-paid .success-message {
  color: #d9e2ff;
}

.receipt-card {
  margin-top: 8px;
  background: rgba(15, 23, 42, 0.03);
  border: 1px dashed rgba(15, 23, 42, 0.12);
  border-radius: 18px;
  padding: 14px 16px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.success-card.is-paid .receipt-card {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.18);
}
.receipt-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: #334155;
}
.receipt-row strong {
  font-size: 16px;
}
.success-card.is-paid .receipt-row {
  color: #e2e8f0;
}

.steps-card {
  text-align: left;
  background: rgba(14, 165, 233, 0.08);
  border: 1px solid rgba(14, 165, 233, 0.16);
  border-radius: 16px;
  padding: 14px 16px;
}
.step-title {
  margin: 0 0 6px;
  font-weight: 700;
  color: #0f172a;
}
.steps-card ul {
  margin: 0;
  padding-left: 18px;
  color: #1f2937;
  line-height: 1.6;
  font-size: 14px;
}

.event-meta {
  margin-top: 6px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(14, 165, 233, 0.06);
  text-align: left;
  color: #0f172a;
}
.meta-title {
  margin: 0 0 4px;
  font-weight: 700;
  font-size: 15px;
}
.meta-line {
  margin: 0;
  color: #334155;
  font-size: 14px;
}
.success-card.is-paid .event-meta {
  background: rgba(255, 255, 255, 0.06);
  color: #e5edff;
}
.success-card.is-paid .meta-line {
  color: #d1d9e6;
}

.success-actions {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.primary-btn,
.ghost-btn {
  width: 100%;
  border-radius: 16px;
  padding: 14px 18px;
  font-weight: 600;
  font-size: 15px;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.primary-btn {
  background: linear-gradient(135deg, #0090d9, #22bbaa);
  color: #fff;
  border: none;
  box-shadow: 0 12px 30px rgba(0, 144, 217, 0.35);
}
.success-card.is-paid .primary-btn {
  background: linear-gradient(135deg, #38bdf8, #60a5fa);
  color: #0b1224;
  box-shadow: 0 12px 28px rgba(96, 165, 250, 0.35);
}

.ghost-btn {
  border: 1px solid rgba(15, 23, 42, 0.15);
  background: #fff;
  color: #0f172a;
}
.success-card.is-paid .ghost-btn {
  border-color: rgba(226, 232, 240, 0.4);
  color: #e2e8f0;
  background: transparent;
}
</style>
