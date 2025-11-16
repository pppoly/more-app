<template>
  <div class="w-screen h-screen flex flex-col bg-[#F7F9FB]">
    <header class="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-4">
      <div class="w-9 h-9 rounded-full bg-[#00B900] text-white font-semibold flex items-center justify-center">
        M
      </div>
      <div class="text-base font-semibold text-center flex-1 truncate">{{ currentTitle }}</div>
      <button class="text-[#00B900] font-medium text-sm border border-[#00B900] rounded-full px-3 py-1">
        ログイン
      </button>
    </header>
    <main class="flex-1 overflow-y-auto">
      <RouterView />
    </main>
    <nav class="h-14 flex bg-white border-t border-slate-200">
      <button
        v-for="tab in tabs"
        :key="tab.path"
        class="flex-1 flex flex-col items-center justify-center text-xs"
        :class="activeTab === tab.id ? 'text-[#00B900]' : 'text-slate-400'"
        @click="go(tab.path)"
      >
        <span class="text-base">{{ tab.icon }}</span>
        <span>{{ tab.label }}</span>
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const tabs = [
  { id: 'home', label: 'ホーム', path: '/', icon: '🏠' },
  { id: 'events', label: 'イベント', path: '/events', icon: '📅' },
  { id: 'communities', label: 'コミュニティ', path: '/communities', icon: '👥' },
  { id: 'me', label: 'マイページ', path: '/me', icon: '😊' },
];

const titleMap: Record<string, string> = {
  '/': 'ホーム',
  '/events': 'イベント',
  '/communities': 'コミュニティ',
  '/me': 'マイページ',
};

const currentTitle = computed(() => {
  const metaTitle = route.meta?.title as string | undefined;
  if (metaTitle) return metaTitle;
  const path = route.path;
  const base = Object.keys(titleMap).find((key) => path === key || path.startsWith(key + '/'));
  return base ? titleMap[base] : 'ホーム';
});

const activeTab = computed(() => {
  const path = route.path;
  if (path.startsWith('/events')) return 'events';
  if (path.startsWith('/communities')) return 'communities';
  if (path.startsWith('/me')) return 'me';
  return 'home';
});

const go = (path: string) => {
  if (route.path === path) return;
  router.push(path);
};
</script>
