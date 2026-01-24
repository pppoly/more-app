<template>
  <div class="payout-page">
    <ConsoleTopBar v-if="!isLiffClientMode" :title="pageTitle" @back="goBack" />

    <section v-if="showOnboardingGuide" class="summary banner--pending">
      <div class="summary-head">
        <div class="banner-icon">🟠</div>
        <div>
          <p class="banner-title">
            {{ showNoAccountGuide ? 'Stripe 受け取りを開始しましょう' : '受け取り設定が未完了です' }}
          </p>
          <p class="banner-text">
            {{
              showNoAccountGuide
                ? 'Stripe のアカウントを作成すると、受け取り設定を進められます。'
                : '以下の項目を完了すると、受け取りが有効になります。'
            }}
          </p>
        </div>
      </div>
      <div v-if="showIncompleteGuide" class="guide-list">
        <div v-for="step in missingSteps" :key="step" class="guide-item">
          {{ step }}
        </div>
      </div>
      <button class="btn primary" type="button" :disabled="onboarding" @click="handleOnboarding">
        {{ onboarding ? '移動中…' : stripeActionLabel }}
      </button>
      <p class="actions-hint">Stripe セキュア画面で口座・入金設定を行います。</p>
    </section>

    <section v-else class="summary summary--flat" :class="`banner--${status.type}`">
      <div class="hero">
        <span class="hero-status-tag">
          {{ status.type === 'enabled' ? '受取有効' : status.title }}
        </span>
        <div class="hero-title-row">
          <p class="hero-label">Stripe 残高（合計）</p>
          <button class="hero-info" type="button" @click="openInfoSheet">？</button>
        </div>
        <div class="hero-formula">
          <div class="hero-formula-row hero-formula-row--labels">
            <span class="hero-formula-term">残高（合計）</span>
            <span class="hero-formula-op">=</span>
            <span class="hero-formula-term">利用可能</span>
            <span class="hero-formula-op">+</span>
            <span class="hero-formula-term">保留中</span>
          </div>
          <div class="hero-formula-row hero-formula-row--values">
            <span class="hero-formula-term hero-formula-term--total">{{ formatYenOrDash(stripeTotalRaw) }}</span>
            <span class="hero-formula-op">=</span>
            <span class="hero-formula-term">{{ formatYenOrDash(stripeAvailableRaw) }}</span>
            <span class="hero-formula-op">+</span>
            <span class="hero-formula-term">{{ formatYenOrDash(stripePendingRaw) }}</span>
          </div>
        </div>
        <p class="hero-sub">プラットフォーム結算日 {{ formatDateOrDash(platformSettlementDate) }}</p>
        <p class="hero-sub">Stripe 自動振込日 {{ stripePayoutRule || '—' }}</p>
      </div>
      <article class="kpi kpi--month">
        <p class="kpi-label">
          今月の収入
          <span class="kpi-badge">ホームと同じ</span>
        </p>
        <p class="kpi-value">{{ formatYenOrDash(monthNetRaw) }}</p>
      </article>
      <div class="kpi-grid">
        <article class="kpi">
          <p class="kpi-label">
            取引総額（返金後）
          </p>
          <p class="kpi-value">{{ formatYenOrDash(balanceGrossRaw) }}</p>
        </article>
        <article class="kpi">
          <p class="kpi-label">
            支払い待ち
          </p>
          <p class="kpi-value">{{ formatYenOrDash(pendingAmountRaw) }}</p>
        </article>
        <article class="kpi">
          <p class="kpi-label">
            累計 見込み収入
          </p>
          <p class="kpi-value">{{ formatYenOrDash(netExpectedRaw) }}</p>
        </article>
        <article class="kpi">
          <p class="kpi-label">
            返金済み
          </p>
          <p class="kpi-value kpi-value--refund">{{ formatYenOrDash(balanceRefundedRaw) }}</p>
        </article>
      </div>
      <article class="kpi kpi--fee-card">
        <p class="kpi-label">手数料（返金時も発生）</p>
        <p class="kpi-hint">収入算出に使用されます</p>
        <div class="fee-row">
          <span>{{ stripeFeeLabel }}</span>
          <strong>{{ formatYenOrDashNegative(stripeFeeRaw) }}</strong>
        </div>
        <div class="fee-row">
          <span>プラットフォーム</span>
          <strong>{{ formatYenOrDashNegative(platformFeeRaw) }}</strong>
        </div>
      </article>
      <article class="kpi breakdown-card">
        <p class="kpi-label">お金の状態（MORE → Stripe 送金）</p>
        <div class="breakdown-list">
          <div class="breakdown-row">
            <span>送金済み（MORE → Stripe）</span>
            <strong>{{ formatYenOrDash(breakdownPaidOut) }}</strong>
          </div>
          <div class="breakdown-row">
            <span>送金待ち（MORE → Stripe）</span>
            <strong>{{ formatYenOrDash(breakdownTransferPending) }}</strong>
          </div>
          <div class="breakdown-row">
            <span>相殺予定（返金など）</span>
            <strong>{{ formatYenOrDash(breakdownOffsetPending) }}</strong>
          </div>
        </div>
        <p class="note muted">※ 見込み収入 = 送金済み + 送金待ち - 相殺予定</p>
        <p class="note muted">※ ここでの「送金」は MORE（プラットフォーム）→ Stripe です（銀行への振込は Stripe 側）。</p>
        <button class="btn primary breakdown-action" type="button" :disabled="!communityId" @click="goPayments">
          取引履歴を見る
        </button>
      </article>
    </section>

    <details v-if="stripeReady" class="action-detail">
      <summary>受け取り設定とアカウント情報</summary>
      <div class="action-detail__body">
        <button class="btn outline" type="button" :disabled="payoutLoading || !canWithdraw" @click="handleWithdraw">
          {{ payoutLoading ? '移動中…' : withdrawLabel }}
        </button>
        <button class="btn ghost" type="button" :disabled="onboarding" @click="handleOnboarding">
          {{ onboarding ? '移動中…' : stripeActionLabel }}
        </button>
        <div class="account-row">
          <code>{{ community?.stripeAccountId || '—' }}</code>
          <button class="copy-btn" type="button" :disabled="!community?.stripeAccountId" @click="copyAccountId">
            コピー
          </button>
        </div>
      </div>
    </details>

    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="showInfoSheet" class="sheet-mask" @click.self="closeInfoSheet">
      <div class="sheet">
        <div class="sheet-handle"></div>
        <p class="sheet-title">{{ infoSheetTitle }}</p>
        <p class="sheet-desc">{{ infoSheetBody }}</p>
        <button class="sheet-close" type="button" @click="closeInfoSheet">閉じる</button>
      </div>
    </div>
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
import type {
  ConsoleCommunityBalance,
  ConsoleCommunityDetail,
  PlatformSettlementSchedule,
  StripeAccountStatus,
  StripePayoutSchedule,
} from '../../../types/api';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';
import { isLiffClient } from '../../../utils/device';
import { isLineInAppBrowser } from '../../../utils/liff';
import { STRIPE_FEE_FIXED_JPY, STRIPE_FEE_PERCENT } from '../../../config';

