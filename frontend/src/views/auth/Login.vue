<template>
<div class="login-page">
  <section class="login-card">
    <h2>LINEでログイン</h2>
    <p>本番利用に推奨。LINE認証後に自動ログインします。</p>
    <button type="button" class="line-button" @click="handleLineLogin">
      LINEログイン
    </button>
  </section>

  <section v-if="showQuickLogin" class="login-card">
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
import { useToast } from '../../composables/useToast';
import { LOGIN_FLOW_STORAGE_KEY, LOGIN_REDIRECT_STORAGE_KEY } from '../../constants/auth';
import { needsProfileSetup } from '../../utils/profileSetup';
import { API_BASE_URL, APP_TARGET, isProduction } from '../../config';
import { isLineInAppBrowser, loadLiff } from '../../utils/liff';
import { isLiffClient } from '../../utils/device';

const auth = useAuth();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const devName = ref('');
const loading = ref(false);
const error = ref('');

const looksLikeNonProdHost = (value: string) => {
  const input = (value || '').toLowerCase();
  let host = input;
  try {
    host = new URL(input).hostname.toLowerCase();
  } catch {
    // ignore
  }
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === 'test.socialmore.jp' ||
    host.endsWith('.test.socialmore.jp') ||
    host.startsWith('test.') ||
    host.includes('.test.') ||
    host.includes('-test.') ||
    host === 'stg.socialmore.jp' ||
    host.endsWith('.stg.socialmore.jp') ||
    host.startsWith('stg.') ||
    host.includes('.stg.') ||
    host.includes('-stg.') ||
    host === 'staging.socialmore.jp' ||
    host.endsWith('.staging.socialmore.jp') ||
    host.startsWith('staging.') ||
    host.includes('.staging.') ||
    host.includes('-staging.') ||
    host === 'dev.socialmore.jp' ||
    host.endsWith('.dev.socialmore.jp') ||
    host.startsWith('dev.') ||
    host.includes('.dev.') ||
    host.includes('-dev.') ||
    host.includes('staging') ||
    host.endsWith('.vercel.app')
  );
};

const showQuickLogin = computed(() => {
  if (import.meta.env.DEV) return true;
  if ((import.meta.env.MODE || '').toLowerCase() === 'test') return true;
  if (!isProduction()) return true;
  if (looksLikeNonProdHost(API_BASE_URL)) return true;
  if (typeof window === 'undefined') return false;
  return looksLikeNonProdHost(window.location.hostname);
});

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
    await finishLoginFlow('email');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'ログインに失敗しました';
  } finally {
    loading.value = false;
  }
};

const handleLineLogin = async () => {
  if (typeof window === 'undefined') return;
  const host = window.location.hostname;
  const isLiffHost = host.includes('miniapp.line.me') || host.includes('liff.line.me');
  let inClient = isLiffClient();
  if (!inClient) {
    try {
      const liff = await loadLiff();
      inClient = typeof liff.isInClient === 'function' ? liff.isInClient() : false;
    } catch {
      inClient = false;
    }
  }
  const shouldUseLiffLogin =
    APP_TARGET === 'liff' || inClient || isLiffHost || isLineInAppBrowser();
  if (shouldUseLiffLogin) {
    loading.value = true;
    error.value = '';
    try {
      const liffRedirect = '/events';
      window.localStorage.setItem(LOGIN_REDIRECT_STORAGE_KEY, liffRedirect);
      const result = await auth.loginWithLiff();
      if (result.ok) {
        await router.replace(liffRedirect);
        return;
      }
      if (!result.ok && result.reason !== 'login_redirect') {
        const message =
          result.reason === 'missing_id'
            ? 'LINE 設定が未完了です。管理者に連絡してください。'
            : result.reason === 'init_failed'
              ? 'LINE ログインの初期化に失敗しました。'
              : result.reason === 'not_in_client'
                ? 'LINE アプリ内で開いてください。'
                : 'LINE ログインに失敗しました。もう一度お試しください。';
        error.value = message;
        toast.show(message, 'error');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'LINE ログインに失敗しました。もう一度お試しください。';
      error.value = message;
      toast.show(message, 'error');
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
