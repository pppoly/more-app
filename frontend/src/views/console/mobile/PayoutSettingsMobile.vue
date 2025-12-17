<template>
  <div class="payout">
    <ConsoleTopBar :title="pageTitle" @back="goBack" />

    <section class="card" v-if="community">
      <div class="row">
        <div>
          <p class="label">アカウント状態</p>
          <h3>{{ stripeReady ? '受け取り可能です' : 'まだ開設されていません' }}</h3>
          <p class="muted">決済受け取りを有効化すると、イベントの売上を入金できます。</p>
        </div>
        <div class="status-block">
          <p class="small">アカウント ID</p>
          <strong>{{ community.stripeAccountId || '未作成' }}</strong>
        </div>
      </div>

      <button class="primary" :disabled="onboarding" @click="handleOnboarding">
        {{ onboarding ? '移動中…' : stripeReady ? '受け取り情報を更新' : '受け取りを開始する' }}
      </button>
      <p class="hint">Stripe の画面で情報入力後に戻ってください。</p>
      <button class="ghost" type="button" @click="goPayments">取引履歴を見る</button>
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
import ConsoleTopBar from '../../../components/console/ConsoleTopBar.vue';

const store = useConsoleCommunityStore();
const router = useRouter();
const community = ref<ConsoleCommunityDetail | null>(null);
const onboarding = ref(false);
const error = ref<string | null>(null);

const stripeReady = computed(
  () => !!(community.value?.stripeAccountId && community.value?.stripeAccountOnboarded),
);
const pageTitle = computed(() => '受け取り設定');

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

const goBack = () => {
  router.back();
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
