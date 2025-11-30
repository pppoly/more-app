<template>
  <div class="subscription-page" :class="{ 'subscription-page--payment': Boolean(paymentClientSecret) }">
    <template v-if="!paymentClientSecret">
      <header class="app-bar">
        <button class="ghost-btn" type="button" @click="router.back()">
          <span class="i-lucide-arrow-left" />
        </button>
        <div class="app-bar__title">
          <h1>{{ t('subscription.title') }}</h1>
        </div>
        <button class="ghost-btn" type="button" @click="reload" :disabled="loading || paying">
          <span class="i-lucide-refresh-ccw" />
        </button>
      </header>

      <div class="page-body">
        <section class="summary-card">
          <div class="summary-row">
            <p class="eyebrow">{{ t('subscription.currentCommunity') }}</p>
            <span v-if="activeCommunity" class="pill">{{ activeCommunity.name }}</span>
            <span v-else class="pill muted">{{ t('subscription.noCommunity') }}</span>
          </div>
          <div class="summary-row" v-if="activeCommunity">
            <p class="eyebrow">{{ t('subscription.currentPlan') }}</p>
            <span class="pill primary">{{ activePlanName }}</span>
          </div>
          <p class="summary-fee" v-if="activeCommunity">{{ activePlanFee }}</p>
          <button v-if="activeCommunity" class="summary-upgrade" type="button" @click="scrollToPlans">
            {{ t('subscription.cta.upgrade') }}
            <span class="i-lucide-chevron-down" />
          </button>
          <p class="fine-print">{{ t('subscription.feeNote') }}</p>
        </section>

        <div v-if="loading" class="empty">{{ t('subscription.loading') }}</div>
        <div v-else-if="!communityId" class="empty">
          <p>{{ t('subscription.noCommunity') }}</p>
        </div>

        <section v-else ref="planStackRef" class="plan-stack">
          <article
            v-for="plan in displayPlans"
            :key="plan.id"
            class="plan-card"
            :class="plan.cardClass"
          >
            <div class="plan-header">
              <div>
                <p class="eyebrow">{{ plan.guide.audience }}</p>
                <h2>{{ plan.guide.name }}</h2>
              </div>
              <span v-if="plan.id === activePlanId" class="status-chip">{{ t('subscription.cta.current') }}</span>
            </div>
            <p class="price">{{ plan.guide.price }}</p>
            <div class="fee-chips">
              <span class="chip">{{ t('subscription.platformFee') }} {{ plan.guide.platformFee }}</span>
              <span class="chip">{{ t('subscription.stripeFee') }} {{ plan.guide.stripeFee }}</span>
            </div>
            <ul class="feature-list">
              <li v-for="feature in plan.guide.features" :key="feature">{{ feature }}</li>
            </ul>
            <button
              v-if="plan.selectable"
              class="plan-cta"
              :class="{ active: plan.id === activePlanId }"
              type="button"
              :disabled="submittingId === plan.id || paying || !plan.available || plan.id === activePlanId"
              @click="plan.available && plan.id !== activePlanId && startSubscribe(plan.id)"
            >
              <span v-if="!plan.available">{{ t('subscription.cta.comingSoon') }}</span>
              <span v-else-if="submittingId === plan.id">{{ t('subscription.cta.processing') }}</span>
              <span v-else-if="paymentPlanId === plan.id">{{ t('subscription.cta.pay') }}</span>
              <span v-else-if="plan.id === activePlanId">{{ t('subscription.cta.current') }}</span>
              <span v-else>{{ t('subscription.cta.upgrade') }}</span>
            </button>
            <a
              v-else
              class="plan-cta outline"
              href="mailto:hi@socialmore.com?subject=Enterprise"
            >
              {{ t('subscription.cta.contact') }}
            </a>
          </article>
        </section>

        <p v-if="error" class="error">{{ error }}</p>
      </div>
    </template>

    <template v-else>
      <div class="payment-overlay" @click.self="resetPayment">
        <section class="payment-sheet">
          <header class="pay-header">
            <button class="ghost-btn" type="button" :disabled="paying" @click="resetPayment">
              <span class="i-lucide-arrow-left" />
            </button>
            <div class="pay-title">
              <p class="eyebrow">{{ t('subscription.payment.title') }}</p>
              <h1>{{ payingPlan?.name || t('subscription.title') }}</h1>
            </div>
            <button class="ghost-btn" type="button" :disabled="paying" @click="resetPayment">
              <span class="i-lucide-x" />
            </button>
          </header>
          <div class="pay-amount" v-if="payingPlan">
            ¥{{ payingPlan.monthlyFee }}/{{ t('subscription.perMonth') }}
          </div>
          <div class="payment-tip">{{ t('subscription.payment.desc') }}</div>
          <div ref="paymentElementContainer" class="payment-element"></div>
          <button class="pay-btn" type="button" :disabled="paying" @click="confirmPayment">
            <span v-if="paying" class="spinner" /> {{ t('subscription.payment.confirm') }}
          </button>
          <p v-if="error" class="error">{{ error }}</p>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import {
  fetchConsoleCommunity,
  fetchPricingPlans,
  subscribeCommunityPlan,
} from '../../../api/client';
import type { ConsoleCommunityDetail, PricingPlan } from '../../../types/api';
import { loadStripe, type Stripe, type StripeElements, type PaymentElement as StripePaymentElement } from '@stripe/stripe-js';
import { useRouter } from 'vue-router';
import { useToast } from '../../../composables/useToast';

