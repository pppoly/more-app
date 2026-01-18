<template>
  <div class="payout-page">
    <ConsoleTopBar v-if="!isLiffClientMode" :title="pageTitle" @back="goBack" />

    <section class="summary" :class="`banner--${status.type}`">
      <div class="summary-head">
        <div class="banner-icon">{{ status.icon }}</div>
        <div>
          <p class="banner-title">{{ status.title }}</p>
          <p class="banner-text">受け取り設定は Stripe のセキュア画面で管理します。</p>
        </div>
      </div>
      <div class="hero">
        <p class="hero-label">未受取（MORE内）</p>
        <p class="hero-value">{{ formatYen(displaySettleAmount) }}</p>
        <p class="hero-sub">
          Stripe残高 {{ formatYen(stripeAvailable) }}・保留中 {{ formatYen(stripePending) }}
          <span v-if="isPlatformCharge" class="hero-note">（プラットフォーム口座管理中）</span>
        </p>
        <p v-if="carryReceivable > 0 && showSettlement" class="hero-sub">繰越（返金調整） {{ formatYen(carryReceivable) }}</p>
      </div>
      <div class="kpi-grid">
        <article class="kpi">
          <p class="kpi-label">取引総額（未確定含む）</p>
          <p class="kpi-value">{{ formatYen(transactionTotal) }}</p>
          <p class="kpi-hint">支払い待ちも含まれます</p>
        </article>
        <article class="kpi">
          <p class="kpi-label">確定収入（支払い済み）</p>
          <p class="kpi-value">{{ formatYen(balanceGross) }}</p>
          <p class="kpi-hint">支払い待ちは含まれません</p>
        </article>
        <article class="kpi">
          <p class="kpi-label">Stripe手数料<span v-if="stripeFeeRateText">（{{ stripeFeeRateText }}）</span></p>
          <p class="kpi-value kpi-value--fee">
            {{ formatYen(stripeFee) }}
            <span v-if="chargeModel === 'destination_charge'" class="kpi-hint-inline">（Stripe側で控除済み表示）</span>
          </p>
        </article>
        <article class="kpi">
          <p class="kpi-label">プラットフォーム手数料</p>
          <p class="kpi-value kpi-value--fee">{{ formatYen(balanceFee) }}</p>
        </article>
        <article class="kpi">
          <p class="kpi-label">返金済み</p>
          <p class="kpi-value kpi-value--refund">{{ formatYen(balanceRefunded) }}</p>
        </article>
      </div>
      <p class="note muted">※ 支払い待ちの取引は、確定収入・未受取に含まれません。</p>
    </section>

    <section class="actions">
      <button class="btn primary" type="button" :disabled="!communityId" @click="goPayments">
        取引履歴を見る
      </button>
      <button class="btn outline" type="button" :disabled="payoutLoading || !canWithdraw" @click="handleWithdraw">
        {{ payoutLoading ? '移動中…' : withdrawLabel }}
      </button>
      <button class="btn ghost" type="button" :disabled="onboarding" @click="handleOnboarding">
        {{ onboarding ? '移動中…' : stripeActionLabel }}
      </button>
      <p class="actions-hint">Stripe セキュア画面で口座・入金設定を行います。</p>
    </section>

    <section v-if="isEmpty" class="empty-onboarding">
      <p class="empty-title">まだ取引はありません。</p>
      <p class="empty-text">最初の有料イベントを作成して、テスト決済を行いましょう。</p>
      <button class="btn outline" type="button" :disabled="!communityId" @click="goCreatePaidEvent">
        有料イベントを作成
      </button>
    </section>

    <details class="account-detail" v-if="community?.stripeAccountId">
      <summary>アカウントID</summary>
      <div class="account-row">
        <code>{{ community?.stripeAccountId }}</code>
        <button class="copy-btn" type="button" @click="copyAccountId">コピー</button>
      </div>
    </details>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import {
  createCommunityStripeLoginLink,
  fetchConsoleCommunity,
  fetchCommunityBalance,
  fetchOrganizerPayoutPolicyStatus,
  refreshCommunityStripeStatus,
  startCommunityStripeOnboarding,
} from '../../../api/client';
import type { ConsoleCommunityBalance, ConsoleCommunityDetail, StripeAccountStatus } from '../../../types/api';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';
import { isLiffClient } from '../../../utils/device';
import { isLineInAppBrowser } from '../../../utils/liff';
import { APP_TARGET, STRIPE_FEE_FIXED_JPY, STRIPE_FEE_PERCENT } from '../../../config';

const store = useConsoleCommunityStore();
const router = useRouter();
const route = useRoute();
const community = ref<ConsoleCommunityDetail | null>(null);
const onboarding = ref(false);
const payoutLoading = ref(false);
const error = ref<string | null>(null);
const balance = ref<ConsoleCommunityBalance | null>(null);
const stripeStatus = ref<StripeAccountStatus | null>(null);
const isLiffClientMode = computed(() => APP_TARGET === 'liff' || isLineInAppBrowser() || isLiffClient());

