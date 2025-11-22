<template>
  <main class="admin-home">
    <section class="hero">
      <p class="hero-chip">SOCIALMORE · 管理端</p>
      <h1>AI 宪法驾驶舱</h1>
      <p class="hero-desc">
        这里是老板与核心员工的总控面板：随时掌握宪法版本、运行中的 AI 模块，并进入需要验证的功能。
      </p>
      <div class="hero-tags">
        <div class="hero-tag">
          <p>宪法版本</p>
          <strong>{{ constitutionMeta.version }}</strong>
        </div>
        <div class="hero-tag">
          <p>发布年份</p>
          <strong>{{ constitutionMeta.releaseDate }}</strong>
        </div>
        <div class="hero-tag">
          <p>制定者</p>
          <strong>{{ constitutionMeta.author }}</strong>
        </div>
      </div>
    </section>

    <section class="quick-actions">
      <button
        v-for="action in quickActions"
        :key="action.id"
        type="button"
        class="quick-card"
        @click="handleQuickAction(action.id)"
      >
        <span :class="['quick-icon', action.icon]"></span>
        <div>
          <p class="quick-title">{{ action.title }}</p>
          <p class="quick-desc">{{ action.description }}</p>
        </div>
        <span class="quick-arrow i-lucide-chevron-right"></span>
      </button>
    </section>

    <section class="card constitution-card">
      <header>
        <div>
          <p class="section-eyebrow">SOCIALMORE AI 宪法</p>
          <h2>核心规则摘要</h2>
        </div>
        <p class="section-time">最后更新 {{ constitutionMeta.lastUpdated }}</p>
      </header>
      <p class="card-summary">
        {{ constitutionSummary }}
      </p>
      <button class="link-button" type="button" @click="openConstitutionSheet">
        查看全文
        <span class="i-lucide-arrow-up-right"></span>
      </button>
    </section>

    <section class="card module-card">
      <header>
        <div>
          <p class="section-eyebrow">AI 模块</p>
          <h2>运行状态</h2>
        </div>
        <p class="section-tip">验证：确认 Coach/Editor 标签 + Speak → Guide → Write → Confirm 四步</p>
      </header>
      <article v-for="module in aiModules" :key="module.id" class="module-row">
        <div class="module-text">
          <p class="module-name">{{ module.name }}</p>
          <p class="module-desc">{{ module.description }}</p>
          <p class="module-mode">{{ module.modes }}</p>
        </div>
        <div class="module-meta">
          <span :class="['status-pill', module.enabled ? 'is-enabled' : 'is-disabled']">
            {{ module.enabled ? '运行中' : '建设中' }}
          </span>
          <button
            class="module-action"
            type="button"
            :disabled="!module.route"
            @click="openModule(module)"
          >
            {{ module.route ? module.actionLabel : '敬请期待' }}
          </button>
        </div>
      </article>
    </section>

    <section class="card staff-card">
      <header>
        <div>
          <p class="section-eyebrow">组织与权限</p>
          <h2>员工 · 合作伙伴</h2>
        </div>
        <p class="section-tip">所有员工入口统一从此进入，避免桌面式导航。</p>
      </header>
      <button type="button" class="primary-button" @click="goToStaff">
        进入员工管理
        <span class="i-lucide-users"></span>
      </button>
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

const quickActions = [
  {
    id: 'console',
    title: '活动助手',
    description: '直接进入 AI 对话创建流程',
    icon: 'i-lucide-bot',
  },
  {
    id: 'staff',
    title: '员工与权限',
    description: '管理内部成员与入口',
    icon: 'i-lucide-users',
  },
  {
    id: 'usage',
    title: 'AI 使用概览',
    description: '查看各模块的实时使用数据',
    icon: 'i-lucide-activity',
  },
  {
    id: 'assets',
    title: '资源配置',
    description: '维护 Logo / 功能图标 / 占位图',
    icon: 'i-lucide-images',
  },
  {
    id: 'constitution',
    title: '宪法详情',
    description: '随时复盘最高规则',
    icon: 'i-lucide-shield-check',
  },
];

const aiModules = [
  {
    id: 'event',
    name: '活动助手（Console）',
    description: '社群活动从点火到落地的全流程对话式助手',
    modes: 'Coach → Editor → Writer',
    enabled: true,
    actionLabel: '打开模块',
    route: { path: '/console' },
  },
  {
    id: 'community',
    name: '社区策略助手',
    description: '围绕社群定位、增长与多语言内容的智能支持',
    modes: 'Coach / Editor（筹备中）',
    enabled: false,
    actionLabel: '敬请期待',
    route: null,
  },
  {
    id: 'translator',
    name: '翻译 · 多语言指南',
    description: '日本生活语境与官方文本的实时翻译与校对',
    modes: 'Editor 模式（筹备中）',
    enabled: false,
    actionLabel: '敬请期待',
    route: null,
  },
];

const goToConsole = () => {
  router.push({ path: '/console' });
};

const goToStaff = () => {
  router.push({ name: 'MobileStaff' });
};

const openModule = (module: (typeof aiModules)[number]) => {
  if (!module.route) return;
  router.push(module.route);
};

const handleQuickAction = (actionId: string) => {
  if (actionId === 'console') {
    goToConsole();
    return;
  }
  if (actionId === 'staff') {
    goToStaff();
    return;
  }
  if (actionId === 'usage') {
    router.push({ name: 'admin-ai-overview' });
    return;
  }
  if (actionId === 'assets') {
    router.push({ name: 'admin-resource-manager' });
    return;
  }
  if (actionId === 'constitution') {
    openConstitutionSheet();
  }
};

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
  background: linear-gradient(180deg, #eff6ff 0%, #f8fafc 40%, #ffffff 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #0f172a;
}

.hero {
  border-radius: 28px;
  padding: 24px;
  background: linear-gradient(135deg, #002b5b, #01497c, #00a6fb);
  color: #fff;
  box-shadow: 0 25px 60px rgba(1, 46, 91, 0.3);
}

.hero-chip {
  font-size: 0.8rem;
  letter-spacing: 0.2em;
  opacity: 0.8;
}

.hero h1 {
  margin: 0.45rem 0 0.4rem;
  font-size: 2rem;
}

.hero-desc {
  margin: 0 0 1rem;
  font-size: 1rem;
  opacity: 0.95;
}

.hero-tags {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.hero-tag {
  padding: 0.75rem;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.14);
}

.hero-tag p {
  margin: 0;
  font-size: 0.8rem;
  opacity: 0.85;
}

.hero-tag strong {
  display: block;
  margin-top: 0.3rem;
  font-size: 1.2rem;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.quick-card {
  border: none;
  border-radius: 12px;
  padding: 16px;
  background: #fff;
  box-shadow: 0 18px 35px rgba(15, 23, 42, 0.08);
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
}

.quick-icon {
  width: 44px;
  height: 44px;
  border-radius: 16px;
  background: rgba(14, 165, 233, 0.12);
  color: #0ea5e9;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
}

.quick-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: #0f172a;
}

.quick-desc {
  margin: 0;
  font-size: 0.9rem;
  color: #475569;
}

.quick-arrow {
  margin-left: auto;
  color: #94a3b8;
}

.card {
  border-radius: 24px;
  padding: 20px;
  background: #fff;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
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
