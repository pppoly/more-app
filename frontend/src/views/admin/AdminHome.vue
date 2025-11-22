<template>
  <main class="admin-home">
    <header class="page-head">
      <div>
        <p class="eyebrow">SOCIALMORE · 管理台</p>
        <h1>控制中心</h1>
        <p class="subhead">快捷进入 AI 与资源管理，查看运行状态与测试工具。</p>
      </div>
      <div class="head-meta">
        <div class="meta-item">
          <p>宪法版本</p>
          <strong>{{ constitutionMeta.version }}</strong>
        </div>
        <div class="meta-item">
          <p>最后更新</p>
          <strong>{{ constitutionMeta.lastUpdated }}</strong>
        </div>
      </div>
    </header>

    <section class="grid">
      <article
        v-for="item in navCards"
        :key="item.id"
        class="card tile"
        @click="handleNav(item)"
        role="button"
        tabindex="0"
      >
        <div class="tile-head">
          <div>
            <p class="tile-eyebrow">{{ item.category }}</p>
            <h2>{{ item.title }}</h2>
            <p class="tile-desc">{{ item.description }}</p>
          </div>
          <span class="tile-icon" :class="item.icon"></span>
        </div>
        <footer class="tile-footer">
          <span class="pill" :class="item.status === 'live' ? 'pill-live' : 'pill-draft'">
            {{ item.statusLabel }}
          </span>
          <span class="i-lucide-chevron-right"></span>
        </footer>
      </article>
    </section>

    <section class="card list-card">
      <header>
        <div>
          <p class="section-eyebrow">AI 工具</p>
          <h2>最近使用</h2>
        </div>
        <button type="button" class="ghost" @click="goToAiConsole">打开控制台</button>
      </header>
      <ul class="link-list">
        <li>
          <div>
            <p class="link-title">Prompt 管理</p>
            <p class="link-desc">查看/编辑/发布 Prompt</p>
          </div>
          <button type="button" class="link-button" @click="goToPrompts">
            进入
            <span class="i-lucide-arrow-up-right"></span>
          </button>
        </li>
        <li>
          <div>
            <p class="link-title">AI 控制台</p>
            <p class="link-desc">渲染/调用/翻译/评测</p>
          </div>
          <button type="button" class="link-button" @click="goToAiConsole">
            进入
            <span class="i-lucide-arrow-up-right"></span>
          </button>
        </li>
        <li>
          <div>
            <p class="link-title">使用概览</p>
            <p class="link-desc">各模块使用数据</p>
          </div>
          <button type="button" class="link-button" @click="goToUsage">
            查看
            <span class="i-lucide-arrow-up-right"></span>
          </button>
        </li>
      </ul>
    </section>

    <section class="card list-card">
      <header>
        <div>
          <p class="section-eyebrow">资源与权限</p>
          <h2>管理入口</h2>
        </div>
      </header>
      <ul class="link-list">
        <li>
          <div>
            <p class="link-title">资源配置</p>
            <p class="link-desc">Logo/图标/占位图维护</p>
          </div>
          <button type="button" class="link-button" @click="goToAssets">
            进入
            <span class="i-lucide-arrow-up-right"></span>
          </button>
        </li>
        <li>
          <div>
            <p class="link-title">员工与权限</p>
            <p class="link-desc">内部成员入口</p>
          </div>
          <button type="button" class="link-button" @click="goToStaff">
            进入
            <span class="i-lucide-arrow-up-right"></span>
          </button>
        </li>
        <li>
          <div>
            <p class="link-title">AI 宪法</p>
            <p class="link-desc">{{ constitutionSummary }}</p>
          </div>
          <button type="button" class="link-button" @click="openConstitutionSheet">
            查看
            <span class="i-lucide-arrow-up-right"></span>
          </button>
        </li>
      </ul>
    </section>

    <div v-if="showConstitutionSheet" class="sheet" @click.self="closeConstitutionSheet">
      <div class="sheet-body">
        <header class="sheet-head">
          <div>
            <p class="section-eyebrow">SOCIALMORE AI 宪法</p>
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

const constitutionMeta = {
  version: '1.0',
  releaseDate: '2025',
  author: 'Pang Mingyan（創翔モア）',
  lastUpdated: new Date().toLocaleString(),
};

const constitutionText = SOCIALMORE_AI_CONSTITUTION_V1.trim();
const showConstitutionSheet = ref(false);

const constitutionSummary = computed(() => {
  const lines = constitutionText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^SOCIALMORE/.test(line) && !/^Version/.test(line) && !/^Author/.test(line));
  return lines.slice(0, 5).join(' · ');
});

const navCards = [
  {
    id: 'ai-console',
    title: 'AI 控制台',
    description: '渲染/调用/翻译/评测一体化工具',
    icon: 'i-lucide-activity',
    route: { name: 'admin-ai-console' },
    status: 'live',
    statusLabel: 'LIVE',
    category: 'AI',
  },
  {
    id: 'ai-prompts',
    title: 'Prompt 管理',
    description: '编辑/发布 Prompt，查看状态',
    icon: 'i-lucide-wand',
    route: { name: 'admin-ai-prompts' },
    status: 'live',
    statusLabel: 'LIVE',
    category: 'AI',
  },
  {
    id: 'ai-usage',
    title: 'AI 使用概览',
    description: '模块运行数据与日志',
    icon: 'i-lucide-activity-square',
    route: { name: 'admin-ai-overview' },
    status: 'live',
    statusLabel: 'LIVE',
    category: '监控',
  },
  {
    id: 'assets',
    title: '资源配置',
    description: 'Logo/图标/占位图维护',
    icon: 'i-lucide-images',
    route: { name: 'admin-resource-manager' },
    status: 'live',
    statusLabel: 'LIVE',
    category: '资源',
  },
  {
    id: 'staff',
    title: '员工与权限',
    description: '内部成员与入口',
    icon: 'i-lucide-users',
    route: { name: 'MobileStaff' },
    status: 'live',
    statusLabel: 'LIVE',
    category: '权限',
  },
  {
    id: 'constitution',
    title: 'AI 宪法',
    description: '查看规则与版本信息',
    icon: 'i-lucide-shield-check',
    route: null,
    status: 'draft',
    statusLabel: 'INFO',
    category: '规则',
  },
];

