<template>
  <section class="apply-page">
    <section class="hero">
      <p class="eyebrow">MORE 主理人募集</p>
      <h2>あなたのコミュニティを<br />もっと遠くへ</h2>
      <p class="hero-desc">
        AI コンシェルジュ・多言語案内・チケット販売・参加者管理まで、すべての機能を一つのモバイルアプリで。
      </p>
      <div class="cta-row">
        <button type="button" class="primary" @click="handleApplyAction">
          {{ user?.isOrganizer ? '主理人コンソールへ' : '今すぐ申し込む' }}
        </button>
        <RouterLink class="secondary" :to="{ name: 'events' }">まずはイベントを見る</RouterLink>
      </div>
      <p class="note">※ 申請にはログインが必要です。未ログインの場合はログイン画面へ遷移します。</p>
    </section>

    <section class="features">
      <article class="feature-card" v-for="feature in features" :key="feature.title">
        <span :class="['feature-icon', feature.icon]"></span>
        <div>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.desc }}</p>
        </div>
      </article>
    </section>

    <section class="steps">
      <h3>申請の流れ</h3>
      <ol>
        <li v-for="(step, index) in steps" :key="step">
          <span class="step-index">{{ index + 1 }}</span>
          <p>{{ step }}</p>
        </li>
      </ol>
    </section>

    <section class="application-section">
      <p v-if="initializing" class="status">ログイン状態を確認中...</p>

      <div v-else-if="!user" class="card status-card">
        <p>まだログインしていません。主理人申請を続けるにはログインしてください。</p>
        <RouterLink class="primary" :to="{ name: 'auth-login', query: { redirect: route.fullPath } }">
          ログイン / 登録
        </RouterLink>
      </div>

      <div v-else>
        <div v-if="status?.isOrganizer" class="card success">
          <h3>すでに主理人として認可されています 🎉</h3>
          <p>主理人コンソールからコミュニティやイベントを作成できます。</p>
          <RouterLink class="primary" :to="{ name: 'console-communities' }">主理人コンソールへ</RouterLink>
        </div>

        <div v-else-if="status?.hasApplied" class="card status-card">
          <template v-if="status.application?.status === 'pending'">
            <h3>申請受付済み</h3>
            <p>現在審査中です。しばらくお待ちください。</p>
          </template>
          <template v-else-if="status.application?.status === 'rejected'">
            <h3>申請が承認されませんでした</h3>
            <p>再申請をご希望の場合はサポートまでご連絡ください。</p>
          </template>
        </div>

        <form v-else class="card form" @submit.prevent="submit" ref="formRef">
          <label>
            申請理由 <span class="required">*</span>
            <textarea v-model="form.reason" rows="4" required placeholder="どのような活動を予定していますか？"></textarea>
          </label>
          <label>
            これまでの経験（任意）
            <textarea v-model="form.experience" rows="3" placeholder="過去のイベントやコミュニティ運営経験があれば教えてください"></textarea>
          </label>
          <p v-if="message" class="status">{{ message }}</p>
          <button type="submit" class="primary" :disabled="submitting">
            {{ submitting ? '送信中...' : '申請を送信' }}
          </button>
        </form>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useAuth } from '../../composables/useAuth';
import { fetchMyOrganizerApplication, submitOrganizerApplication } from '../../api/client';
import type { OrganizerApplicationStatus } from '../../types/api';
import { useRouter, useRoute } from 'vue-router';

const auth = useAuth();
const user = auth.user;
const initializing = auth.initializing;
const router = useRouter();
const route = useRoute();

const status = ref<OrganizerApplicationStatus | null>(null);
const loadingStatus = ref(false);
const submitting = ref(false);
const message = ref('');
const form = reactive({
  reason: '',
  experience: '',
});
const formRef = ref<HTMLElement | null>(null);
const features = [
  {
    title: 'AI 企画アシスタント',
    desc: '多言語でアイデアを整理し、コミュニティの魅力を最大化します。',
    icon: 'i-lucide-sparkles',
  },
  {
    title: 'モバイル運営',
    desc: '告知・集客・決済・チェックインまで、すべてスマホ一つで完結。',
    icon: 'i-lucide-tablet-smartphone',
  },
  {
    title: '多文化安全ガイド',
    desc: '外国人が安心して参加できるルールづくりや制度の相談にも対応。',
    icon: 'i-lucide-shield-check',
  },
];
const steps = ['アカウントを作成/ログイン', '申請フォームの記入', '審査結果のご案内', 'コンソールからコミュニティ作成'];

const loadStatus = async () => {
  if (!user.value) {
    status.value = null;
    return;
  }
  loadingStatus.value = true;
  try {
    status.value = await fetchMyOrganizerApplication();
  } catch (error) {
    console.error('Failed to load organizer status', error);
  } finally {
    loadingStatus.value = false;
  }
};

watch(
  () => user.value?.id,
  (val) => {
    if (val) {
      loadStatus();
      if (typeof window !== 'undefined') {
        const bookingRedirect = window.localStorage.getItem('booking:redirect');
        const favoriteRedirect = window.localStorage.getItem('favorite:redirect');
        const queryRedirect = route.query.redirect as string | undefined;
        const redirect = bookingRedirect || favoriteRedirect || queryRedirect;
        if (bookingRedirect) {
          window.localStorage.removeItem('booking:redirect');
        }
        if (favoriteRedirect) {
          window.localStorage.removeItem('favorite:redirect');
        }
        if (redirect) {
          router.replace(redirect);
        }
      }
    } else {
      status.value = null;
    }
  },
  { immediate: true },
);

const handleApplyAction = () => {
  if (user.value?.isOrganizer) {
    router.push({ name: 'console-communities' });
    return;
  }
  if (!user.value) {
    router.push({ name: 'auth-login', query: { redirect: route.fullPath } });
    return;
  }
  formRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const submit = async () => {
  if (!user.value) {
    router.push({ name: 'auth-login', query: { redirect: route.fullPath } });
    return;
  }
  if (!form.reason.trim()) {
    message.value = '申請理由を入力してください。';
    return;
  }
  submitting.value = true;
  message.value = '';
  try {
    await submitOrganizerApplication({
      reason: form.reason.trim(),
      experience: form.experience.trim() || undefined,
    });
    message.value = '申請ありがとうございました。自動承認されました！';
    await auth.fetchCurrentUser();
    await loadStatus();
  } catch (error) {
    console.error(error);
    message.value = '申請の送信中にエラーが発生しました。';
  } finally {
    submitting.value = false;
  }
};

</script>

<style scoped>
.apply-page {
  padding: 32px 20px 64px;
  display: flex;
  flex-direction: column;
  gap: 32px;
  background: #f7f9fc;
  min-height: 100vh;
}

.hero {
  background: linear-gradient(135deg, #0f3057, #2ba7b4);
  color: #fff;
  border-radius: 24px;
  padding: 28px 24px;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.25);
}

.cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 18px 0;
}

.primary {
  border: none;
  border-radius: 999px;
  padding: 12px 22px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #f97316, #f43f5e);
}

.secondary {
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 999px;
  padding: 10px 20px;
  color: #fff;
  text-decoration: none;
}
</style>