const hasStripeAccount = computed(() => Boolean(community.value?.stripeAccountId));
const stripeReady = computed(() => Boolean(community.value?.stripeAccountId && community.value?.stripeAccountOnboarded));
const stripeRestricted = computed(() => {
  if (!hasStripeAccount.value || !stripeReady.value) return false;
  if (stripeStatus.value?.disabledReason) return true;
  if (stripeStatus.value?.payoutsEnabled === false) return true;
  return false;
});
const stripeActionLabel = computed(() => {
  if (!hasStripeAccount.value) return 'Stripe 受け取りを開始';
  if (stripeRestricted.value) return 'Stripeで確認';
  if (!stripeReady.value) return '連携を完了する';
  return '受け取り情報を更新';
});
const canWithdraw = computed(() => hasStripeAccount.value && stripeReady.value && !stripeRestricted.value);
const withdrawLabel = computed(() => {
  if (!hasStripeAccount.value) return '出金する';
  if (!stripeReady.value) return '出金する（連携未完了）';
  if (stripeRestricted.value) return '出金する（制限中）';
  return '出金する';
});
const pageTitle = computed(() => 'コミュニティ財務');

const status = computed(() => {
  if (stripeRestricted.value) {
    return { type: 'error', icon: '🔴', title: '受け取りが制限されています' };
  }
  if (stripeReady.value) {
    return { type: 'enabled', icon: '🟢', title: '受け取りは有効です' };
  }
  if (hasStripeAccount.value) {
    return { type: 'pending', icon: '🟠', title: '連携を完了してください' };
  }
  return { type: 'pending', icon: '🟠', title: 'Stripe口座が未開設です' };
});

const balanceGross = computed(() => balance.value?.grossPaid ?? 0);
const balanceRefunded = computed(() => balance.value?.refunded ?? 0);
const balanceFee = computed(() => balance.value?.platformFee ?? 0);
const stripeFee = computed(() => balance.value?.stripeFee ?? 0);
const chargeModel = computed(() => balance.value?.chargeModel ?? 'platform_charge');
const isPlatformCharge = computed(() => chargeModel.value === 'platform_charge');
const stripeAvailable = computed(() => balance.value?.stripeBalance?.available ?? 0);
const stripePending = computed(() => balance.value?.stripeBalance?.pending ?? 0);
const transactionTotal = computed(() => balance.value?.transactionTotal ?? balanceGross.value);
const showSettlement = computed(() => Boolean(balance.value?.settlement?.enabled && chargeModel.value === 'destination_charge'));
const settleAmount = computed(() => (showSettlement.value ? balance.value?.settlement?.settleAmount ?? 0 : 0));
const displaySettleAmount = computed(() => settleAmount.value);
const carryReceivable = computed(() => (showSettlement.value ? balance.value?.settlement?.carryReceivable ?? 0 : 0));

const communityId = computed(() => store.activeCommunityId.value);
const hasStripeBalance = computed(() => stripeAvailable.value > 0 || stripePending.value > 0);
const isEmpty = computed(() => transactionTotal.value === 0 && !hasStripeBalance.value);

const formatYen = (value?: number | null) =>
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

const ensurePayoutPolicyAccepted = async () => {
  try {
    const status = await fetchOrganizerPayoutPolicyStatus();
    if (status.acceptedAt) return true;
  } catch (error) {
    console.warn('Failed to load payout policy status', error);
  }
  const id = community.value?.id || store.activeCommunityId.value || '';
  router.push({
    path: '/organizer/payout-policy',
    query: { returnTo: route.fullPath, next: 'stripe-onboard', communityId: id },
  });
  return false;
};

