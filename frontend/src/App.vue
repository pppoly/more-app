<template>
  <div class="app-shell">
    <header class="app-header">
      <h1>MORE App (モア アプリ)</h1>
      <nav>
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/events">Events</RouterLink>
        <RouterLink to="/console">Console</RouterLink>
      </nav>
    </header>
    <main>
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts"></script>

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

main {
  padding: 2rem;
}
</style>
