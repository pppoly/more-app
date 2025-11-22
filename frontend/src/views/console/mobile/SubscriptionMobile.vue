<template>
  <div class="subscription-page" :class="{ 'subscription-page--payment': Boolean(paymentClientSecret) }">
    <template v-if="!paymentClientSecret">
      <header class="sub-header">
        <div>
          <p class="sub-label">订阅计划</p>
          <h1>选择你的收款能力</h1>
        </div>
        <button class="refresh-btn" type="button" @click="reload" :disabled="loading || paying">
          <span class="i-lucide-refresh-ccw" />
        </button>
      </header>

    <div v-if="loading" class="empty">加载中…</div>
    <div v-else-if="!communityId" class="empty">
      <p>请先选择一个社群再订阅套餐。</p>
    </div>

    <div v-else class="plan-list">
      <button
        v-for="plan in plans"
        :key="plan.id"
        class="plan-card"
        :class="{ active: plan.id === activePlanId, paying: paymentPlanId === plan.id }"
        type="button"
        :disabled="submittingId === plan.id || paying"
        @click="startSubscribe(plan.id)"
      >
        <div class="plan-head">
          <div>
            <p class="plan-name">{{ plan.name }}</p>
            <p class="plan-price">
              <span v-if="plan.monthlyFee > 0">¥{{ plan.monthlyFee }}/月</span>
              <span v-else>免费</span>
            </p>
          </div>
          <span v-if="plan.id === activePlanId" class="plan-badge">当前</span>
        </div>
        <p class="plan-meta">手续费：{{ plan.transactionFeePercent }}% + ¥{{ plan.transactionFeeFixed }}</p>
        <p class="plan-meta">结算：{{ plan.payoutSchedule }}</p>
        <p class="plan-meta">功能：{{ summaryFeatures(plan) }}</p>
        <div class="plan-action">
          <span v-if="submittingId === plan.id" class="loading">处理中...</span>
          <span v-else-if="paymentPlanId === plan.id" class="loading">填写支付信息</span>
          <span v-else-if="plan.id === activePlanId" class="current">已订阅</span>
          <span v-else class="action-cta">开通</span>
        </div>
      </button>
      <div v-if="!plans.length" class="empty">暂无可选套餐</div>
    </div>

      <p v-if="error" class="error">{{ error }}</p>
    </template>

    <template v-else>
      <div class="payment-overlay" @click.self="resetPayment">
        <section class="payment-sheet">
          <header class="pay-header">
            <div class="pay-handle" />
            <div class="pay-title">
              <p class="sub-label">支付确认</p>
              <h1>{{ payingPlan?.name || '套餐支付' }}</h1>
            </div>
            <button class="close-btn" type="button" :disabled="paying" @click="resetPayment">
              <span class="i-lucide-x" />
            </button>
          </header>
          <div class="pay-amount" v-if="payingPlan">
            ¥{{ payingPlan.monthlyFee }}/月
          </div>
          <div class="payment-tip">请在应用内完成支付，成功后自动开通套餐</div>
          <div ref="paymentElementContainer" class="payment-element"></div>
          <button class="pay-btn" type="button" :disabled="paying" @click="confirmPayment">
            <span v-if="paying" class="spinner" /> 确认并支付
          </button>
          <p v-if="error" class="error">{{ error }}</p>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import {
  fetchConsoleCommunity,
  fetchPricingPlans,
  subscribeCommunityPlan,
} from '../../../api/client';
import type { PricingPlan } from '../../../types/api';
import { loadStripe, type Stripe, type StripeElements, type PaymentElement as StripePaymentElement } from '@stripe/stripe-js';
import { useRouter } from 'vue-router';
import { useToast } from '../../../composables/useToast';