const loadCommunity = async () => {
  error.value = null;
  if (!store.activeCommunityId.value) {
    await store.loadCommunities();
    store.ensureActiveCommunity();
  }
  const id = store.activeCommunityId.value;
  if (!id) {
    error.value = '管理対象のコミュニティが見つかりません';
    return;
  }
  try {
    community.value = await fetchConsoleCommunity(id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '受け取り情報の取得に失敗しました';
  }
};

const loadStripeStatus = async () => {
  if (!community.value?.id || !community.value?.stripeAccountId) {
    stripeStatus.value = null;
    return;
  }
  try {
    const status = await refreshCommunityStripeStatus(community.value.id);
    stripeStatus.value = status.stripeAccountStatus ?? null;
    if (community.value) {
      community.value.stripeAccountId = status.stripeAccountId ?? community.value.stripeAccountId;
      if (status.stripeAccountOnboarded !== undefined) {
        community.value.stripeAccountOnboarded = status.stripeAccountOnboarded;
      }
    }
  } catch {
    stripeStatus.value = null;
  }
};

const loadBalance = async () => {
  if (!community.value?.id) return;
  try {
    balance.value = await fetchCommunityBalance(community.value.id, { period: 'all' });
  } catch (err) {
    balance.value = null;
  }
};

const handleOnboarding = async () => {
  if (!(await ensurePayoutPolicyAccepted())) return;
  if (!community.value?.id) return;
  onboarding.value = true;
  error.value = null;
  try {
    const { url } = await startCommunityStripeOnboarding(community.value.id);
    window.location.href = url;
  } catch (err: any) {
    error.value =
      err?.response?.data?.message ||
      (err instanceof Error ? err.message : '受け取りリンクの生成に失敗しました');
  } finally {
    onboarding.value = false;
  }
};

const handleWithdraw = async () => {
  if (!(await ensurePayoutPolicyAccepted())) return;
  if (!community.value?.id) return;
  if (!hasStripeAccount.value) {
    error.value = 'Stripe 口座が未開設です。先に連携を完了してください。';
    return;
  }
  payoutLoading.value = true;
  error.value = null;
  try {
    const { url } = await createCommunityStripeLoginLink(community.value.id);
    window.location.href = url;
  } catch (err: any) {
    error.value =
      err?.response?.data?.message ||
      (err instanceof Error ? err.message : 'Stripe画面の起動に失敗しました');
  } finally {
    payoutLoading.value = false;
  }
};

const goPayments = () => {
  const id = community.value?.id || store.activeCommunityId.value;
  if (!id) return;
  router.push({ name: 'ConsoleMobilePayments', params: { communityId: id } });
};

const goCreatePaidEvent = () => {
  if (!communityId.value) return;
  router.push({ name: 'ConsoleMobileEventForm', params: { communityId: communityId.value }, query: { entry: 'basic' } });
};

const copyAccountId = async () => {
  if (!community.value?.stripeAccountId || typeof navigator === 'undefined') return;
  try {
    await navigator.clipboard.writeText(community.value.stripeAccountId);
  } catch {
    // ignore
  }
};

const goBack = () => {
  router.back();
};

onMounted(async () => {
  await loadCommunity();
  await loadStripeStatus();
  await loadBalance();
});
</script>

<style scoped>
.payout-page {
  min-height: 100vh;
  background: #f8fafc;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px calc(80px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
}
.summary {
  padding: 12px;
  border-radius: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.summary-head {
  display: flex;
  gap: 10px;
  align-items: center;
}
.banner--pending {
  background: #fff7ed;
}
.banner--enabled {
  background: #e0fbe2;
}
.banner--error {
  background: #fef2f2;
}
.banner-icon {
  font-size: 20px;
}
.banner-title {
  margin: 0;
  font-weight: 700;
}
.banner-text {
  margin: 2px 0 0;
  font-size: 13px;
  color: #475569;
}
.hero {
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  border-radius: 16px;
  padding: 16px 16px 18px;
  box-shadow: 0 16px 32px rgba(37, 99, 235, 0.2);
}
.hero-label {
  margin: 0;
  font-size: 13px;
  opacity: 0.9;
}
.hero-value {
  margin: 6px 0 4px;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: 0.5px;
}
.hero-sub {
  margin: 0;
  font-size: 13px;
  opacity: 0.9;
}
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.kpi {
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(15, 23, 42, 0.04);
}
.kpi-label {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
.kpi-value {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}
.kpi-value--refund {
  color: #b91c1c;
}
.kpi-value--fee {
  color: #ea580c;
}
.kpi-hint-inline {
  display: block;
  font-size: 12px;
  color: #64748b;
}
.kpi-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: #94a3b8;
}
.note {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.actions-hint {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  text-align: center;
}
.btn {
  width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 15px;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.btn.primary {
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  box-shadow: 0 12px 30px rgba(37, 99, 235, 0.18);
}
.btn.ghost {
  background: #fff;
  color: #0f172a;
  border: 1px solid #e2e8f0;
}
.btn.outline {
  background: #f8fafc;
  color: #0f172a;
  border: 1px solid #cbd5e1;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.empty-onboarding {
  background: #fff;
  border-radius: 14px;
  padding: 14px;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
  text-align: center;
  border: 1px solid rgba(15, 23, 42, 0.04);
}
.empty-title {
  margin: 0 0 6px;
  font-weight: 700;
  color: #0f172a;
}
.empty-text {
  margin: 0 0 10px;
  color: #475569;
  font-size: 13px;
}
.account-detail {
  background: #f1f5f9;
  border-radius: 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
}
.account-detail summary {
  cursor: pointer;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 6px;
}
.account-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-size: 13px;
  color: #0f172a;
}
.copy-btn {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  padding: 8px 10px;
  font-weight: 700;
  cursor: pointer;
}
.error {
  color: #b91c1c;
  text-align: center;
  font-weight: 600;
}
</style>
