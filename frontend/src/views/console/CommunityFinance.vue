<template>
  <section class="finance-page" v-if="community">
    <header class="hero">
      <div class="hero-text">
        <p class="eyebrow">受け取り設定 · {{ community.slug }}</p>
        <h2>{{ stripeReady ? '受け取り準備完了' : '受け取りを有効にしましょう' }}</h2>
        <p class="sub">
          {{
            stripeReady
              ? '情報が正しければ入金できます。変更があればいつでも更新できます。'
              : 'Stripe の案内に沿って入力すれば、すぐに受け取りを開始できます。'
          }}
        </p>
        <div class="hero-actions">
          <button class="primary" @click="handleOnboarding" :disabled="onboarding">
            {{ onboarding ? '移動中…' : stripeReady ? '受け取り情報を更新' : 'Stripe 受け取りを開始' }}
          </button>
          <button class="secondary" type="button" disabled>出金する（準備中）</button>
          <span :class="stripeReady ? 'pill success' : 'pill warn'">
            {{ stripeReady ? '準備完了' : '未設定' }}
          </span>
        </div>
      </div>
      <div class="hero-meta">
        <p>Stripe アカウント</p>
        <strong>{{ community.stripeAccountId || '未作成' }}</strong>
        <small>{{ stripeReady ? '受け取り可能' : '情報の入力が必要' }}</small>
      </div>
    </header>

    <div class="grid">
      <article class="card">
        <header>
          <h3>アカウント状態</h3>
          <span :class="stripeReady ? 'status success' : 'status warn'">
            {{ stripeReady ? '連携済み' : '未連携' }}
          </span>
        </header>
        <p class="muted">アカウントを整えると、イベント収益を受け取れます。</p>
        <ul class="info-list">
          <li>
            <span>アカウントID</span>
            <strong>{{ community.stripeAccountId || '未作成' }}</strong>
          </li>
          <li>
            <span>ステータス</span>
            <strong>{{ stripeReady ? '審査済み' : '未提出 / 審査中' }}</strong>
          </li>
        </ul>
        <button class="primary" @click="handleOnboarding" :disabled="onboarding">
          {{ onboarding ? '移動中…' : stripeReady ? '情報を更新' : '受け取りを開始' }}
        </button>
        <p class="hint">Stripe で情報入力を完了すると、受け取りを開始できます。</p>
      </article>

      <article class="card">
        <header>
          <h3>MORE 受け取りプラン</h3>
          <span class="status info">
            {{
              activePlan
                ? `${activePlan.name} / 月¥${activePlan.monthlyFee}`
                : '未選択'
            }}
          </span>
        </header>
        <p class="muted">最適なプランを選び、手数料と内容を確認しましょう。</p>
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
              <p>月額 ¥{{ plan.monthlyFee }} ｜ プラットフォーム手数料 {{ formatPlatformFee(plan) }}</p>
              <small>{{ t('subscription.stripeFee') }} {{ stripeFeeDisplay }}</small>
              <small>入金頻度: {{ plan.payoutSchedule }}</small>
              <ul class="feature-list" v-if="Array.isArray(plan.features?.items)">
                <li v-for="item in plan.features.items" :key="item">· {{ item }}</li>
              </ul>
            </div>
          </label>
        </div>
        <div class="actions">
          <button class="secondary" @click="resetSelection" :disabled="planUpdating || !planChanged">変更を取り消す</button>
          <button class="primary" @click="savePlan" :disabled="planUpdating || !planChanged || pricingPlans.length === 0">
            {{ planUpdating ? '保存中…' : '選択を保存' }}
          </button>
        </div>
        <p class="hint">選択後すぐ反映されます。課金は情報の入力完了後に開始されます。</p>
      </article>
    </div>

    <p v-if="error" class="status error">{{ error }}</p>
  </section>

  <p v-else class="status">対象のコミュニティが見つかりません。</p>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import {
  fetchConsoleCommunity,
  fetchPricingPlans,
  startCommunityStripeOnboarding,
  subscribeCommunityPlan,
} from '../../api/client';
import type { ConsoleCommunityDetail, PricingPlan } from '../../types/api';
import { PLATFORM_FEE_WAIVED, STRIPE_FEE_FIXED_JPY, STRIPE_FEE_PERCENT } from '../../config';

const route = useRoute();
const communityId = route.params.communityId as string;

const community = ref<ConsoleCommunityDetail | null>(null);
const pricingPlans = ref<PricingPlan[]>([]);
const selectedPlanId = ref<string>('');
const savedPlanId = ref<string>('');
const onboarding = ref(false);
const planUpdating = ref(false);
const error = ref<string | null>(null);
const { t } = useI18n();

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
const formatYen = (value: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value || 0);
const stripeFeeRateText = computed(() => {
  const percent = STRIPE_FEE_PERCENT;
  if (!Number.isFinite(percent)) return '';
  const percentText = Number.isInteger(percent) ? `${percent}%` : `${percent}%`;
  if (STRIPE_FEE_FIXED_JPY > 0) {
    return `${percentText} + ${formatYen(STRIPE_FEE_FIXED_JPY)}`;
  }
  return percentText;
});
const stripeFeeDisplay = computed(
  () => stripeFeeRateText.value || t('subscription.plans.free.stripeFee'),
);
const formatPlatformFee = (plan: PricingPlan) => {
  if (PLATFORM_FEE_WAIVED) return t('subscription.betaPlatformFeeValue');
  const fixed = plan.transactionFeeFixed ?? 0;
  const fixedText = fixed > 0 ? ` + ${formatYen(fixed)}` : '';
  return `${plan.transactionFeePercent}%${fixedText}`;
};

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
.primary:disabled,
.secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