const { t, tm } = useI18n();
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
const activePlanId = ref<string | null>(null);
const planStackRef = ref<HTMLElement | null>(null);
let stripeInstance: Stripe | null = null;
let elementsInstance: StripeElements | null = null;
let paymentElement: StripePaymentElement | null = null;

const communityId = computed(() => communityStore.activeCommunityId.value);
const activeCommunity = computed(() => communityStore.getActiveCommunity());

const planGuide = computed(() => ({
  free: {
    key: 'free',
    name: t('subscription.plans.free.name'),
    price: t('subscription.plans.free.price'),
    audience: t('subscription.plans.free.audience'),
    platformFee: t('subscription.plans.free.platformFee'),
    stripeFee: t('subscription.plans.free.stripeFee'),
    features: (tm('subscription.plans.free.features') as string[]) || [],
    cardClass: 'plan-free',
  },
  starter: {
    key: 'starter',
    name: t('subscription.plans.starter.name'),
    price: t('subscription.plans.starter.price'),
    audience: t('subscription.plans.starter.audience'),
    platformFee: t('subscription.plans.starter.platformFee'),
    stripeFee: t('subscription.plans.starter.stripeFee'),
    features: (tm('subscription.plans.starter.features') as string[]) || [],
    cardClass: 'plan-starter',
  },
  pro: {
    key: 'pro',
    name: t('subscription.plans.pro.name'),
    price: t('subscription.plans.pro.price'),
    audience: t('subscription.plans.pro.audience'),
    platformFee: t('subscription.plans.pro.platformFee'),
    stripeFee: t('subscription.plans.pro.stripeFee'),
    features: (tm('subscription.plans.pro.features') as string[]) || [],
    cardClass: 'plan-pro',
  },
  enterprise: {
    key: 'enterprise',
    name: t('subscription.plans.enterprise.name'),
    price: t('subscription.plans.enterprise.price'),
    audience: t('subscription.plans.enterprise.audience'),
    platformFee: t('subscription.plans.enterprise.platformFee'),
    stripeFee: t('subscription.plans.enterprise.stripeFee'),
    features: (tm('subscription.plans.enterprise.features') as string[]) || [],
    cardClass: 'plan-enterprise',
  },
}));

const displayPlans = computed(() => {
  const guides = planGuide.value;
  const hasApiPlans = plans.value.length > 0;
  const planMap = plans.value.reduce<Record<string, PricingPlan>>((acc, plan) => {
    const name = plan.name?.toLowerCase() ?? '';
    const key = name.includes('starter')
      ? 'starter'
      : name.includes('pro')
        ? 'pro'
        : name.includes('enterprise')
          ? 'enterprise'
          : 'free';
    acc[key] = plan;
    return acc;
  }, {});

  return Object.values(guides).map((guide) => {
    const matchedPlan = planMap[guide.key];
    const price =
      matchedPlan && matchedPlan.monthlyFee > 0 ? `¥${matchedPlan.monthlyFee} / ${t('subscription.perMonth')}` : guide.price;
    return {
      id: matchedPlan?.id ?? guide.key,
      guide: {
        ...guide,
        price,
      },
      selectable: guide.key !== 'enterprise',
      cardClass: guide.cardClass,
      available: Boolean(matchedPlan || !hasApiPlans),
      monthlyFee: matchedPlan?.monthlyFee ?? 0,
    };
  });
});

