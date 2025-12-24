<template>
<div class="login-page">
  <section class="login-card">
    <h2>LINEでログイン</h2>
    <p>本番利用に推奨。LINE認証後に自動ログインします。</p>
    <button type="button" class="line-button" @click="handleLineLogin">
      LINEログイン
    </button>
  </section>

  <section v-if="APP_TARGET !== 'liff'" class="login-card">
    <h2>テスト環境クイックログイン</h2>
    <p>任意の表示名を入力するとフローを体験できます。</p>
    <label>
      表示名
      <input v-model="devName" type="text" placeholder="例：MORE Test User" />
    </label>
    <button type="button" class="primary" :disabled="loading" @click="handleDevLogin">
      {{ loading ? 'ログイン中...' : 'ワンクリック体験' }}
    </button>
    <p v-if="error" class="error">{{ error }}</p>
  </section>
</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { LOGIN_FLOW_STORAGE_KEY, LOGIN_REDIRECT_STORAGE_KEY } from '../../constants/auth';
import { needsProfileSetup } from '../../utils/profileSetup';
import { API_BASE_URL, APP_TARGET } from '../../config';

const auth = useAuth();
const route = useRoute();
const router = useRouter();
const devName = ref('');
const loading = ref(false);
const error = ref('');

const redirectTarget = computed(() => {
  const redirect = route.query.redirect as string | undefined;
  return redirect && redirect.startsWith('/') ? redirect : '/';
});

const finishLoginFlow = async (mode: string) => {
  const profile = auth.user.value;
  if (needsProfileSetup(profile, mode)) {
    await router.replace({
      name: 'auth-setup',
      query: { redirect: redirectTarget.value || '/', mode },
    });
    return;
  }
  await router.replace(redirectTarget.value || '/');
};

const handleDevLogin = async () => {
  if (!devName.value.trim()) {
    error.value = '表示名を入力してください';
    return;
  }
  error.value = '';
  loading.value = true;
  try {
    await auth.loginDev(devName.value.trim());
    await finishLoginFlow('dev');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'ログインに失敗しました';
  } finally {
    loading.value = false;
  }
};

const handleLineLogin = async () => {
  if (typeof window === 'undefined') return;
  if (APP_TARGET === 'liff') {
    loading.value = true;
    error.value = '';
    try {
      await auth.loginWithLiff();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'LINEログインに失敗しました';
    } finally {
      loading.value = false;
    }
    return;
  }
  window.localStorage.setItem(LOGIN_FLOW_STORAGE_KEY, 'line');
  window.localStorage.setItem(LOGIN_REDIRECT_STORAGE_KEY, redirectTarget.value || '/');
  const backendOrigin = API_BASE_URL.replace(/\/$/, '').replace(/\/api\/v1$/, '');
  window.location.href = `${backendOrigin}/api/v1/auth/line/redirect`;
};

</script>

<style scoped>
.login-page {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 24px) 20px calc(80px + env(safe-area-inset-bottom, 0px));
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.login-card {
  width: min(420px, 100%);
  background: #fff;
  border-radius: var(--app-border-radius);
  padding: 20px;
  box-shadow: 0 30px 60px rgba(15, 23, 42, 0.1);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.login-card h2 {
  margin: 0;
  font-size: 18px;
}

.login-card p {
  margin: 0;
  color: #475569;
  font-size: 14px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #475569;
}

input {
  border: 1px solid #e2e8f0;
  border-radius: var(--app-border-radius);
  padding: 10px 12px;
  font-size: 15px;
}

.primary {
  border: none;
  border-radius: var(--app-border-radius);
  padding: 12px;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #0090d9, #22bbaa, #e4c250);
}

.secondary {
  border: 1px solid #d5e2ff;
  border-radius: var(--app-border-radius);
  padding: 10px 12px;
  font-size: 15px;
  font-weight: 600;
  color: #2563eb;
  background: transparent;
}

.divider {
  width: min(420px, 100%);
  display: flex;
  align-items: center;
  gap: 12px;
  color: #94a3b8;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e2e8f0;
}

.line-card {
  align-items: stretch;
}

.line-button {
  border: 1px solid #00c300;
  border-radius: var(--app-border-radius);
  padding: 12px;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  background: #00c300;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.error {
  color: #b91c1c;
  margin: 0;
}

.code-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.status {
  margin: 0;
  font-size: 13px;
  color: #b91c1c;
}

.info {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
</style>
