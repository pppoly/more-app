<template>
  <main class="admin-home">
    <header class="page-head">
      <div>
        <p class="eyebrow">SOCIALMORE · 管理コンソール</p>
        <h1>コントロールセンター</h1>
        <p class="subhead">審査・運用・財務をまとめて管理</p>
      </div>
      <div class="meta">
        <div class="meta-item">
          <p>憲法バージョン</p>
          <strong>{{ constitutionMeta.version }}</strong>
        </div>
        <div class="meta-item">
          <p>更新</p>
          <strong>{{ constitutionMeta.lastUpdated }}</strong>
        </div>
      </div>
    </header>

    <section v-for="section in sections" :key="section.id" class="card section-card">
      <header class="section-head">
        <div>
          <p class="section-eyebrow">{{ section.eyebrow }}</p>
          <h2>{{ section.title }}</h2>
        </div>
      </header>
      <div class="entry-list">
        <button
          v-for="item in section.items"
          :key="item.id"
          class="entry"
          type="button"
          @click="navigate(item)"
        >
          <div>
            <p class="entry-title">{{ item.title }}</p>
            <p class="entry-desc">{{ item.desc }}</p>
          </div>
          <span class="i-lucide-chevron-right"></span>
        </button>
      </div>
    </section>

    <section class="card section-card">
      <header class="section-head">
        <div>
          <p class="section-eyebrow">ルール</p>
          <h2>AI 憲法</h2>
        </div>
      </header>
      <div class="entry-list">
        <button class="entry" type="button" @click="openConstitutionSheet">
          <div>
            <p class="entry-title">AI 憲法全文</p>
            <p class="entry-desc">{{ constitutionSummary }}</p>
          </div>
          <span class="i-lucide-chevron-right"></span>
        </button>
      </div>
    </section>

    <div v-if="showConstitutionSheet" class="sheet" @click.self="closeConstitutionSheet">
      <div class="sheet-body">
        <header class="sheet-head">
          <div>
            <p class="section-eyebrow">SOCIALMORE AI 憲法</p>
            <h2>全文</h2>
          </div>
          <button type="button" class="icon-button" @click="closeConstitutionSheet">
            <span class="i-lucide-x"></span>
          </button>
        </header>
        <pre class="sheet-content">{{ constitutionText }}</pre>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { SOCIALMORE_AI_CONSTITUTION_V1 } from '../../ai/constitution';

const router = useRouter();
const showConstitutionSheet = ref(false);

const constitutionMeta = {
  version: '1.0',
  lastUpdated: new Date().toLocaleString(),
};

const constitutionText = SOCIALMORE_AI_CONSTITUTION_V1.trim();
const constitutionSummary = computed(() => {
  const lines = constitutionText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^SOCIALMORE/.test(line) && !/^Version/.test(line) && !/^Author/.test(line));
  return lines.slice(0, 2).join(' · ');
});

const sections = [
  {
    id: 'review',
    eyebrow: '審査',
    title: 'コンテンツとイベント',
    items: [
      { id: 'event-reviews', title: 'イベント審査', desc: 'pending / rejected の審査', route: { name: 'admin-event-reviews' } },
      { id: 'events', title: 'イベント一覧', desc: 'ステータス絞り込み · 終了/キャンセル', route: { name: 'admin-events' } },
    ],
  },
  {
    id: 'ops',
    eyebrow: '運用',
    title: 'ユーザー・主催者・コミュニティ・イベント',
    items: [
      { id: 'users', title: 'ユーザー管理', desc: '停止 / 有効化 / 役割', route: { name: 'admin-users' } },
      { id: 'communities', title: 'コミュニティ管理', desc: 'ステータス / 価格 / 無効化', route: { name: 'admin-communities' } },
      { id: 'events', title: 'イベント管理', desc: 'ライフサイクル管理', route: { name: 'admin-events' } },
    ],
  },
  {
    id: 'ai',
    eyebrow: 'AI',
    title: 'AI 管理',
    items: [
      { id: 'ai-console', title: 'AI コンソール', desc: 'レンダリング / 翻訳 / 評価', route: { name: 'admin-ai-console' } },
      { id: 'ai-prompts', title: 'Prompt 管理', desc: '閲覧 / 公開', route: { name: 'admin-ai-prompts' } },
      { id: 'ai-usage', title: 'AI 利用概要', desc: '利用データとログ', route: { name: 'admin-ai-overview' } },
    ],
  },
  {
    id: 'finance',
    eyebrow: '財務',
    title: '決済と収益',
    items: [{ id: 'payments', title: '決済モニター', desc: 'プラットフォーム手数料 / ステータス / 返金', route: { name: 'admin-payments' } }],
  },
];

const navigate = (item: (typeof sections)[number]['items'][number]) => {
  if (item.route) {
    router.push(item.route);
  }
};

const openConstitutionSheet = () => (showConstitutionSheet.value = true);
const closeConstitutionSheet = () => (showConstitutionSheet.value = false);
</script>

<style scoped>
.admin-home {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 12px calc(80px + env(safe-area-inset-bottom, 0px));
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #0f172a;
}
.page-head {
  padding: 14px;
  background: linear-gradient(135deg, #0f172a, #111827);
  color: #fff;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.22);
}
.eyebrow {
  font-size: 12px;
  letter-spacing: 0.12em;
  opacity: 0.85;
}
.page-head h1 {
  margin: 4px 0;
  font-size: 1.6rem;
  letter-spacing: -0.01em;
}
.subhead {
  margin: 0;
  opacity: 0.9;
  font-size: 0.95rem;
}
.meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}
.meta-item {
  background: rgba(255, 255, 255, 0.08);
  padding: 10px;
  border-radius: 12px;
  color: #e2e8f0;
}
.meta-item p {
  margin: 0;
  font-size: 12px;
  opacity: 0.9;
}
.meta-item strong {
  font-size: 14px;
}
.card {
  background: #fff;
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
}
.section-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.section-head h2 {
  margin: 4px 0 0;
}
.section-eyebrow {
  font-size: 12px;
  color: #475569;
  margin: 0;
}
.entry-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.entry {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  background: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  text-align: left;
}
.entry-title {
  margin: 0;
  font-weight: 700;
}
.entry-desc {
  margin: 4px 0 0;
  color: #475569;
  font-size: 13px;
}
.sheet {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: grid;
  place-items: center;
  z-index: 20;
  padding: 16px;
}
.sheet-body {
  background: #fff;
  border-radius: 18px;
  padding: 16px;
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sheet-content {
  margin: 0;
  font-size: 13px;
  color: #0f172a;
  max-height: 60vh;
  overflow-y: auto;
  white-space: pre-wrap;
}
.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.icon-button {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 10px;
  padding: 6px 10px;
}
</style>
