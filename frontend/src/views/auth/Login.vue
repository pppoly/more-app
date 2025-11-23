<template>
  <div class="login-page">
    <section class="login-card">
      <h2>测试环境快捷登录</h2>
      <p>输入任意用户名即可体验完整流程。</p>
      <label>
        显示名称
        <input v-model="devName" type="text" placeholder="例如：MORE Test User" />
      </label>
      <button type="button" class="primary" :disabled="loading" @click="handleDevLogin">
        {{ loading ? '登录中...' : '一键体验' }}
      </button>
      <p v-if="error" class="error">{{ error }}</p>
    </section>

    <div class="divider">
      <span>或</span>
    </div>

    <section class="login-card email-card">
      <h2>邮箱注册 / 登录</h2>
      <p>输入邮箱获取 6 位验证码，验证通过即可登录。</p>
      <label>
        邮箱地址
        <input v-model="email" type="email" placeholder="test@example.com" />
        <p v-if="emailError" class="error">{{ emailError }}</p>
      </label>
      <button
        type="button"
        class="primary"
        :disabled="emailSending"
        @click="handleSendEmailCode"
      >
        {{ emailSending ? '发送中...' : emailSent ? '重新发送' : '发送验证码' }}
      </button>
      <div v-if="emailSent" class="code-block">
        <label>
          验证码
          <input v-model="emailCode" type="text" placeholder="输入 6 位数字" />
        </label>
        <button
          type="button"
          class="secondary"
          :disabled="verifyingEmail"
          @click="handleVerifyEmailCode"
        >
          {{ verifyingEmail ? '验证中...' : '确认登录' }}
        </button>
      </div>
      <p v-if="emailStatusError" class="status">{{ emailStatusError }}</p>
      <p v-if="emailStatus" class="info">{{ emailStatus }}</p>
    </section>

    <section class="login-card line-card">
      <h2>使用 LINE 登录</h2>
      <p>推荐生产环境使用，完成 LINE 授权后自动登录。</p>
      <button type="button" class="line-button" @click="handleLineLogin">
        <span class="i-simple-icons-line"></span>
        LINE 登录
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { LOGIN_FLOW_STORAGE_KEY, LOGIN_REDIRECT_STORAGE_KEY } from '../../constants/auth';
import { sendEmailLoginCode, verifyEmailLoginCode } from '../../api/client';
import { needsProfileSetup } from '../../utils/profileSetup';
import { API_BASE_URL } from '../../config';

const auth = useAuth();
const route = useRoute();
const router = useRouter();
const devName = ref('');
const email = ref('');
const emailCode = ref('');
const emailSending = ref(false);
const verifyingEmail = ref(false);
const emailStatus = ref('');
const emailStatusError = ref('');
const emailError = ref('');
const emailSent = ref(false);
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
    error.value = '请输入显示名称';
    return;
  }
  error.value = '';
  loading.value = true;
  try {
    await auth.loginDev(devName.value.trim());
    await finishLoginFlow('dev');
  } catch (err) {
    error.value = err instanceof Error ? err.message : '登录失败';
  } finally {
    loading.value = false;
  }
};

const handleLineLogin = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOGIN_FLOW_STORAGE_KEY, 'line');
  window.localStorage.setItem(LOGIN_REDIRECT_STORAGE_KEY, redirectTarget.value || '/');
  const backendOrigin = API_BASE_URL.replace(/\/$/, '').replace(/\/api\/v1$/, '');
  window.location.href = `${backendOrigin}/api/v1/auth/line/redirect`;
};

const handleSendEmailCode = async () => {
  if (!email.value.trim()) {
    emailError.value = '请输入邮箱地址';
    return;
  }
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email.value.trim())) {
    emailError.value = '邮箱格式不正确';
    return;
  }
  emailError.value = '';
  emailStatus.value = '';
  emailStatusError.value = '';
  emailSending.value = true;
  try {
    await sendEmailLoginCode(email.value.trim());
    emailSent.value = true;
    emailStatus.value = `验证码已发送至 ${email.value.trim()}，请输入邮件中的 6 位数字。`;
    emailStatusError.value = '';
  } catch (err) {
    emailStatusError.value = err instanceof Error ? err.message : '发送验证码失败';
  } finally {
    emailSending.value = false;
  }
};

const handleVerifyEmailCode = async () => {
  if (!email.value.trim() || !emailCode.value.trim()) {
    emailStatusError.value = '请输入邮箱和验证码';
    return;
  }
  if (!/^\d{6}$/.test(emailCode.value.trim())) {
    emailStatusError.value = '请输入 6 位数字验证码';
    return;
  }
  verifyingEmail.value = true;
  emailStatus.value = '';
  emailStatusError.value = '';
  try {
    const result = await verifyEmailLoginCode(email.value.trim(), emailCode.value.trim());
    auth.setToken(result.accessToken);
    await auth.fetchCurrentUser();
    await finishLoginFlow('email');
  } catch (err) {
    emailStatusError.value = err instanceof Error ? err.message : '验证失败';
  } finally {
    verifyingEmail.value = false;
  }
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
