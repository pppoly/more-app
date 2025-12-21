<template>
  <div class="return-page">
    <div class="card">
      <p class="eyebrow">お支払い結果</p>
      <h1>{{ title }}</h1>
      <p class="desc">{{ message }}</p>
      <button class="primary" type="button" @click="goHome">ホームへ戻る</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const status = computed(() => (route.query.redirect_status as string | undefined) || '');

const title = computed(() => {
  switch (status.value) {
    case 'succeeded':
    case 'completed':
      return 'お支払いが完了しました';
    case 'failed':
      return 'お支払いに失敗しました';
    case 'requires_payment_method':
      return 'お支払い方法の確認が必要です';
    default:
      return 'お支払いを処理しています';
  }
});

const message = computed(() => {
  switch (status.value) {
    case 'succeeded':
    case 'completed':
      return '決済が完了しました。マイページから取引詳細を確認できます。';
    case 'failed':
      return '決済に失敗しました。お手数ですが再度お試しください。';
    case 'requires_payment_method':
      return 'カード認証や別の支払い方法の追加が必要です。';
    default:
      return 'しばらくしてから取引状況を確認してください。';
  }
});

const goHome = () => {
  router.replace({ name: 'home' });
};
</script>

<style scoped>
.return-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  background: #f7f9fb;
}
.card {
  width: 100%;
  max-width: 480px;
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  text-align: center;
}
.eyebrow {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  letter-spacing: 0.08em;
}
h1 {
  margin: 10px 0 8px;
  font-size: 20px;
}
.desc {
  margin: 0 0 16px;
  color: #475569;
  font-size: 14px;
  line-height: 1.6;
}
.primary {
  width: 100%;
  border: none;
  border-radius: 12px;
  padding: 12px;
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
}
</style>
