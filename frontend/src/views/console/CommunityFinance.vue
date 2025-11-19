<template>
  <section class="finance-page" v-if="community">
    <header class="page-header">
      <div>
        <p class="label">{{ community.slug }}</p>
        <h2>決済・サブスクリプション設定</h2>
      </div>
      <RouterLink
        v-if="community"
        :to="{ name: 'console-community-events', params: { communityId: community.id } }"
        class="link-btn"
      >
        イベント一覧へ戻る
      </RouterLink>
    </header>

    <div class="grid">
      <article class="card">
        <header>
          <h3>Stripe Connect</h3>
          <span :class="stripeReady ? 'status success' : 'status warn'">
            {{ stripeReady ? '連携済み' : '未連携' }}
          </span>
        </header>
        <p class="muted">Stripeアカウントを連携すると有料イベントの売上を受け取れます。</p>
        <ul class="info-list">
          <li>
            <span>アカウントID</span>
            <strong>{{ community.stripeAccountId || '未作成' }}</strong>
          </li>
          <li>
            <span>連携ステータス</span>
            <strong>{{ stripeReady ? '情報審査済み' : '要審査' }}</strong>
          </li>
        </ul>
        <button class="primary" @click="handleOnboarding" :disabled="onboarding">
          {{ onboarding ? 'リンクを作成中...' : stripeReady ? '情報を更新する' : 'Stripe連携を開始' }}
        </button>
        <p class="hint">
          {{ stripeReady ? '必要に応じて情報更新リンクを開きます。' : 'リンクを開き、Stripeの案内に沿って情報を入力してください。' }}
        </p>
      </article>

      <article class="card">
        <header>
          <h3>MOREプラン</h3>
          <span class="status info">
            {{
              activePlan
                ? `${activePlan.name} / 月額¥${activePlan.monthlyFee}`
                : '未設定'
            }}
          </span>
        </header>
        <p class="muted">プランを選択すると、適用される決済手数料やサポート範囲が変わります。</p>
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
              <p>月額 ¥{{ plan.monthlyFee }} / 決済手数料 {{ plan.transactionFeePercent }}% + ¥{{ plan.transactionFeeFixed }}</p>
              <small>支払スケジュール: {{ plan.payoutSchedule }}</small>
              <ul class="feature-list" v-if="Array.isArray(plan.features?.items)">
                <li v-for="item in plan.features.items" :key="item">・{{ item }}</li>
              </ul>
            </div>
          </label>
        </div>
        <div class="actions">
          <button class="secondary" @click="resetSelection" :disabled="planUpdating || !planChanged">変更を取り消す</button>
          <button class="primary" @click="savePlan" :disabled="planUpdating || !planChanged || pricingPlans.length === 0">
            {{ planUpdating ? '更新中...' : 'プランを保存' }}
          </button>
        </div>
        <p class="hint">プラン変更は即時反映されます。Stripe請求が必要なプランは、連携完了後に課金されます。</p>
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

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label {
  margin: 0;
  color: var(--color-subtext);
  font-size: 0.85rem;
}

.link-btn {
  border: 1px solid var(--color-border);
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  font-size: 0.9rem;
  color: var(--color-primary);
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
