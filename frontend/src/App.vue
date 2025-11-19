<template>
  <div class="app-shell" :class="{ 'app-shell--mobile': isMobile }">
    <div v-if="showDevPageName" class="dev-page-overlay">
      {{ currentPageName }}
    </div>
    <template v-if="isMobile">
      <RouterView v-slot="{ Component }">
        <MobileShell>
          <component :is="Component" />
        </MobileShell>
      </RouterView>
    </template>
    <template v-else>
      <header class="app-header">
        <div class="brand">
          <h1>MORE App (モア アプリ)</h1>
          <nav>
            <RouterLink to="/">Home</RouterLink>
            <RouterLink to="/events">Events</RouterLink>
            <RouterLink
              v-if="user?.isOrganizer"
              :to="{ name: 'console-communities' }"
            >
              Console
            </RouterLink>
            <RouterLink v-else-if="user" to="/organizer/apply">主理人申請</RouterLink>
            <RouterLink v-if="user?.isAdmin" to="/admin">Admin</RouterLink>
            <RouterLink v-if="user" to="/me/events">My Events</RouterLink>
          </nav>
        </div>
        <div class="auth-panel">
          <span v-if="initializing">Checking session...</span>
          <template v-else>
            <div v-if="user" class="logged-in">
              <span>ようこそ, {{ user.name }}</span>
              <RouterLink
                v-if="!user.isOrganizer"
                class="apply-link"
                to="/organizer/apply"
              >
                主理人申請
              </RouterLink>
              <button type="button" @click="logout">Logout</button>
            </div>
            <div v-else class="login-buttons">
              <button type="button" @click="goToLogin">Login / Register</button>
            </div>
          </template>
        </div>
      </header>
      <main class="desktop-main">
        <RouterView />
      </main>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileShell from './layouts/MobileShell.vue';
import { useAuth } from './composables/useAuth';

const { user, initializing, logout } = useAuth();
const isMobile = ref(false);
const mediaQuery =
  typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)') : null;
const router = useRouter();
const currentRoute = useRoute();
const showDevPageName = computed(() => import.meta.env.DEV);
const currentPageName = computed(() => {
  const metaName = currentRoute.meta?.devPageName as string | undefined;
  if (metaName) return metaName;
  const metaTitle = currentRoute.meta?.title as string | undefined;
  if (metaTitle) return metaTitle;
  if (typeof currentRoute.name === 'string') return currentRoute.name;
  return '未命名页面';
});

if (mediaQuery) {
  isMobile.value = mediaQuery.matches;
}

const handleViewportChange = () => {
  if (!mediaQuery) return;
  isMobile.value = mediaQuery.matches;
};

onMounted(() => {
  handleViewportChange();
  mediaQuery?.addEventListener('change', handleViewportChange);
});

onUnmounted(() => {
  mediaQuery?.removeEventListener('change', handleViewportChange);
});

const goToLogin = () => {
  const redirect = currentRoute.fullPath || '/';
  router.push({ name: 'auth-login', query: { redirect } });
};
</script>

<style scoped>
.app-shell {
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #1f2933;
  min-height: 100vh;
  background: #f6f8fb;
}

.dev-page-overlay {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.85);
  color: #fff;
  font-size: 13px;
  letter-spacing: 0.05em;
  z-index: 9999;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.35);
  pointer-events: none;
}

.app-header {
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 1rem 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.app-header h1 {
  margin: 0;
  font-size: 1.4rem;
}

nav {
  display: flex;
  gap: 1rem;
}

nav a {
  text-decoration: none;
  color: #2f5bea;
  font-weight: 600;
}

.auth-panel {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.logged-in {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.auth-panel button {
  border: none;
  background: #2563eb;
  color: #fff;
  padding: 0.4rem 0.9rem;
  border-radius: var(--app-border-radius);
  cursor: pointer;
}
.apply-link {
  text-decoration: none;
  color: #2563eb;
  font-weight: 600;
}

.desktop-main {
  padding: 2rem;
}

.app-shell--mobile {
  min-height: 100vh;
  background: #020617;
}
</style>
