<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        <h1>MORE App (モア アプリ)</h1>
        <nav>
          <RouterLink to="/">Home</RouterLink>
          <RouterLink to="/events">Events</RouterLink>
          <RouterLink v-if="user?.isOrganizer" to="/console/communities">Console</RouterLink>
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
            <button type="button" @click="handleDevLogin">Dev Login</button>
            <button type="button" @click="handleLineLogin">LINE Login</button>
          </div>
        </template>
      </div>
    </header>
    <main>
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from './composables/useAuth';

const { user, initializing, loginDev, logout } = useAuth();

const handleDevLogin = async () => {
  const name = window.prompt('Enter a display name for dev login', 'MORE Test User');
  if (!name) {
    return;
  }
  await loginDev(name);
};

const handleLineLogin = () => {
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
  const backendOrigin = base.replace(/\/$/, '').replace(/\/api\/v1$/, '');
  window.location.href = `${backendOrigin}/api/v1/auth/line/redirect`;
};
</script>

<style scoped>
.app-shell {
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #1f2933;
  min-height: 100vh;
  background: #f6f8fb;
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
  border-radius: 0.5rem;
  cursor: pointer;
}
.apply-link {
  text-decoration: none;
  color: #2563eb;
  font-weight: 600;
}

main {
  padding: 2rem;
}
</style>
