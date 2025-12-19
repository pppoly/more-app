<template>
  <div class="success-page">
    <ConsoleTopBar v-if="showTopBar" class="topbar" titleKey="mobile.eventSuccess.title" @back="router.back()" />
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
            <path d="M22 32.5 29.5 40 42 24" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div class="hero-text">
          <h1>申込が完了しました</h1>
          <p>参加が確定しました</p>
        </div>
      </div>

      <div class="actions">
        <RouterLink class="btn primary" to="/me/events">マイイベントを見る</RouterLink>
        <RouterLink class="btn secondary" to="/events">イベント一覧へ戻る</RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MOBILE_EVENT_SUCCESS_KEY } from '../../constants/mobile';
import ConsoleTopBar from '../../components/console/ConsoleTopBar.vue';
import { isLineInAppBrowser } from '../../utils/liff';

const route = useRoute();
const router = useRouter();
const showTopBar = computed(() => !isLineInAppBrowser());

onMounted(() => {
  // 清理成功页数据，若无来源则回到列表
  try {
    const raw = sessionStorage.getItem(MOBILE_EVENT_SUCCESS_KEY);
    if (!raw) {
      router.replace('/events');
      return;
    }
    sessionStorage.removeItem(MOBILE_EVENT_SUCCESS_KEY);
  } catch {
    router.replace('/events');
  }
});
</script>

<style scoped>
.success-page {
  flex-direction: column;
  min-height: 100vh;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 16px calc(32px + env(safe-area-inset-bottom, 0px));
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