const communityStore = useConsoleCommunityStore();
const router = useRouter();
const toast = useToast();
const plans = ref<PricingPlan[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const submittingId = ref<string | null>(null);
const paying = ref(false);
const paymentClientSecret = ref<string | null>(null);
const paymentPlanId = ref<string | null>(null);
const paymentElementContainer = ref<HTMLDivElement | null>(null);
let stripeInstance: Stripe | null = null;
let elementsInstance: StripeElements | null = null;
let paymentElement: StripePaymentElement | null = null;

const communityId = computed(() => communityStore.activeCommunityId.value);
const activePlanId = computed(() => communityStore.getActiveCommunity()?.pricingPlanId ?? null);

const loadPlans = async () => {
  error.value = null;
  loading.value = true;
  try {
    plans.value = await fetchPricingPlans();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '无法获取套餐列表';
  } finally {
    loading.value = false;
  }
};

const summaryFeatures = (plan: PricingPlan) => {
  if (!plan.features || typeof plan.features !== 'object') return '基础支持';
  const featureList = Object.values(plan.features).flat() as string[];
  if (!featureList.length) return '基础支持';
  return featureList.slice(0, 3).join(' / ');
};

const startSubscribe = async (planId: string) => {
  if (!communityId.value || submittingId.value) return;
  submittingId.value = planId;
  error.value = null;
  try {
    const res = await subscribeCommunityPlan(communityId.value, planId);
    if (res.clientSecret && res.publishableKey) {
      paymentPlanId.value = planId;
      paymentClientSecret.value = res.clientSecret;
      await setupPaymentElement(res.clientSecret, res.publishableKey);
    } else if (planById(planId)?.monthlyFee && planById(planId)!.monthlyFee > 0) {
      throw new Error('支付配置缺失，请检查后端 Stripe publishable key');
    } else {
      await reload();
      toast.show('已切换套餐', 'success');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '订阅失败';
  } finally {
    submittingId.value = null;
  }
};

const planById = (planId: string) => plans.value.find((p) => p.id === planId);
const payingPlan = computed(() => (paymentPlanId.value ? planById(paymentPlanId.value) : null));

const reload = async () => {
  await communityStore.loadCommunities(true);
  if (communityId.value) {
    const res = await fetchConsoleCommunity(communityId.value).catch(() => null);
    if (res?.id) {
      communityStore.setActiveCommunity(res.id);
    }
  }
  await loadPlans();
};

onMounted(async () => {
  if (!communityStore.loaded.value) {
    await communityStore.loadCommunities();
    communityStore.ensureActiveCommunity();
  }
  await loadPlans();
});

const setupPaymentElement = async (clientSecret: string, publishableKey: string) => {
  if (!publishableKey) {
    throw new Error('缺少 Stripe publishable key');
  }
  stripeInstance = await loadStripe(publishableKey);
  if (!stripeInstance) {
    throw new Error('Stripe 初始化失败');
  }
  elementsInstance = stripeInstance.elements({
    clientSecret,
    appearance: {
      theme: 'flat',
    },
  });
  await nextTick();
  if (paymentElement) {
    paymentElement.unmount();
  }
  if (paymentElementContainer.value) {
    paymentElement = elementsInstance.create('payment');
    paymentElement.mount(paymentElementContainer.value);
  }
};

const resetPayment = () => {
  paymentClientSecret.value = null;
  paymentPlanId.value = null;
  paying.value = false;
  if (paymentElement) {
    paymentElement.unmount();
    paymentElement = null;
  }
  elementsInstance = null;
  stripeInstance = null;
};

const confirmPayment = async () => {
  if (!stripeInstance || !elementsInstance || !paymentClientSecret.value) {
    error.value = '支付信息未准备好';
    return;
  }
  paying.value = true;
  error.value = null;
  try {
    const { error: submitError } = await elementsInstance.submit();
    if (submitError) {
      error.value = submitError.message || '请检查支付信息后重试';
      paying.value = false;
      return;
    }
    const { error: stripeError, paymentIntent } = await stripeInstance.confirmPayment({
      elements: elementsInstance,
      clientSecret: paymentClientSecret.value,
      redirect: 'if_required',
      confirmParams: {},
    });
    if (stripeError) {
      error.value = stripeError.message || '支付失败，请重试';
      return;
    }
    if (paymentIntent?.status === 'succeeded') {
      await reload();
      resetPayment();
      toast.show('支付完成，正在刷新套餐状态', 'success');
      return;
    }
    if (paymentIntent?.status === 'processing') {
      toast.show('支付处理中，请稍后查看状态', 'warning');
      await reload();
      return;
    }
    toast.show('支付未完成，请重试', 'warning');
    await reload();
  } catch (err) {
    console.error('confirmPayment failed', err);
    error.value = err instanceof Error ? err.message : '支付失败，请重试';
  } finally {
    paying.value = false;
  }
};
</script>

<style scoped>
.subscription-page {
  padding: 16px;
  min-height: 100vh;
  background: #f8fafc;
  color: #0f172a;
  font-weight: 500;
}
.sub-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.sub-label {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
.sub-header h1 {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}
.refresh-btn {
  border: none;
  background: rgba(15, 23, 42, 0.06);
  width: 36px;
  height: 36px;
  border-radius: 12px;
  color: #0f172a;
}
.plan-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.plan-card {
  width: 100%;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: #fff;
  border-radius: 16px;
  padding: 14px;
  text-align: left;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.05);
}
.plan-card.active {
  border-color: #0ea5e9;
  box-shadow: 0 10px 30px rgba(14, 165, 233, 0.2);
}
.plan-card.paying {
  border-color: #6366f1;
}
.plan-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.plan-name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}
.plan-price {
  margin: 2px 0 0;
  font-size: 14px;
  color: #0f172a;
}
.plan-meta {
  margin: 6px 0 0;
  font-size: 12px;
  color: #475569;
}
.plan-badge {
  background: #ecfeff;
  color: #0ea5e9;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.plan-action {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  color: #0f172a;
  font-weight: 700;
}
.action-cta {
  color: #0ea5e9;
}
.current {
  color: #22b07d;
}
.loading {
  color: #475569;
}
.error {
  margin-top: 12px;
  color: #ef4444;
  text-align: center;
}
.empty {
  text-align: center;
  color: #94a3b8;
  padding: 20px;
}
.payment-sheet {
  margin-top: 14px;
  padding: 14px 14px calc(14px + env(safe-area-inset-bottom, 0px));
  background: #fff;
  color: #0f172a;
  border-radius: 18px 18px 0 0;
  box-shadow: 0 -8px 30px rgba(15, 23, 42, 0.15);
  border: 1px solid rgba(15, 23, 42, 0.06);
  width: 100%;
  max-width: 760px;
  max-height: calc(90vh - env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.payment-element {
  padding: 12px;
  background: rgba(15, 23, 42, 0.04);
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.25);
}
.pay-btn {
  margin-top: 12px;
  width: 100%;
  border: none;
  padding: 12px;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.pay-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.close-btn {
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.06);
  color: #0f172a;
}
.pay-title h1 {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}
.pay-amount {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
  padding: 8px 12px;
  border-radius: 12px;
  font-weight: 700;
}
.payment-tip {
  font-size: 12px;
  color: #475569;
  margin-bottom: 8px;
}
.payment-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 80;
  overflow: hidden;
  padding: 0;
}
.pay-handle {
  width: 40px;
  height: 4px;
  background: #cbd5e1;
  border-radius: 999px;
  margin: 0 auto 10px;
}
</style>
