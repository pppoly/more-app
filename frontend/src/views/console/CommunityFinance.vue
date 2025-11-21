<template>
  <section class="finance-page" v-if="community">
    <header class="hero">
      <div class="hero-text">
        <p class="eyebrow">收银台 · {{ community.slug }}</p>
        <h2>{{ stripeReady ? '可以收钱啦' : '先把收款开起来' }}</h2>
        <p class="sub">
          {{ stripeReady ? '资料正确就能正常打款，信息变了可以随时更新。' : '跟着 Stripe 填信息，很快就能收票款。' }}
        </p>
        <div class="hero-actions">
          <button class="primary" @click="handleOnboarding" :disabled="onboarding">
            {{ onboarding ? '跳转中...' : stripeReady ? '更新收款信息' : '去开通 Stripe 收款' }}
          </button>
          <span :class="stripeReady ? 'pill success' : 'pill warn'">
            {{ stripeReady ? '已准备' : '待开通' }}
          </span>
        </div>
      </div>
      <div class="hero-meta">
        <p>Stripe 账户</p>
        <strong>{{ community.stripeAccountId || '未创建' }}</strong>
        <small>{{ stripeReady ? '可收款' : '需要完成资料' }}</small>
      </div>
    </header>

    <div class="grid">
      <article class="card">
        <header>
          <h3>账户状态</h3>
          <span :class="stripeReady ? 'status success' : 'status warn'">
            {{ stripeReady ? '已联通' : '尚未开通' }}
          </span>
        </header>
        <p class="muted">先把账户开好，活动收入才打得进来。</p>
        <ul class="info-list">
          <li>
            <span>账户 ID</span>
            <strong>{{ community.stripeAccountId || '未创建' }}</strong>
          </li>
          <li>
            <span>状态</span>
            <strong>{{ stripeReady ? '已通过审核' : '待提交/审核中' }}</strong>
          </li>
        </ul>
        <button class="primary" @click="handleOnboarding" :disabled="onboarding">
          {{ onboarding ? '跳转中...' : stripeReady ? '更新资料' : '立即开通收款' }}
        </button>
        <p class="hint">跳到 Stripe 填完信息，再回来就能继续收钱。</p>
      </article>

      <article class="card">
        <header>
          <h3>MORE 收款方案</h3>
          <span class="status info">
            {{
              activePlan
                ? `${activePlan.name} / 月¥${activePlan.monthlyFee}`
                : '未选择'
            }}
          </span>
        </header>
        <p class="muted">挑一个最合适的方案，看看手续费和支持内容。</p>
        <div class="plan-list">
          <label v-for="plan in pricingPlans" :key="plan.id" :class="['plan-card', { selected: selectedPlanId === plan.id }]">
            <input
              type="radio"
              name="plan"
              :value="plan.id"
              v-model="selectedPlanId"
              :disabled="planUpdating"
            />
            <div>
              <h4>{{ plan.name }}</h4>
              <p>月费 ¥{{ plan.monthlyFee }} ｜ 手续费 {{ plan.transactionFeePercent }}% + ¥{{ plan.transactionFeeFixed }}</p>
              <small>结算频率: {{ plan.payoutSchedule }}</small>
              <ul class="feature-list" v-if="Array.isArray(plan.features?.items)">
                <li v-for="item in plan.features.items" :key="item">· {{ item }}</li>
              </ul>
            </div>
          </label>
        </div>
        <div class="actions">
          <button class="secondary" @click="resetSelection" :disabled="planUpdating || !planChanged">撤销修改</button>
          <button class="primary" @click="savePlan" :disabled="planUpdating || !planChanged || pricingPlans.length === 0">
            {{ planUpdating ? '保存中...' : '保存选择' }}
          </button>
        </div>
        <p class="hint">选择后立即生效；收费方案会在资料完成后才开始扣款。</p>
      </article>
    </div>

    <p v-if="error" class="status error">{{ error }}</p>
  </section>

  <p v-else class="status">対象のコミュニティが見つかりません。</p>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  fetchConsoleCommunity,
  fetchPricingPlans,
  startCommunityStripeOnboarding,
  subscribeCommunityPlan,
} from '../../api/client';
import type { ConsoleCommunityDetail, PricingPlan } from '../../types/api';