const handleNav = (item: (typeof navCards)[number]) => {
  if (item.id === 'constitution') {
    openConstitutionSheet();
    return;
  }
  if (item.route) {
    router.push(item.route);
  }
};

const goToPrompts = () => router.push({ name: 'admin-ai-prompts' });
const goToAiConsole = () => router.push({ name: 'admin-ai-console' });
const goToUsage = () => router.push({ name: 'admin-ai-overview' });
const goToAssets = () => router.push({ name: 'admin-resource-manager' });
const goToStaff = () => router.push({ name: 'MobileStaff' });

const openConstitutionSheet = () => {
  showConstitutionSheet.value = true;
};

const closeConstitutionSheet = () => {
  showConstitutionSheet.value = false;
};
</script>

<style scoped>
.admin-home {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(80px + env(safe-area-inset-bottom, 0px));
  background: #f7f9fc;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #0f172a;
}

.page-head {
  padding: 16px;
  background: #0f172a;
  color: #fff;
  border-radius: 16px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.eyebrow {
  font-size: 0.8rem;
  letter-spacing: 0.15em;
  opacity: 0.85;
}

.page-head h1 {
  margin: 6px 0;
  font-size: 1.5rem;
}

.subhead {
  margin: 4px 0 0;
  opacity: 0.9;
}

.head-meta {
  display: flex;
  gap: 12px;
}

.meta-item {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 8px 12px;
}

.meta-item p {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.8;
}

.meta-item strong {
  display: block;
  margin-top: 4px;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.card {
  border-radius: 24px;
  padding: 20px;
  background: #fff;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
}

.tile {
  flex: 1 1 260px;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.tile:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.12);
}

.tile-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.tile-eyebrow {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
  letter-spacing: 0.12em;
}

.tile h2 {
  margin: 2px 0 4px;
  font-size: 1.2rem;
}

.tile-desc {
  margin: 0;
  color: #475569;
  line-height: 1.4;
}

.tile-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #eef2ff;
  color: #312e81;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
}

.tile-footer {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.85rem;
}

.pill-live {
  background: #ecfeff;
  color: #0ea5e9;
}

.pill-draft {
  background: #f3f4f6;
  color: #6b7280;
}

.card header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.section-eyebrow {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
  letter-spacing: 0.15em;
}

.card h2 {
  margin: 0.1rem 0 0;
  font-size: 1.4rem;
}

.section-time,
.section-tip {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.card-summary {
  margin: 1rem 0;
  font-size: 1rem;
  color: #1f2937;
  line-height: 1.6;
}

.link-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 1rem;
  border-radius: 999px;
  border: none;
  background: rgba(14, 165, 233, 0.12);
  color: #0369a1;
  font-weight: 600;
}

.module-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.module-row {
  border: 1px solid rgba(15, 23, 42, 0.05);
  border-radius: 18px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  background: linear-gradient(130deg, #fdfdfd, #f4f9ff);
}

.module-name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: #0f172a;
}

.module-desc {
  margin: 0;
  font-size: 0.95rem;
  color: #475569;
}

.module-mode {
  margin: 0;
  font-size: 0.85rem;
  color: #334155;
}

.module-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.status-pill {
  border-radius: 999px;
  padding: 0.3rem 0.9rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.status-pill.is-enabled {
  background: rgba(16, 185, 129, 0.15);
  color: #047857;
}

.status-pill.is-disabled {
  background: rgba(248, 113, 113, 0.18);
  color: #b91c1c;
}

.module-action {
  border: none;
  border-radius: 14px;
  padding: 0.6rem 1.2rem;
  font-weight: 600;
  background: linear-gradient(120deg, #0ea5e9, #2563eb);
  color: #fff;
}

.module-action:disabled {
  background: rgba(148, 163, 184, 0.3);
  color: #475569;
}

.staff-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.primary-button {
  border: none;
  border-radius: 18px;
  padding: 0.9rem 1.2rem;
  font-size: 1rem;
  font-weight: 600;
  background: linear-gradient(135deg, #10b981, #34d399);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.sheet {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  padding: 24px 16px;
  z-index: 50;
}

.sheet-body {
  width: 100%;
  max-height: 80vh;
  background: #fff;
  border-radius: 28px 28px 0 0;
  padding: 20px;
  box-shadow: 0 -20px 40px rgba(15, 23, 42, 0.25);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
}

.icon-button {
  border: none;
  border-radius: 12px;
  width: 40px;
  height: 40px;
  background: rgba(15, 23, 42, 0.05);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.sheet-content {
  flex: 1;
  padding: 1rem;
  border-radius: 16px;
  background: #f8fafc;
  overflow: auto;
  font-size: 0.9rem;
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
