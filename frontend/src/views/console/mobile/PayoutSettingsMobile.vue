<template>
  <div class="payout">
    <header class="app-bar">
      <button class="text-back" type="button" @click="router.back()">
        {{ $t('nav.back') }}
      </button>
      <div class="app-bar__title">
        <h1>{{ pageTitle }}</h1>
      </div>
      <button class="text-back text-back--ghost" type="button" aria-hidden="true" tabindex="-1">
        {{ $t('nav.back') }}
      </button>
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
      <button class="ghost" type="button" @click="goPayments">查看交易流水</button>
    </section>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useConsoleCommunityStore } from '../../../stores/consoleCommunity';
import { fetchConsoleCommunity, startCommunityStripeOnboarding } from '../../../api/client';
import type { ConsoleCommunityDetail } from '../../../types/api';

const store = useConsoleCommunityStore();
const router = useRouter();
const community = ref<ConsoleCommunityDetail | null>(null);
const onboarding = ref(false);
const error = ref<string | null>(null);

const stripeReady = computed(
  () => !!(community.value?.stripeAccountId && community.value?.stripeAccountOnboarded),
);
const pageTitle = computed(() => '收款设置');

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

const goPayments = () => {
  const id = community.value?.id || store.activeCommunityId.value;
  if (!id) return;
  router.push({ name: 'ConsoleMobilePayments', params: { communityId: id } });
};

onMounted(loadCommunity);
</script>

<style scoped>
.payout {
  min-height: 100vh;
  background: #f8fafc;
  padding: calc(env(safe-area-inset-top, 0px) + 8px) 16px calc(80px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.app-bar {
  display: grid;
  grid-template-columns: 80px 1fr 80px;
  align-items: center;
  gap: 12px;
  padding: calc(10px + env(safe-area-inset-top, 0px)) 0 12px;
  width: calc(100% + 32px);
  margin: 0 -16px;
  background: #fff;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
}
.app-bar__title h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
  text-align: center;
}
.text-back {
  border: none;
  background: transparent;
  color: #0f172a;
  font-weight: 700;
  font-size: 15px;
  padding: 0;
  min-width: 72px;
  text-align: left;
}
.text-back--ghost {
  visibility: hidden;
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
.ghost {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 12px;
  padding: 12px;
  font-size: 14px;
  color: #0f172a;
}
</style>
