<template>
  <div class="desktop-landing">
    <header class="landing-header">
      <div class="brand">
        <span class="brand-logo">More</span>
        <span class="brand-subtitle">Community Console</span>
      </div>
      <nav class="header-actions">
        <button class="ghost-button" @click="goMarketing">
          {{ t('hero.learnMore') }}
        </button>
        <button class="primary-button" @click="goConsole">
          {{ t('hero.openConsole') }}
        </button>
      </nav>
    </header>

    <main>
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">{{ t('hero.eyebrow') }}</p>
          <h1>{{ t('hero.title') }}</h1>
          <p class="subtitle">
            {{ t('hero.subtitle') }}
          </p>
          <div class="hero-cta">
            <button class="primary-button" @click="goConsole">
              {{ t('hero.primaryCta') }}
            </button>
            <button class="secondary-button" @click="goApply">
              {{ t('hero.secondaryCta') }}
            </button>
          </div>
        </div>
        <div class="hero-visual hidden md:block">
          <div class="hero-panel">
            <p class="panel-eyebrow">{{ t('panel.eyebrow') }}</p>
            <h3>{{ t('panel.title') }}</h3>
            <ul>
              <li v-for="item in panelHighlights" :key="item.title">
                <h4>{{ item.title }}</h4>
                <p>{{ item.body }}</p>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section class="feature-grid">
        <article v-for="feature in features" :key="feature.title" class="feature-card">
          <div class="feature-icon" :aria-label="feature.title">
            <span :class="feature.icon"></span>
          </div>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.body }}</p>
        </article>
      </section>

      <section class="cta-banner">
        <div>
          <p class="eyebrow">{{ t('cta.eyebrow') }}</p>
          <h2>{{ t('cta.title') }}</h2>
          <p>{{ t('cta.body') }}</p>
        </div>
        <div class="cta-actions">
          <button class="primary-button" @click="goConsole">
            {{ t('cta.primary') }}
          </button>
          <button class="ghost-button" @click="goApply">
            {{ t('cta.secondary') }}
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

const panelHighlights = [
  { title: '企画から集客まで', body: 'テンプレートとAI支援でイベント設計を短時間で完了。' },
  { title: 'コミュニティ運営', body: '財務状況やエンゲージメントをリアルタイム可視化。' },
  { title: '多言語サポート', body: '日／英／中の3言語での配信とサポートに対応。' },
];

const features = [
  {
    icon: 'i-lucide-rocket',
    title: 'コンソールで一元管理',
    body: 'イベント作成、チケット販売、精算までブラウザ一つで完結します。',
  },
  {
    icon: 'i-lucide-users',
    title: 'コミュニティを成長',
    body: 'メンバー分析や推奨アクションで、新しい参加者を継続的に獲得。',
  },
  {
    icon: 'i-lucide-shield-check',
    title: '信頼される管理基盤',
    body: 'KYC、決済、審査フローを内蔵し、安全に運営を開始できます。',
  },
];

const goConsole = () => {
  router.push({ path: '/console-desktop' });
};

const goApply = () => {
  router.push({ name: 'organizer-apply' });
};

const goMarketing = () => {
  if (typeof window === 'undefined') return;
  window.open('https://socialmore.jp', '_blank', 'noopener');
};

const t = (key: string) =>
  (
    {
      'hero.eyebrow': 'SOCIALMORE CONSOLE',
      'hero.title': 'コミュニティとイベントのための運営ハブ',
      'hero.subtitle': 'SocialMore の主催者コンソールで、企画から決済・振込までを安全に運用できます。',
      'hero.primaryCta': 'Console を開く',
      'hero.secondaryCta': '主催者になる',
      'hero.learnMore': 'サービス概要',
      'panel.eyebrow': 'Console でできること',
      'panel.title': '最初の 30 日を伴走します',
      'cta.eyebrow': 'Ready to build?',
      'cta.title': 'メールアドレスだけで数分で開始',
      'cta.body': '登録後は SocialMore チームが審査・運用のセットアップをサポートします。',
      'cta.primary': 'ログイン / 登録',
      'cta.secondary': '導入相談を予約',
    } satisfies Record<string, string>
  )[key] ?? key;
</script>

<style scoped>
.desktop-landing {
  min-height: 100vh;
  background: radial-gradient(circle at top left, #14233b, #05070c);
  color: #f8fbff;
  display: flex;
  flex-direction: column;
}

.landing-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 4vw;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.brand {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.brand-logo {
  font-size: 1.25rem;
  font-weight: 700;
  text-shadow: none;
  box-shadow: none;
}

.brand-subtitle {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
}

.header-actions {
  display: flex;
  gap: 0.75rem;
}

main {
  padding: 4rem 6vw 5rem;
  display: flex;
  flex-direction: column;
  gap: 4rem;
}

.hero {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 3rem;
}

.hero-copy h1 {
  font-size: clamp(2.4rem, 4vw, 3.6rem);
  margin-bottom: 1rem;
}

.subtitle {
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 1.5rem;
}

.hero-cta {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.hero-panel {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1.5rem;
  padding: 2rem;
  backdrop-filter: blur(6px);
}

.hero-panel ul {
  list-style: none;
  padding: 0;
  margin: 1.5rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.5rem;
}

.feature-card {
  background: rgba(13, 178, 212, 0.08);
  padding: 1.75rem;
  border-radius: 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.feature-icon {
  width: 3rem;
  height: 3rem;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  font-size: 1.25rem;
}

.cta-banner {
  background: linear-gradient(135deg, #0b86ee, #0cd0c2);
  border-radius: 1.5rem;
  padding: 2.5rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  color: #031320;
}

.cta-actions {
  display: flex;
  gap: 1rem;
}

.primary-button,
.secondary-button,
.ghost-button {
  border-radius: 999px;
  padding: 0.85rem 1.75rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
}

.primary-button {
  background: #00d2a0;
  color: #031320;
}

.secondary-button {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.ghost-button {
  background: transparent;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.75rem;
  opacity: 0.7;
  margin-bottom: 0.75rem;
}

@media (max-width: 768px) {
  main {
    padding: 2rem 1.5rem 3rem;
  }

  .landing-header {
    flex-direction: column;
    gap: 1rem;
  }
}
</style>