const activePlanName = computed(() => {
  const matched = displayPlans.value.find((plan) => plan.id === activePlanId.value);
  return matched?.guide.name ?? t('subscription.plans.free.name');
});
const activePlanFee = computed(() => {
  const matched = displayPlans.value.find((plan) => plan.id === activePlanId.value);
  const fee = matched?.guide.platformFee || t('subscription.plans.free.platformFee');
  const stripe = matched?.guide.stripeFee || t('subscription.plans.free.stripeFee');
  return `${t('subscription.platformFee')} ${fee} · ${t('subscription.stripeFee')} ${stripe}`;
});
const scrollToPlans = () => {
  if (planStackRef.value) {
    planStackRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

const applyCommunityDetail = (detail: ConsoleCommunityDetail | null) => {
  activePlanId.value = detail?.pricingPlanId ?? null;
};

const loadPlans = async () => {
  error.value = null;
  loading.value = true;
  try {
    plans.value = await fetchPricingPlans();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('error.networkUnstable');
  } finally {
    loading.value = false;
  }
};

const startSubscribe = async (planId: string) => {
  if (!communityId.value || submittingId.value) return;
  submittingId.value = planId;
  error.value = null;
  try {
    const res = await subscribeCommunityPlan(communityId.value, planId);
    activePlanId.value = res.planId ?? planId;
    if (res.clientSecret && res.publishableKey) {
      paymentPlanId.value = planId;
      paymentClientSecret.value = res.clientSecret;
      await setupPaymentElement(res.clientSecret, res.publishableKey);
    } else if (planById(planId)?.monthlyFee && planById(planId)!.monthlyFee > 0) {
      throw new Error(t('error.subscriptionUnavailable'));
    } else {
      await reload();
      toast.show(t('subscription.toast.switched'), 'success');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('error.subscriptionUnavailable');
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
      applyCommunityDetail(res);
    } else {
      applyCommunityDetail(null);
    }
  }
  await loadPlans();
};

onMounted(async () => {
  if (!communityStore.loaded.value) {
    await communityStore.loadCommunities();
    communityStore.ensureActiveCommunity();
  }
  if (communityId.value) {
    const res = await fetchConsoleCommunity(communityId.value).catch(() => null);
    applyCommunityDetail(res);
  }
  await loadPlans();
});

const setupPaymentElement = async (clientSecret: string, publishableKey: string) => {
  if (!publishableKey) {
    throw new Error(t('error.subscriptionUnavailable'));
  }
  stripeInstance = await loadStripe(publishableKey);
  if (!stripeInstance) {
    throw new Error(t('error.subscriptionUnavailable'));
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
    error.value = t('subscription.payment.notReady');
    return;
  }
  paying.value = true;
  error.value = null;
  try {
    const { error: submitError } = await elementsInstance.submit();
    if (submitError) {
      error.value = submitError.message || t('error.paymentFailed');
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
      error.value = stripeError.message || t('error.paymentFailed');
      return;
    }
    if (paymentIntent?.status === 'succeeded') {
      await reload();
      resetPayment();
      toast.show(t('subscription.toast.switched'), 'success');
      return;
    }
    if (paymentIntent?.status === 'processing') {
      toast.show(t('subscription.toast.processing'), 'warning');
      await reload();
      return;
    }
    toast.show(t('subscription.toast.failed'), 'warning');
    await reload();
  } catch (err) {
    console.error('confirmPayment failed', err);
    error.value = err instanceof Error ? err.message : t('error.paymentFailed');
  } finally {
    paying.value = false;
  }
};
</script>

<style scoped>
.subscription-page {
  min-height: 100vh;
  background: #f8fafc;
  color: #0f172a;
  font-weight: 500;
}
.app-bar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  gap: 12px;
  padding: calc(10px + env(safe-area-inset-top, 0px)) 16px 10px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
}
.app-bar__title {
  text-align: center;
}
.app-bar__title h1 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
}
.ghost-btn {
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: #fff;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  color: #0f172a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
}
.page-body {
  padding: 12px 16px 24px;
}
.summary-card {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 16px;
  padding: 12px 12px 10px;
  margin-bottom: 12px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
  display: grid;
  gap: 8px;
}
.summary-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 12px;
  background: #f8fafc;
  color: #0f172a;
  font-weight: 600;
}
.pill.primary {
  background: #e0f2fe;
  color: #075985;
}
.pill.muted {
  background: #f1f5f9;
  color: #94a3b8;
}
.fine-print {
  margin: 2px 0 0;
  color: #64748b;
  font-size: 12px;
}
.plan-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}
.plan-card {
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: #fff;
  border-radius: 18px;
  padding: 14px 14px 12px;
  text-align: left;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.plan-free {
  background: linear-gradient(135deg, #f0fdf4, #ffffff);
}
.plan-starter {
  background: linear-gradient(135deg, #fff7ed, #ffffff);
}
.plan-pro {
  background: linear-gradient(135deg, #eff6ff, #ffffff);
}
.plan-enterprise {
  background: linear-gradient(135deg, #f5f3ff, #ffffff);
}
.plan-header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
}
.status-chip {
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.12);
  color: #0369a1;
  font-weight: 700;
  font-size: 12px;
}
.price {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  color: #0f172a;
}
.fee-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.05);
  font-size: 12px;
  color: #0f172a;
}
.feature-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #0f172a;
  font-size: 13px;
}
.plan-cta {
  margin-top: 4px;
  width: 100%;
  border: none;
  border-radius: 12px;
  padding: 12px;
  font-size: 14px;
  font-weight: 700;
  background: linear-gradient(135deg, #0ea5e9, #22c55e);
  color: #fff;
}
.plan-cta.active {
  background: #e2e8f0;
  color: #0f172a;
}
.plan-cta.outline {
  background: #fff;
  color: #0f172a;
  border: 1px solid #cbd5e1;
  text-align: center;
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
.eyebrow {
  margin: 0;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 11px;
  color: #64748b;
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
