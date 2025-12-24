<template>
  <main class="experience-entry" data-scroll="main">
    <div class="status-banner">
      <span class="dot"></span>
      <p>テスト環境｜料金は発生しません</p>
    </div>

    <section class="poster">
      <div class="poster-illust" aria-hidden="true"></div>
      <div class="poster-bg">
        <div class="glow glow-1"></div>
        <div class="glow glow-2"></div>
      </div>
      <div class="poster-content">
        <p class="poster-eyebrow">体験エントリー</p>
        <h1 class="poster-title">スマホでイベント申込みを実際に体験</h1>
        <p class="poster-desc">この後アプリが開き、申込みからQRチケット表示まで安全にお試しできます。</p>
        <div class="steps-inline">
          <span class="step-chip">① イベントを選ぶ</span>
          <span class="step-chip">② その場で申込む</span>
          <span class="step-chip">③ QRチケットが表示される</span>
        </div>
        <button type="button" class="cta" @click="goToEvents">
          アプリで体験する
        </button>
      </div>
    </section>

    <section class="note">
      <p class="note-title">安心ポイント</p>
      <ul class="note-list">
        <li>テスト環境のため、実際の支払いは発生しません</li>
        <li>タップ後、アプリに移動します</li>
      </ul>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { trackEvent } from '../../utils/analytics';

const router = useRouter();

const goToEvents = async () => {
  trackEvent('experience_entry_cta_click');
  await router.push({ name: 'events' });
};

onMounted(() => {
  document.title = 'テスト体験 | MORE';
  trackEvent('experience_entry_open');
});
</script>

<style scoped>
.experience-entry {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px calc(env(safe-area-inset-bottom, 0px) + 24px);
  background: linear-gradient(180deg, #f6f9ff 0%, #ffffff 55%, #f4f7fb 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #0f172a;
}

.status-banner {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  background: #eef2f7;
  color: #475569;
  font-size: 13px;
  border: 1px solid #e2e8f0;
  align-self: flex-start;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  display: inline-block;
}

.poster {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  padding: 20px 18px 18px;
  background: radial-gradient(circle at 20% 20%, rgba(79, 209, 197, 0.14), transparent 38%),
    radial-gradient(circle at 82% 18%, rgba(119, 152, 255, 0.14), transparent 36%),
    linear-gradient(135deg, #f0f8ff 0%, #e7f3ff 40%, #e6f6f3 100%);
  color: #0f172a;
  border: 1px solid #e2e8f0;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.12);
}
.poster-illust {
  position: absolute;
  inset: 0;
  background-image: url('https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=60');
  background-size: cover;
  background-position: center;
  opacity: 0.16;
  filter: saturate(0.9) blur(1px);
  mix-blend-mode: multiply;
  pointer-events: none;
}
.poster-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.glow {
  position: absolute;
  filter: blur(40px);
  opacity: 0.5;
}
.glow-1 {
  width: 180px;
  height: 180px;
  top: 10%;
  left: -6%;
  background: rgba(79, 209, 197, 0.3);
}
.glow-2 {
  width: 200px;
  height: 200px;
  bottom: -10%;
  right: -8%;
  background: rgba(119, 152, 255, 0.28);
}
.poster-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.poster-eyebrow {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.14em;
  color: #4b5563;
}
.poster-title {
  margin: 0;
  font-size: 25px;
  line-height: 1.3;
  color: #0f172a;
}
.poster-desc {
  margin: 0;
  color: #475569;
  font-size: 14px;
  line-height: 1.5;
}
.steps-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.step-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 999px;
  background: rgba(79, 209, 197, 0.12);
  color: #0f172a;
  font-size: 13px;
  border: 1px solid rgba(79, 209, 197, 0.35);
}
.cta {
  background: linear-gradient(135deg, #10b981, #0ea5e9);
  color: #ffffff;
  border: none;
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.08s ease, box-shadow 0.08s ease;
  box-shadow: 0 10px 20px rgba(22, 163, 74, 0.3);
  width: fit-content;
}
.cta:focus-visible {
  outline: 2px solid #c084fc;
  outline-offset: 2px;
}
.cta:active {
  transform: translateY(1px);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.16);
}

.note {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #0f172a;
  background: #ffffff;
  border-radius: 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
}
.note-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}
.note-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #475569;
}
.note-list li {
  line-height: 1.5;
}

@media (max-width: 480px) {
  .poster-title {
    font-size: 22px;
  }
}
</style>
