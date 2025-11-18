<template>
  <div class="mobile-settings m-page">
    <section class="settings-section">
      <h2 class="m-section-title">一般設定</h2>
      <div class="settings-list">
        <button class="settings-item" @click="openLanguage">
          <div>
            <p class="settings-item__label">言語設定 / Language</p>
            <p class="settings-item__meta">表示言語を切り替える</p>
          </div>
          <span class="i-lucide-chevron-right"></span>
        </button>
        <button class="settings-item" @click="openNotification">
          <div>
            <p class="settings-item__label">通知・アプリ設定</p>
            <p class="settings-item__meta">アプリ権限と環境設定</p>
          </div>
          <span class="i-lucide-chevron-right"></span>
        </button>
      </div>
    </section>

    <section class="settings-section" v-if="isLoggedIn">
      <h2 class="m-section-title">アカウント</h2>
      <div class="settings-list">
        <button class="settings-item settings-item--danger" @click="logoutUser">
          <div>
            <p class="settings-item__label">ログアウト</p>
            <p class="settings-item__meta">Sign out</p>
          </div>
          <span class="i-lucide-log-out"></span>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';

const router = useRouter();
const { logout, user } = useAuth();

const isLoggedIn = computed(() => Boolean(user.value));

const openLanguage = () => {
  router.push({ path: '/settings/language' });
};

const openNotification = () => {
  router.push({ path: '/settings/app' });
};

const logoutUser = () => {
  logout();
  router.replace({ path: '/' });
};
</script>

<style scoped>
.mobile-settings {
  min-height: 100vh;
  padding: 1.25rem 1.25rem 5rem;
  background: var(--m-color-bg, #f7f7fb);
}

.settings-section + .settings-section {
  margin-top: 1.5rem;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.settings-item {
  width: 100%;
  border: none;
  border-radius: 18px;
  padding: 1rem;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
}

.settings-item--danger {
  background: #fff5f5;
  color: #b91c1c;
}

.settings-item__label {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--m-color-text-primary, #111);
}

.settings-item__meta {
  margin: 0.15rem 0 0;
  font-size: 0.75rem;
  color: var(--m-color-text-tertiary, #666);
}
</style>
