<template>
  <div class="subscription-page" :class="{ 'subscription-page--payment': Boolean(paymentClientSecret) }">
    <template v-if="!paymentClientSecret">
      <header class="sub-header">
        <div>
          <p class="sub-label">订阅计划</p>
          <h1>按社群成长阶段挑选方案</h1>
          <p class="sub-desc">透明收费：平台抽成 + Stripe 通道费分开显示，超额 AI 仅记录不扣费。</p>
        </div>
        <button class="refresh-btn" type="button" @click="reload" :disabled="loading || paying">
          <span class="i-lucide-refresh-ccw" />
        </button>
      </header>

      <div class="disclaimer">
        <p class="eyebrow">收费结构</p>
        <ol>
          <li>Stripe 通道费：实报实销，单独显示。</li>
          <li>平台抽佣：Free 5%；Starter 可选 2% 或固定 ¥3,000/月（0% 抽成）；Pro 0%。</li>
          <li>AI 超额：S1 不计费，只记录 usage（文本/图像 ¥0.5/次，视频审核 ¥3/分钟）。</li>
        </ol>
      </div>

      <div v-if="loading" class="empty">加载中…</div>
      <div v-else-if="!communityId" class="empty">
        <p>请先选择一个社群再订阅套餐。</p>
      </div>

      <div v-else class="plan-grid">
        <article
          v-for="plan in displayPlans"
          :key="plan.id"
          class="plan-card"
          :class="plan.cardClass"
        >
          <div class="plan-chip">
            <span>{{ plan.guide.tone }}</span>
            <span v-if="plan.id === activePlanId" class="current-chip">当前</span>
          </div>
          <h2 class="plan-name">{{ plan.guide.name }}</h2>
          <p class="plan-price">{{ plan.guide.price }}</p>
          <p class="plan-audience">{{ plan.guide.audience }}</p>
          <div class="plan-fee">
            <p><strong>平台抽成：</strong>{{ plan.guide.platformFee }}</p>
            <p><strong>Stripe：</strong>{{ plan.guide.stripeFee }}</p>
          </div>
          <div class="plan-feature">
            <p class="feature-title">功能</p>
            <ul>
              <li v-for="f in plan.guide.features" :key="f">· {{ f }}</li>
            </ul>
          </div>
          <div class="plan-feature">
            <p class="feature-title">用户心智</p>
            <ul>
              <li v-for="m in plan.guide.mindset" :key="m">🔹 {{ m }}</li>
            </ul>
          </div>
          <button
            v-if="plan.selectable"
            class="plan-cta"
            :class="{ active: plan.id === activePlanId }"
            type="button"
            :disabled="submittingId === plan.id || paying || !plan.available"
            @click="plan.available && startSubscribe(plan.id)"
          >
            <span v-if="!plan.available">敬请期待</span>
            <span v-else-if="submittingId === plan.id">处理中...</span>
            <span v-else-if="paymentPlanId === plan.id">填写支付信息</span>
            <span v-else-if="plan.id === activePlanId">已订阅</span>
            <span v-else>开通</span>
          </button>
          <a
            v-else
            class="plan-cta outline"
            href="mailto:hi@socialmore.com?subject=Enterprise"
          >
            联系销售
          </a>
        </article>
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