const store = useConsoleCommunityStore();
const router = useRouter();
const route = useRoute();
const community = ref<ConsoleCommunityDetail | null>(null);
const onboarding = ref(false);
const payoutLoading = ref(false);
const error = ref<string | null>(null);
const balance = ref<ConsoleCommunityBalance | null>(null);
const monthBalance = ref<ConsoleCommunityBalance | null>(null);
const stripeStatus = ref<StripeAccountStatus | null>(null);
const platformSettlement = ref<PlatformSettlementSchedule | null>(null);
const stripePayoutSchedule = ref<StripePayoutSchedule | null>(null);
const isLiffClientMode = computed(() => isLineInAppBrowser() || isLiffClient());

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
const showOnboardingGuide = computed(() => !stripeReady.value);
const showNoAccountGuide = computed(() => !hasStripeAccount.value);
const showIncompleteGuide = computed(() => hasStripeAccount.value && !stripeReady.value);
const missingSteps = computed(() => {
  if (!showIncompleteGuide.value) return [];
  const steps: string[] = [];
  if (stripeStatus.value?.chargesEnabled === false) {
    steps.push('カード決済の有効化');
  }
  if (stripeStatus.value?.payoutsEnabled === false) {
    steps.push('出金の有効化');
  }
  if (stripeStatus.value?.disabledReason) {
    steps.push('追加情報の提出');
  }
  if (!steps.length) {
    steps.push('口座情報の提出');
  }
  return steps;
});
const canWithdraw = computed(() => hasStripeAccount.value && stripeReady.value && !stripeRestricted.value);
const withdrawLabel = computed(() => {
  if (!hasStripeAccount.value) return '出金する';
  if (!stripeReady.value) return '出金設定（連携未完了）';
  if (stripeRestricted.value) return '出金設定（制限中）';
  return '出金設定';
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

const stripeAvailableRaw = computed(
  () => balance.value?.stripeBalance?.available ?? monthBalance.value?.stripeBalance?.available ?? null,
);
const stripePendingRaw = computed(
  () => balance.value?.stripeBalance?.pending ?? monthBalance.value?.stripeBalance?.pending ?? null,
);
const stripeTotalRaw = computed(() =>
  stripeAvailableRaw.value == null && stripePendingRaw.value == null
    ? null
    : (stripeAvailableRaw.value ?? 0) + (stripePendingRaw.value ?? 0),
);
const stripeAvailable = computed(() => stripeAvailableRaw.value ?? 0);
const stripePending = computed(() => stripePendingRaw.value ?? 0);
const balanceGrossRaw = computed(() => {
  if (!balance.value) return null;
  if (balance.value.grossPaid == null) return null;
  const refunded = balance.value.refunded ?? 0;
  return Math.max(0, balance.value.grossPaid - refunded);
});
const balanceRefundedRaw = computed(() => balance.value?.refunded ?? null);
const platformFeeRaw = computed(() => balance.value?.platformFee ?? null);
const stripeFeeRaw = computed(() => balance.value?.stripeFee ?? null);
const netExpectedRaw = computed(() => balance.value?.net ?? null);
const monthNetRaw = computed(
  () => monthBalance.value?.settlement?.accruedNetPeriod ?? monthBalance.value?.net ?? null,
);
const transactionTotalRaw = computed(() => {
  if (balance.value?.transactionTotal != null) return balance.value.transactionTotal;
  if (balance.value?.grossPaid != null) return balance.value.grossPaid;
  return null;
});
const pendingAmountRaw = computed(() => {
  if (transactionTotalRaw.value == null || balance.value?.grossPaid == null) return null;
  return Math.max(0, transactionTotalRaw.value - balance.value.grossPaid);
});
const settlementHostBalanceRaw = computed(() => balance.value?.settlement?.hostBalance ?? null);
const breakdownTransferPending = computed(() => {
  if (settlementHostBalanceRaw.value == null) return null;
  return Math.max(0, settlementHostBalanceRaw.value);
});
const breakdownOffsetPending = computed(() => {
  if (settlementHostBalanceRaw.value == null) return null;
  return Math.max(0, -settlementHostBalanceRaw.value);
});
const breakdownPaidOut = computed(() => balance.value?.settlement?.paidOutAll ?? null);
const platformSettlementDate = computed(() => platformSettlement.value?.nextRunAt ?? null);
const stripePayoutRule = computed(() => {
  const schedule = stripePayoutSchedule.value;
  if (!schedule || !schedule.interval) return null;
  const interval = schedule.interval;
  if (interval === 'daily') return '毎日';
  if (interval === 'weekly') {
    const anchor = schedule.weeklyAnchor || '';
    const map: Record<string, string> = {
      sunday: '毎週日曜',
      monday: '毎週月曜',
      tuesday: '毎週火曜',
      wednesday: '毎週水曜',
      thursday: '毎週木曜',
      friday: '毎週金曜',
      saturday: '毎週土曜',
    };
    return map[anchor] || '毎週';
  }
  if (interval === 'monthly') {
    const anchor = schedule.monthlyAnchor;
    return anchor ? `毎月${anchor}日` : '毎月';
  }
  if (interval === 'manual') return '手動';
  return interval;
});
const showInfoSheet = ref(false);
const infoSheetKey = ref<string | null>(null);
const infoSheetTitle = computed(() => {
  switch (infoSheetKey.value) {
    case 'stripe_balance':
      return 'Stripe 残高について';
    default:
      return 'Stripe 残高について';
  }
});
const infoSheetBody = computed(() => {
  if (infoSheetKey.value !== 'stripe_balance') return '';
  return [
    'Stripe 残高（合計）は「利用可能」と「保留中」の合計です。',
    '',
    '利用可能: すでに Stripe で利用可能になっている金額です。次回の自動振込 / 手動出金の対象になります。',
    '保留中: 決済直後などで、まだ利用可能になっていない金額です。Stripe の資金可用化後に自動で「利用可能」に移ります。',
  ].join('\n');
});

const stripeFeeLabel = computed(() => {
  const percentText = Number.isFinite(STRIPE_FEE_PERCENT) ? `${STRIPE_FEE_PERCENT}%` : '—';
  const parts: string[] = [percentText];
  if (STRIPE_FEE_FIXED_JPY > 0) {
    parts.push(`+${formatYen(STRIPE_FEE_FIXED_JPY)}`);
  }
  parts.push('推定');
  return `Stripe（${parts.join('・')}）`;
});

const communityId = computed(() => store.activeCommunityId.value);
const hasStripeBalance = computed(() => stripeAvailable.value > 0 || stripePending.value > 0);
const isEmpty = computed(() => (transactionTotalRaw.value ?? 0) === 0 && !hasStripeBalance.value);

const formatYen = (value?: number | null) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value || 0);
const formatYenOrDash = (value?: number | null) => (value == null ? '—' : formatYen(value));
const formatYenOrDashNegative = (value?: number | null) => (value == null ? '—' : `-${formatYen(value)}`);
const formatDateOrDash = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ja-JP');
};

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
    platformSettlement.value = null;
    stripePayoutSchedule.value = null;
    return;
  }
  try {
    const status = await refreshCommunityStripeStatus(community.value.id);
    stripeStatus.value = status.stripeAccountStatus ?? null;
    platformSettlement.value = status.platformSettlement ?? null;
    stripePayoutSchedule.value = status.stripePayoutSchedule ?? null;
    if (community.value) {
      community.value.stripeAccountId = status.stripeAccountId ?? community.value.stripeAccountId;
      if (status.stripeAccountOnboarded !== undefined) {
        community.value.stripeAccountOnboarded = status.stripeAccountOnboarded;
      }
    }
  } catch {
    stripeStatus.value = null;
    platformSettlement.value = null;
    stripePayoutSchedule.value = null;
  }
};

