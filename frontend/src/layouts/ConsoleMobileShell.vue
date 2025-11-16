<template>
  <div class="w-screen h-screen flex flex-col bg-[#F7F9FB]">
    <header class="flex items-center justify-between px-4 py-3 bg-white shadow-sm">
      <div class="flex items-center gap-2">
        <button class="w-8 h-8 flex items-center justify-center" @click="goBack">
          <span class="i-lucide-chevron-left text-slate-600 text-lg"></span>
        </button>
        <div class="flex flex-col leading-tight">
          <span class="text-sm font-semibold">MORE Console</span>
          <span class="text-[11px] text-slate-400">
            {{ activeCommunityName || '社群を選択' }}
          </span>
        </div>
      </div>
      <button
        v-if="activeCommunityName"
        class="flex items-center gap-1 text-xs text-slate-700"
        @click="openCommunityPicker"
      >
        <span class="i-lucide-building-2 text-slate-500"></span>
        <span class="truncate max-w-[120px]">{{ activeCommunityName }}</span>
        <span class="i-lucide-chevron-down text-slate-500 text-[10px]"></span>
      </button>
    </header>

    <main class="flex-1 overflow-y-auto bg-[#F7F9FB]">
      <RouterView />
    </main>

    <nav class="h-14 bg-white border-t border-slate-200 flex">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="flex-1 flex flex-col items-center justify-center text-[11px]"
        :class="tab.key === activeTab ? 'text-[#00B900]' : 'text-slate-400'"
        @click="goTab(tab)"
      >
        <span :class="tab.icon" class="text-lg mb-0.5"></span>
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <CommunitySwitchSheet v-if="showCommunitySheet" @close="showCommunitySheet = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useConsoleCommunityStore } from '../stores/consoleCommunity';
import CommunitySwitchSheet from '../components/console/CommunitySwitchSheet.vue';

const router = useRouter();
const route = useRoute();
const store = useConsoleCommunityStore();

const showCommunitySheet = ref(false);

const activeCommunity = computed(() => {
  const id = store.activeCommunityId.value;
  return store.communities.value.find((community) => community.id === id) || null;
});

const activeCommunityName = computed(() => activeCommunity.value?.name ?? '');

const tabs = [
  { key: 'home', label: 'ホーム', icon: 'i-lucide-home', to: '/console' },
  {
    key: 'events',
    label: 'イベント',
    icon: 'i-lucide-calendar-search',
    to: '/console/communities/current/events',
  },
  {
    key: 'income',
    label: '収益',
    icon: 'i-lucide-piggy-bank',
    to: '/console/settings/payout',
  },
  {
    key: 'settings',
    label: '設定',
    icon: 'i-lucide-settings',
    to: '/console/subscription',
  },
];

const activeTab = computed(() => {
  const path = route.path;
  if (path.includes('/subscription')) return 'settings';
  if (path.includes('/settings')) return 'income';
  if (path.includes('/events')) return 'events';
  return 'home';
});

const goBack = () => {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push('/me');
  }
};

const openCommunityPicker = () => {
  showCommunitySheet.value = true;
};

const handleExternalPickerOpen = () => {
  showCommunitySheet.value = true;
};

onMounted(() => {
  window.addEventListener('console:open-community-picker', handleExternalPickerOpen);
});

onUnmounted(() => {
  window.removeEventListener('console:open-community-picker', handleExternalPickerOpen);
});

const goTab = (tab: (typeof tabs)[number]) => {
  if (tab.to.includes('/communities/current')) {
    const id = store.activeCommunityId.value;
    if (!id) return;
    router.push(`/console/communities/${id}/events`);
    return;
  }
  router.push(tab.to);
};
</script>
