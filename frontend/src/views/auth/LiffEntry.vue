<template>
  <section class="liff-entry">
    <div v-if="loading" class="liff-entry__spinner" />
    <div v-else class="liff-entry__error">
      <p>{{ errorMessage }}</p>
      <button type="button" class="liff-entry__retry" @click="retryLogin">
        再読み込み
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { LOGIN_REDIRECT_STORAGE_KEY } from '../../constants/auth';
import { normalizeLiffStateToPath } from '../../utils/liff';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const loading = ref(true);
const errorReason = ref<string | null>(null);

const resolveRedirectTarget = (): string => {
  const rawTo = Array.isArray(route.query.to) ? route.query.to[0] : route.query.to;
  if (typeof rawTo === 'string' && rawTo.startsWith('/') && !rawTo.startsWith('//')) {
    return rawTo;
  }
  const liffStateRaw = Array.isArray(route.query['liff.state']) ? route.query['liff.state'][0] : route.query['liff.state'];
  if (typeof liffStateRaw === 'string') {
    const liffPath = normalizeLiffStateToPath(liffStateRaw);
    if (liffPath) return liffPath;
  }
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(LOGIN_REDIRECT_STORAGE_KEY) || '';
      if (stored && stored.startsWith('/') && !stored.startsWith('//')) {
        return stored;
      }
    } catch {
      // ignore storage errors
    }
  }
  return '/events';
};

const clearStoredRedirect = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LOGIN_REDIRECT_STORAGE_KEY);
  } catch {
    // ignore
  }
};

const errorMessage = computed(() => {
  return errorReason.value || 'LINE ログインに失敗しました。もう一度お試しください。';
});

const retryLogin = async () => {
  if (loading.value) return;
  loading.value = true;
  errorReason.value = null;
  await runLogin();
};

const runLogin = async () => {
  const target = resolveRedirectTarget();
  try {
    const result = await auth.loginWithLiff();
    if (result.ok) {
      clearStoredRedirect();
      await router.replace(target);
      return;
    }
    if (result.reason === 'login_redirect') {
      return;
    }
    errorReason.value = 'LINE ログインが完了しませんでした。';
  } catch (error) {
    errorReason.value = error instanceof Error ? error.message : 'LINE ログインに失敗しました。';
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  await runLogin();
});
</script>

<style scoped>
.liff-entry {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
}

.liff-entry__spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid #e2e8f0;
  border-top-color: #0f172a;
  animation: liff-entry-spin 0.8s linear infinite;
}

.liff-entry__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #0f172a;
  font-size: 14px;
  text-align: center;
}

.liff-entry__retry {
  border: none;
  border-radius: 999px;
  padding: 8px 16px;
  background: #0f172a;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

@keyframes liff-entry-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