const planGuide = {
  free: {
    key: 'free',
    name: '🟩 Free（免费试用 / Sandbox）',
    price: '¥0 / 月',
    audience: '适合：初次体验者、小圈子活动者、来试试平台的人。',
    platformFee: '5%',
    stripeFee: '实报实销',
    tone: '试用 / Sandbox',
    features: [
      '每月 3 场活动，最多 100 张票',
      'AI 文案 200 次/月，基础多语言翻译（JP/EN/CN）',
      '基础文本/图片审核 200 次',
      '1 名管理员',
    ],
    mindset: ['我来试试平台和 AI', '适合个人、小型聚会'],
    cardClass: 'plan-free',
  },
  starter: {
    key: 'starter',
    name: '🟧 Starter（成长区间）',
    price: '¥2,480 / 月',
    audience: '适合：小型社区、语言交换会、兴趣小组。',
    platformFee: '可选 2% 或 固定 ¥3,000/月（0% 抽成）',
    stripeFee: '实报实销',
    tone: '成长起步',
    features: [
      '20 场活动/月，最多 5,000 张票',
      'AI 文案 300 次/月，多语言翻译 JP/EN/CN',
      '内容审核 1,500 次（文/图）',
      '模板：BBQ/学习会/外出活动，数据导出 CSV',
      '管理员 3 名',
    ],
    mindset: ['比同类平台便宜，AI 更强/更安全', '活动多且有收入，想降抽成'],
    cardClass: 'plan-starter',
  },
  pro: {
    key: 'pro',
    name: '🟦 Pro（核心盈收等级）',
    price: '¥9,800 / 月',
    audience: '适合：频繁办活动的主理人、大型兴趣社群/NPO。',
    platformFee: '0% 平台抽佣（仅 Stripe 通道费）',
    stripeFee: '实报实销',
    tone: '专业 / 0% 抽成',
    features: [
      '无限活动 & 票（合理上限）',
      'AI 文案 2,000 次/月 + 海报 100 次/月',
      '高级审核（文本/图片/敏感）',
      '多语言活动展示，Webhook/Zapier 自动化，品牌定制',
      '管理员 10 名，优先客服',
    ],
    mindset: ['要品牌/0% 抽成，用 MORE 做社区事业', '追求专业工具与自动化'],
    cardClass: 'plan-pro',
  },
  enterprise: {
    key: 'enterprise',
    name: '🟪 Enterprise（企业 / 政府 / 协会）',
    price: '¥25,000〜80,000 / 月（按需）',
    audience: '适合：大学、NPO 联合体、地方政府、企业培训等。',
    platformFee: '定制',
    stripeFee: '实报实销',
    tone: '定制 / 私有化',
    features: [
      '私有模型/专属 AI，大规模多语言生成',
      '专属审核策略，子组织/多团队权限',
      '专属客户经理与 SLA，单租户部署（可选）',
    ],
    mindset: ['需要合规、定制与大规模 AI', '政企/学校/协会场景'],
    cardClass: 'plan-enterprise',
  },
};

const displayPlans = computed(() => {
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

  return Object.values(planGuide).map((guide) => {
    const matchedPlan = planMap[guide.key];
    const price = matchedPlan && matchedPlan.monthlyFee > 0 ? `¥${matchedPlan.monthlyFee} / 月` : guide.price;
    return {
      id: matchedPlan?.id ?? guide.key,
      guide: {
        ...guide,
        price,
      },
      selectable: guide.key !== 'enterprise',
      cardClass: guide.cardClass,
      available: Boolean(matchedPlan || !hasApiPlans),
    };
  });
});

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
      throw new Error('支付暂时不可用，请稍后再试或联系支持');
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
    throw new Error('支付暂时不可用，请稍后再试或联系支持');
  }
  stripeInstance = await loadStripe(publishableKey);
  if (!stripeInstance) {
    throw new Error('支付暂时不可用，请稍后再试或联系支持');
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
  gap: 12px;
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
.sub-desc {
  margin: 4px 0 0;
  color: #475569;
  font-size: 13px;
}
.refresh-btn {
  border: none;
  background: rgba(15, 23, 42, 0.06);
  width: 36px;
  height: 36px;
  border-radius: 12px;
  color: #0f172a;
}
.plan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}
.plan-card {
  width: 100%;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: #fff;
  border-radius: 18px;
  padding: 14px;
  text-align: left;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
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
.plan-chip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #475569;
}
.current-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: #ecfeff;
  color: #0ea5e9;
  font-weight: 700;
}
.plan-name {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  color: #0f172a;
}
.plan-price {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}
.plan-audience {
  margin: 4px 0 0;
  color: #475569;
  font-size: 13px;
}
.plan-fee {
  background: rgba(15, 23, 42, 0.04);
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 12px;
  color: #0f172a;
}
.plan-feature {
  background: #fff;
}
.feature-title {
  margin: 6px 0 4px;
  font-size: 12px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.plan-feature ul {
  margin: 0;
  padding-left: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #0f172a;
  font-size: 13px;
}
.plan-cta {
  margin-top: 6px;
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
.disclaimer {
  margin: 12px 0;
  padding: 12px;
  border-radius: 14px;
  background: #f1f5f9;
  color: #475569;
  font-size: 13px;
}
.disclaimer ol {
  margin: 8px 0 0 16px;
  padding: 0;
}
.eyebrow {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
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
