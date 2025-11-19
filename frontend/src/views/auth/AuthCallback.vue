<template>
  <section class="auth-callback">
    <p v-if="loading">Processing login...</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <p v-else>Login successful! Redirecting...</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { LOGIN_FLOW_STORAGE_KEY, LOGIN_REDIRECT_STORAGE_KEY } from '../../constants/auth';
import { needsProfileSetup } from '../../utils/profileSetup';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  const token = route.query.token as string | undefined;
  if (!token) {
    error.value = 'Token missing from callback';
    loading.value = false;
    return;
  }

  try {
    auth.setToken(token);
    await auth.fetchCurrentUser();
    const storedRedirect =
      (typeof window !== 'undefined' && window.localStorage.getItem(LOGIN_REDIRECT_STORAGE_KEY)) || null;
    const storedFlow =
      (typeof window !== 'undefined' && window.localStorage.getItem(LOGIN_FLOW_STORAGE_KEY)) || 'line';
    if (storedRedirect && typeof window !== 'undefined') {
      window.localStorage.removeItem(LOGIN_REDIRECT_STORAGE_KEY);
    }
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LOGIN_FLOW_STORAGE_KEY);
    }
    const redirectTarget = storedRedirect || '/';
    if (needsProfileSetup(auth.user.value, storedFlow)) {
      await router.replace({
        name: 'auth-setup',
        query: { redirect: redirectTarget, mode: storedFlow },
      });
    } else {
      await router.replace(redirectTarget);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to complete login';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.auth-callback {
  padding: 2rem;
}

.error {
  color: #b91c1c;
}
</style>
