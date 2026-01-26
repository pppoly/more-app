<template>
  <section class="liff-entry">
    <div class="liff-entry__spinner" />
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { LOGIN_REDIRECT_STORAGE_KEY } from '../../constants/auth';
import { normalizeLiffStateToPath } from '../../utils/liff';

const route = useRoute();
const router = useRouter();
const auth = useAuth();

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

onMounted(async () => {
  const hasCode =
    typeof route.query.code === 'string' ||
    typeof route.query.oauth_verifier === 'string';
  if (hasCode) {
    try {
      const result = await auth.loginWithLiff();
      if (!result.ok && result.reason === 'login_redirect') {
        return;
      }
    } catch (error) {
      console.warn('Failed to complete LIFF login callback', error);
    }
  }
  const target = resolveRedirectTarget();
  clearStoredRedirect();
  await router.replace(target);
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

@keyframes liff-entry-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
