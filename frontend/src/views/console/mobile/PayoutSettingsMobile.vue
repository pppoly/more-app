<template>
  <div class="payout-page">
    <ConsoleTopBar v-if="!isLiffClientMode" :title="pageTitle" @back="goBack" />

    <section class="banner" :class="`banner--${status.type}`">
      <div class="banner-icon">{{ status.icon }}</div>
      <div>
        <p class="banner-title">{{ status.title }}</p>
        <p class="banner-text">入金や返金は Stripe のセキュア画面で管理します。</p>
      </div>
    </section>

    <section class="hero">
      <p class="hero-label">受け取り可能</p>
      <p class="hero-value">{{ formatYen(balanceNet) }}</p>
      <p class="hero-sub">待結算 {{ formatYen(pendingAmount) }}</p>
    </section>

    <section class="kpi-grid">
      <article class="kpi">
        <p class="kpi-label">総収入</p>
        <p class="kpi-value">{{ formatYen(balanceGross) }}</p>
      </article>
      <article class="kpi">
        <p class="kpi-label">返金済み</p>
        <p class="kpi-value kpi-value--refund">-{{ formatYen(balanceRefunded) }}</p>
      </article>
      <article class="kpi">
        <p class="kpi-label">プラットフォーム手数料</p>
        <p class="kpi-value kpi-value--fee">-{{ formatYen(balanceFee) }}</p>
      </article>
    </section>

    <section class="actions">
      <button class="btn primary" type="button" :disabled="!communityId" @click="goPayments">
        取引履歴を見る
      </button>
      <button class="btn ghost" type="button" :disabled="onboarding" @click="handleOnboarding">
        {{ onboarding ? '移動中…' : '受け取り情報を更新' }}
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
import { useRouter } from 'vue-router';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import { fetchConsoleCommunity, fetchCommunityBalance, startCommunityStripeOnboarding } from '../../../api/client';
import type { ConsoleCommunityBalance, ConsoleCommunityDetail } from '../../../types/api';
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';
import { isLiffClient } from '../../../utils/device';
import { APP_TARGET } from '../../../config';

const store = useConsoleCommunityStore();
const router = useRouter();
const community = ref<ConsoleCommunityDetail | null>(null);
const onboarding = ref(false);
const error = ref<string | null>(null);
const balance = ref<ConsoleCommunityBalance | null>(null);
const isLiffClientMode = computed(() => isLiffClient() || APP_TARGET === 'liff');

const stripeReady = computed(
  () => !!community.value?.stripeAccountId && (community.value?.stripeAccountOnboarded ?? true),
);
const pageTitle = computed(() => '社群財務');

const status = computed(() => {
  if (stripeReady.value) {
    return { type: 'enabled', icon: '🟢', title: '受け取りは有効です' };
  }
  return { type: 'pending', icon: '🟠', title: '連携を完了してください' };
});

const balanceNet = computed(() => balance.value?.net ?? 0);
const balanceGross = computed(() => balance.value?.grossPaid ?? 0);
const balanceRefunded = computed(() => balance.value?.refunded ?? 0);
const balanceFee = computed(() => balance.value?.platformFee ?? 0);
const pendingAmount = computed(() => balance.value?.settling ?? 0); // TODO: 後端が未対応なら 0

const communityId = computed(() => store.activeCommunityId.value);
const isEmpty = computed(
  () => balanceGross.value === 0 && balanceNet.value === 0 && balanceRefunded.value === 0 && balanceFee.value === 0,
);

const formatYen = (value?: number | null) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value || 0);

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

const loadBalance = async () => {
  if (!community.value?.id || !stripeReady.value) return;
  try {
    balance.value = await fetchCommunityBalance(community.value.id, { period: 'all' });
  } catch (err) {
    balance.value = null;
  }
};

const handleOnboarding = async () => {
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
.banner {
  display: flex;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  align-items: center;
  background: #e0f2fe;
  color: #0f172a;
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
