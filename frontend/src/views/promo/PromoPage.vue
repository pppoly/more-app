<template>
  <div class="promo-page">
    <header class="promo-header">
      <div class="logo">SOCIALMORE</div>
      <span class="env-badge">テスト環境 / Test</span>
    </header>

    <main class="promo-main">
      <section class="card">
        <h1 class="title">スマホでのご利用をおすすめします</h1>
        <p class="desc">
          このページはモバイル/LINE向けに最適化されています。PCからのアクセスでは一部機能が利用できません。
        </p>

        <div class="copy-row">
          <label class="copy-label">スマホで開くリンク</label>
          <div class="copy-box">
            <input ref="copyInput" :value="copyLink" class="copy-input" readonly />
            <button type="button" class="primary copy-btn" @click="copy">
              {{ copying ? 'コピー中...' : 'リンクをコピー' }}
            </button>
          </div>
        </div>

        <div class="accordion">
          <button type="button" class="accordion-toggle" @click="showGuide = !showGuide">
            <span>スマホで開く方法</span>
            <span class="i-lucide-chevron-down" :class="{ open: showGuide }"></span>
          </button>
          <ul v-if="showGuide" class="guide-list">
            <li>1) スマホでこのURLを開く</li>
            <li>2) LINE内ブラウザで開く（必要な場合）</li>
            <li>3) ログインして続ける</li>
          </ul>
        </div>

        <div class="qr-block">
          <div class="qr-box">
            <div class="qr-placeholder">QR生成は後で差し替え</div>
          </div>
          <div class="qr-text">
            <p class="qr-title">QRコード</p>
            <p class="qr-desc">スマホのカメラで読み取ってください</p>
          </div>
        </div>

        <div v-if="fromPath" class="from-row">
          <p class="from-label">元のページ</p>
          <p class="from-path">{{ fromPath }}</p>
          <p class="from-hint">スマホで開くと、このページに戻れます</p>
        </div>

        <p class="footnote">※ テスト環境のため挙動が変更される場合があります</p>
        <button type="button" class="ghost back-btn" @click="goBack">戻る</button>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useToast } from '../../composables/useToast';

const route = useRoute();
const toast = useToast();
const copyInput = ref<HTMLInputElement | null>(null);
const copying = ref(false);
const showGuide = ref(false);

const fromPath = computed(() => {
  const raw = (route.query.from as string) || '';
  if (raw && raw.startsWith('/')) return raw;
  return '';
});

const copyLink = computed(() => {
  if (typeof window === 'undefined') return '';
  const target = fromPath.value || '/';
  return `${window.location.origin}${target}`;
});

const copy = async () => {
  if (!copyLink.value) return;
  copying.value = true;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(copyLink.value);
      toast.show('コピーしました');
    } else if (copyInput.value) {
      copyInput.value.select();
      document.execCommand('copy');
      toast.show('コピーしました');
    } else {
      throw new Error('clipboard not available');
    }
  } catch {
    toast.show('コピーに失敗しました', { type: 'error' });
  } finally {
    copying.value = false;
  }
};

const goBack = () => {
  if (history.length > 1) {
    history.back();
  }
};

onMounted(() => {
  // noop; ensure copyLink computed after mount
});
</script>

<style scoped>
.promo-page {
  min-height: 100vh;
  background: #f8fafc;
  padding: 20px 16px 40px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.promo-header {
  width: 100%;
  max-width: 720px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.logo {
  font-weight: 800;
  font-size: 18px;
  color: #0f172a;
}
.env-badge {
  font-size: 12px;
  color: #475569;
}
.promo-main {
  width: 100%;
  display: flex;
  justify-content: center;
}
.card {
  width: 100%;
  max-width: 640px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.title {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
}
.desc {
  margin: 0;
  color: #475569;
  line-height: 1.6;
}
.copy-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.copy-label {
  font-weight: 700;
  font-size: 13px;
  color: #334155;
}
.copy-box {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.copy-input {
  flex: 1;
  min-width: 220px;
  height: 46px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
  background: #f8fafc;
}
.copy-btn {
  white-space: nowrap;
}
.accordion {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px 12px;
  background: #f8fafc;
}
.accordion-toggle {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 700;
  padding: 4px 0;
}
.accordion-toggle .open {
  transform: rotate(180deg);
}
.guide-list {
  margin: 8px 0 0;
  padding-left: 18px;
  color: #475569;
  line-height: 1.6;
}
.qr-block {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.qr-box {
  width: 120px;
  height: 120px;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
}
.qr-placeholder {
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
  padding: 4px;
}
.qr-text .qr-title {
  margin: 0;
  font-weight: 700;
  color: #0f172a;
}
.qr-text .qr-desc {
  margin: 4px 0 0;
  color: #475569;
}
.from-row {
  border-top: 1px dashed #e5e7eb;
  padding-top: 12px;
}
.from-label {
  margin: 0;
  font-size: 13px;
  color: #475569;
  font-weight: 700;
}
.from-path {
  margin: 2px 0 0;
  font-weight: 700;
  color: #0f172a;
  word-break: break-all;
}
.from-hint {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 13px;
}
.footnote {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
}
.back-btn {
  align-self: flex-start;
}
.primary {
  height: 46px;
  border-radius: 12px;
  border: none;
  padding: 0 16px;
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  font-weight: 700;
  font-size: 15px;
}
.ghost {
  height: 44px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #0f172a;
  padding: 0 14px;
  font-weight: 700;
}
@media (max-width: 640px) {
  .card {
    border-radius: 12px;
    padding: 16px;
  }
  .title {
    font-size: 20px;
  }
  .copy-box {
    flex-direction: column;
    align-items: stretch;
  }
  .copy-btn {
    width: 100%;
  }
  .qr-box {
    width: 100px;
    height: 100px;
  }
}
</style>
