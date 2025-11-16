<template>
  <section class="apply-page">
    <header>
      <h2>主理人申請</h2>
      <p>コミュニティを作成したい方はこちらから申請してください。</p>
    </header>

    <p v-if="initializing" class="status">ログイン状態を確認中...</p>

    <div v-else-if="!user" class="card">
      <p>主理人申請にはログインが必要です。</p>
      <div class="actions">
        <button type="button" class="primary" @click="promptDevLogin">Dev Login</button>
        <button type="button" class="secondary" @click="redirectLineLogin">LINE Login</button>
      </div>
    </div>

    <div v-else>
      <div v-if="status?.isOrganizer" class="card success">
        <h3>すでに主理人として認可されています 🎉</h3>
        <p>主理人コンソールからコミュニティやイベントを作成できます。</p>
        <RouterLink class="primary" to="/console/communities">主理人コンソールへ</RouterLink>
      </div>

      <div v-else-if="status?.hasApplied" class="card">
        <template v-if="status.application?.status === 'pending'">
          <h3>申請受付済み</h3>
          <p>現在審査中です。しばらくお待ちください。</p>
        </template>
        <template v-else-if="status.application?.status === 'rejected'">
          <h3>申請が承認されませんでした</h3>
          <p>再申請をご希望の場合はサポートまでご連絡ください。</p>
        </template>
      </div>

      <form v-else class="card form" @submit.prevent="submit">
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
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useAuth } from '../../composables/useAuth';
import { fetchMyOrganizerApplication, submitOrganizerApplication } from '../../api/client';
import type { OrganizerApplicationStatus } from '../../types/api';

const auth = useAuth();
const user = auth.user;
const initializing = auth.initializing;

const status = ref<OrganizerApplicationStatus | null>(null);
const loadingStatus = ref(false);
const submitting = ref(false);
const message = ref('');
const form = reactive({
  reason: '',
  experience: '',
});

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
    } else {
      status.value = null;
    }
  },
  { immediate: true },
);

const submit = async () => {
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

const promptDevLogin = async () => {
  const name = window.prompt('Dev Login 用の表示名を入力してください', 'MORE Organizer');
  if (!name) return;
  await auth.loginDev(name);
  await loadStatus();
};

const redirectLineLogin = () => {
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
  const backendOrigin = base.replace(/\/$/, '').replace(/\/api\/v1$/, '');
  window.location.href = `${backendOrigin}/api/v1/auth/line/redirect`;
};
</script>

<style scoped>
.apply-page {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
header h2 {
  margin: 0;
}
.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.card.success {
  border-color: #86efac;
  background: #f0fdf4;
}
.form label {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-weight: 600;
}
textarea {
  border-radius: 0.5rem;
  border: 1px solid #cbd5f5;
  padding: 0.6rem;
}
.primary {
  border: none;
  background: #2563eb;
  color: #fff;
  padding: 0.6rem 1.2rem;
  border-radius: 0.5rem;
  cursor: pointer;
}
.secondary {
  border: 1px solid #94a3b8;
  background: transparent;
  color: #0f172a;
  padding: 0.6rem 1.2rem;
  border-radius: 0.5rem;
  cursor: pointer;
}
.actions {
  display: flex;
  gap: 0.5rem;
}
.status {
  color: #475569;
}
.required {
  color: #dc2626;
}
</style>