const route = useRoute();
const communityId = route.params.communityId as string;

const community = ref<ConsoleCommunityDetail | null>(null);
const pricingPlans = ref<PricingPlan[]>([]);
const selectedPlanId = ref<string>('');
const savedPlanId = ref<string>('');
const onboarding = ref(false);
const planUpdating = ref(false);
const error = ref<string | null>(null);

const load = async () => {
  error.value = null;
  try {
    const [communityData, plans] = await Promise.all([fetchConsoleCommunity(communityId), fetchPricingPlans()]);
    community.value = communityData;
    pricingPlans.value = plans;
    savedPlanId.value = community.value?.pricingPlanId || plans[0]?.id || '';
    selectedPlanId.value = savedPlanId.value;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '設定情報の取得に失敗しました';
  }
};

const stripeReady = computed(() => Boolean(community.value?.stripeAccountId && community.value?.stripeAccountOnboarded));
const planChanged = computed(() => selectedPlanId.value !== savedPlanId.value);
const activePlan = computed(() => pricingPlans.value.find((plan) => plan.id === savedPlanId.value) || null);

const handleOnboarding = async () => {
  onboarding.value = true;
  error.value = null;
  try {
    const { url } = await startCommunityStripeOnboarding(communityId);
    window.location.href = url;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Stripe連携リンクの生成に失敗しました';
  } finally {
    onboarding.value = false;
  }
};

const savePlan = async () => {
  if (!planChanged.value || !selectedPlanId.value) return;
  planUpdating.value = true;
  error.value = null;
  try {
    await subscribeCommunityPlan(communityId, selectedPlanId.value);
    savedPlanId.value = selectedPlanId.value;
    if (community.value) {
      community.value.pricingPlanId = selectedPlanId.value;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'プランの保存に失敗しました';
  } finally {
    planUpdating.value = false;
  }
};

const resetSelection = () => {
  selectedPlanId.value = savedPlanId.value;
};

onMounted(load);
</script>

<style scoped>
.finance-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.hero {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 1rem;
  background: linear-gradient(135deg, #2563eb, #10b981);
  color: #f8fafc;
  padding: 1.25rem;
  border-radius: 1rem;
  box-shadow: 0 18px 45px rgba(37, 99, 235, 0.22);
}

.hero-text h2 {
  margin: 0 0 0.25rem;
  font-size: 1.6rem;
}

.eyebrow {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.8rem;
  opacity: 0.9;
}

.sub {
  margin: 0 0 0.6rem;
  color: #e2f3ff;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.hero-meta {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  color: #e2f3ff;
}

.hero-meta strong {
  font-size: 1.1rem;
  color: #fff;
}

.pill {
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  font-weight: 700;
  font-size: 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.pill.success {
  background: rgba(16, 185, 129, 0.2);
  color: #d1fae5;
}

.pill.warn {
  background: rgba(251, 191, 36, 0.2);
  color: #fef3c7;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1rem;
}

.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.card header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.status {
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}

.status.success {
  background: #dcfce7;
  color: #15803d;
}

.status.warn {
  background: #fef3c7;
  color: #b45309;
}

.status.info {
  background: #e0f2fe;
  color: #0369a1;
}

.muted {
  margin: 0;
  color: var(--color-subtext);
}

.info-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.info-list li {
  display: flex;
  justify-content: space-between;
  font-size: 0.95rem;
}

.hint {
  font-size: 0.8rem;
  color: var(--color-subtext);
}

.primary {
  border: none;
  background: var(--color-primary);
  color: #fff;
  padding: 0.6rem 1.2rem;
  border-radius: 999px;
  font-weight: 600;
  width: fit-content;
}

.secondary {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-primary);
  padding: 0.55rem 1.1rem;
  border-radius: 999px;
  font-weight: 600;
}

.plan-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.plan-card {
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 0.75rem;
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}

.plan-card.selected {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.plan-card input {
  margin-top: 0.3rem;
}

.plan-card h4 {
  margin: 0 0 0.25rem;
}

.plan-card p {
  margin: 0;
  font-size: 0.9rem;
}

.plan-card small {
  color: var(--color-subtext);
}

.feature-list {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  color: #475569;
}

.actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.status.error {
  color: #b91c1c;
}
</style>
