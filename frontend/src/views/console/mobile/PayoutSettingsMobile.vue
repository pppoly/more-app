<template>
  <div class="payout">
    <header class="hero">
      <div>
        <p class="eyebrow">收银台</p>
        <h1>{{ titleText }}</h1>
        <p class="sub">{{ subText }}</p>
      </div>
      <span :class="['pill', stripeReady ? 'ok' : 'warn']">
        {{ stripeReady ? '可收款' : '待开通' }}
      </span>
    </header>

    <section class="card" v-if="community">
      <div class="row">
        <div>
          <p class="label">账户状态</p>
          <h3>{{ stripeReady ? '可以收钱啦' : '还没开通' }}</h3>
          <p class="muted">先把收款开好，活动收入才能打进来。</p>
        </div>
        <div class="status-block">
          <p class="small">账户 ID</p>
          <strong>{{ community.stripeAccountId || '未创建' }}</strong>
        </div>
      </div>

      <button class="primary" :disabled="onboarding" @click="handleOnboarding">
        {{ onboarding ? '跳转中…' : stripeReady ? '更新收款信息' : '去开通收款' }}
      </button>
      <p class="hint">会跳到 Stripe 填信息，回来后就能继续用了。</p>
    </section>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import { fetchConsoleCommunity, startCommunityStripeOnboarding } from '../../../api/client';
import type { ConsoleCommunityDetail } from '../../../types/api';

const store = useConsoleCommunityStore();
const community = ref<ConsoleCommunityDetail | null>(null);
const onboarding = ref(false);
const error = ref<string | null>(null);

const stripeReady = computed(
  () => !!(community.value?.stripeAccountId && community.value?.stripeAccountOnboarded),
);

const titleText = computed(() => (stripeReady.value ? '可以收钱啦' : '先把收款开一下'));
const subText = computed(() =>
  stripeReady.value ? '资料有变可以随时更新，保证打款顺利。' : '按提示填资料，很快就能把票款结算到你账户。',
);

const loadCommunity = async () => {
  error.value = null;
  if (!store.activeCommunityId.value) {
    await store.loadCommunities();
    store.ensureActiveCommunity();
  }
  const id = store.activeCommunityId.value;
  if (!id) {
    error.value = '未找到可管理的社群';
    return;
  }
  try {
    community.value = await fetchConsoleCommunity(id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '收款信息获取失败';
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
      err?.response?.data?.message || (err instanceof Error ? err.message : '收款链接生成失败');
  } finally {
    onboarding.value = false;
  }
};

onMounted(loadCommunity);
</script>

<style scoped>
.payout {
  min-height: 100vh;
  background: #f8fafc;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px
    calc(80px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.hero {
  background: linear-gradient(135deg, #2563eb, #10b981);
  color: #f8fafc;
  padding: 16px;
  border-radius: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  box-shadow: 0 18px 40px rgba(37, 99, 235, 0.2);
}
.eyebrow {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
  opacity: 0.9;
}
.hero h1 {
  margin: 4px 0 6px;
  font-size: 22px;
  font-weight: 800;
}
.sub {
  margin: 0;
  color: #e2f3ff;
  font-size: 14px;
}
.pill {
  padding: 6px 12px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
  border: 1px solid rgba(255, 255, 255, 0.35);
}
.pill.ok {
  background: rgba(16, 185, 129, 0.2);
  color: #d1fae5;
}
.pill.warn {
  background: rgba(251, 191, 36, 0.2);
  color: #fef3c7;
}
.card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.label {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}
.muted {
  margin: 4px 0 0;
  color: #475569;
  font-size: 14px;
}
.status-block {
  text-align: right;
  color: #0f172a;
}
.status-block strong {
  display: block;
  font-size: 16px;
}
.status-block .small {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
}
.primary {
  border: none;
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  padding: 12px 14px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 15px;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.25);
}
.primary:disabled {
  opacity: 0.7;
}
.hint {
  margin: 0;
  color: #94a3b8;
  font-size: 13px;
}
.error {
  color: #b91c1c;
  text-align: center;
  font-weight: 600;
}
</style>
