<template>
  <div class="success-page">
    <section class="success-card">
      <div class="success-icon">
        <span class="i-lucide-party-popper"></span>
      </div>
      <h1>报名成功</h1>
      <p class="success-message">我们已经为你保留了名额，稍后可在「我的活动」查看报名详情。</p>
      <div class="success-actions">
        <RouterLink class="primary-btn" :to="eventDetailPath">返回活动详情</RouterLink>
        <RouterLink class="ghost-btn" to="/me/events">查看我的报名</RouterLink>
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
  paymentStatus: 'free' | 'paid';
  holdExpiresAt?: string;
};

const props = defineProps<{ eventId?: string }>();
const route = useRoute();
const router = useRouter();
const payload = ref<SuccessPayload | null>(null);

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
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 20px calc(120px + env(safe-area-inset-bottom, 0px));
}

.success-card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 24px;
  padding: 28px;
  text-align: center;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.15);
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.success-card h1 {
  margin: 8px 0 0;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
}

.success-message {
  margin: 0;
  font-size: 14px;
  color: #475569;
  line-height: 1.6;
}

.success-actions {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
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
}

.primary-btn {
  background: linear-gradient(135deg, #0090d9, #22bbaa);
  color: #fff;
  border: none;
  box-shadow: 0 12px 30px rgba(0, 144, 217, 0.35);
}

.ghost-btn {
  border: 1px solid rgba(15, 23, 42, 0.15);
  background: #fff;
  color: #0f172a;
}
</style>
