<template>
  <div class="w-screen h-screen flex flex-col bg-[#F7F9FB]">
    <main class="flex-1 overflow-y-auto bg-[#F7F9FB]">
      <RouterView />
    </main>

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
</script>