const loadBalance = async () => {
  if (!community.value?.id) return;
  try {
    const [allResult, monthResult] = await Promise.allSettled([
      fetchCommunityBalance(community.value.id, { period: 'all' }),
      fetchCommunityBalance(community.value.id, { period: 'month' }),
    ]);
    balance.value = allResult.status === 'fulfilled' ? allResult.value : null;
    monthBalance.value = monthResult.status === 'fulfilled' ? monthResult.value : null;
  } catch (err) {
    balance.value = null;
    monthBalance.value = null;
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

const openInfoSheet = () => {
  infoSheetKey.value = 'stripe_balance';
  showInfoSheet.value = true;
};

const closeInfoSheet = () => {
  showInfoSheet.value = false;
  infoSheetKey.value = null;
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
.summary--flat {
  padding: 0;
  border: none;
  box-shadow: none;
  background: transparent;
}
.summary-head {
  display: flex;
  gap: 10px;
  align-items: center;
}
.banner--pending {
  background: transparent;
}
.banner--enabled {
  background: transparent;
}
.banner--error {
  background: transparent;
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
  position: relative;
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
.hero-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hero-info {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}
.hero-status-tag {
  position: absolute;
  top: 12px;
  right: 12px;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.2);
  color: #fff;
}
.hero-value {
  margin: 6px 0 4px;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: 0.5px;
  line-height: 1.2;
  min-height: 38px;
  white-space: nowrap;
}
.hero-sub {
  margin: 0;
  font-size: 13px;
  opacity: 0.9;
}
.hero-formula {
  margin: 8px 0 10px;
}
.hero-formula-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr;
  align-items: baseline;
  gap: 6px;
}
.hero-formula-row--labels {
  font-size: 12px;
  opacity: 0.9;
  text-align: center;
}
.hero-formula-row--values {
  margin-top: 4px;
  font-size: 14px;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.hero-formula-term {
  white-space: nowrap;
}
.hero-formula-term--total {
  font-size: 20px;
  font-weight: 800;
}
.hero-formula-op {
  opacity: 0.9;
  font-weight: 800;
}
.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: flex-end;
  z-index: 1600;
}
.sheet {
  background: #fff;
  border-radius: 18px 18px 0 0;
  padding: 12px 16px 18px;
  width: 100%;
  box-shadow: 0 -12px 30px rgba(15, 23, 42, 0.16);
}
.sheet-handle {
  width: 48px;
  height: 5px;
  background: #e2e8f0;
  border-radius: 999px;
  margin: 0 auto 12px;
}
.sheet-title {
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 8px;
  text-align: center;
}
.sheet-desc {
  font-size: 13px;
  color: #475569;
  margin: 4px 0 0;
  text-align: left;
  line-height: 1.6;
  white-space: pre-wrap;
}
.sheet-close {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  border: none;
  background: #0f172a;
  color: #fff;
  font-weight: 700;
  font-size: 16px;
  margin-top: 12px;
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
  white-space: nowrap;
}
.kpi-value--refund {
  color: #b91c1c;
}
.kpi-value--fee {
  color: #ea580c;
}
.kpi--fee-card {
  background: #e0fbe2;
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
.kpi-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 6px;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  color: #475569;
  background: #e2e8f0;
}
.fee-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  color: #0f172a;
}
.guide-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
}
.guide-item {
  font-size: 13px;
  color: #0f172a;
}
.breakdown-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}
.breakdown-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  color: #0f172a;
}
.breakdown-action {
  margin-top: 10px;
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
.action-detail {
  background: #f1f5f9;
  border-radius: 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
}
.action-detail summary {
  cursor: pointer;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 6px;
}
.action-detail__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
