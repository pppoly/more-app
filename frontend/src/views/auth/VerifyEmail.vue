<template>
  <div class="verify-page">
    <div class="verify-card">
      <h2 class="verify-title">{{ t('mobile.emailVerify.title') }}</h2>
      <p v-if="status === 'loading'" class="verify-message">{{ t('mobile.emailVerify.loading') }}</p>
      <p v-else-if="status === 'success'" class="verify-message verify-message--success">
        {{ t('mobile.emailVerify.success') }}
      </p>
      <p v-else class="verify-message verify-message--error">
        {{ errorMessage || t('mobile.emailVerify.error') }}
      </p>
      <button type="button" class="primary-btn" @click="goHome">
        {{ t('mobile.emailVerify.back') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { verifyEmailToken } from '../../api/client';
import { useI18n } from 'vue-i18n';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const status = ref<'loading' | 'success' | 'error'>('loading');
const errorMessage = ref('');

const goHome = () => {
  router.replace({ path: '/' });
};

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : '';
  if (!token) {
    status.value = 'error';
    errorMessage.value = t('mobile.emailVerify.error');
    return;
  }
  try {
    await verifyEmailToken(token);
    status.value = 'success';
  } catch (error) {
    console.error('Email verification failed', error);
    status.value = 'error';
  }
});
</script>

<style scoped>
.verify-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #f5f7fb;
}

.verify-card {
  width: min(420px, 100%);
  background: #fff;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.1);
  text-align: center;
}

.verify-title {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 600;
}

.verify-message {
  margin: 0 0 16px;
  color: #4b5563;
  font-size: 14px;
}

.verify-message--success {
  color: #15803d;
}

.verify-message--error {
  color: #b42318;
}

.primary-btn {
  width: 100%;
  border: none;
  border-radius: 12px;
  padding: 10px 12px;
  background: #1c7dfc;
  color: #fff;
  font-size: 14px;
}
</style>
