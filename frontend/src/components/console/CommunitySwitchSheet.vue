<template>
  <div class="fixed inset-0 bg-black/40 flex items-end z-50" @click.self="$emit('close')">
    <div class="w-full bg-white rounded-t-2xl p-4 max-h-[72vh] overflow-hidden">
      <div class="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-3"></div>
      <div class="flex items-center justify-between gap-3 mb-3">
        <p class="text-sm font-semibold text-slate-800">コミュニティを切り替える</p>
        <button type="button" class="text-slate-500 text-sm" @click="$emit('close')">閉じる</button>
      </div>

      <div class="mb-3">
        <input
          v-model="keyword"
          type="text"
          class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
          placeholder="コミュニティ名で検索"
        />
      </div>

      <div v-if="loading" class="text-sm text-center text-slate-500 py-6">読み込み中…</div>
      <div v-else-if="error" class="text-sm text-slate-600 py-4">
        <p class="mb-2">{{ error }}</p>
        <button type="button" class="w-full py-2 rounded-full border border-slate-200 text-sm" @click="reload">
          再試行
        </button>
      </div>
      <div v-else class="overflow-y-auto max-h-[52vh] -mx-1 px-1">
        <button
          v-for="community in filteredCommunities"
          :key="community.id"
          type="button"
          class="w-full flex items-center gap-3 p-3 rounded-xl border text-left mb-2"
          :class="community.id === activeCommunityId ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'"
          @click="selectCommunity(community.id)"
        >
          <div class="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
            <img
              v-if="communityImage(community)"
              :src="communityImage(community)!"
              alt=""
              class="w-full h-full object-cover"
              loading="lazy"
            />
            <span v-else class="text-slate-400 text-xs">C</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-slate-900 truncate">{{ community.name }}</p>
            <p class="text-xs text-slate-500 truncate">/{{ community.slug }}</p>
          </div>
          <span
            v-if="community.id === activeCommunityId"
            class="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full"
          >
            現在
          </span>
        </button>
        <p v-if="!filteredCommunities.length" class="text-sm text-center text-slate-500 py-6">該当するコミュニティがありません</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ManagedCommunity } from '../../types/api';
import { useConsoleCommunityStore } from '../../stores/consoleCommunity';
import { resolveAssetUrl } from '../../utils/assetUrl';

const emit = defineEmits<{ (e: 'close'): void }>();
const store = useConsoleCommunityStore();
const keyword = ref('');

const loading = computed(() => store.loading.value);
const error = computed(() => store.error.value);
const communities = computed(() => store.communities.value);
const activeCommunityId = computed(() => store.activeCommunityId.value);

const normalizeText = (value: string) => value.trim().toLowerCase();
const filteredCommunities = computed(() => {
  const q = normalizeText(keyword.value);
  if (!q) return communities.value;
  return communities.value.filter((community) => normalizeText(community.name).includes(q) || normalizeText(community.slug).includes(q));
});

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value) || /^data:/i.test(value);

const communityImage = (community: ManagedCommunity) => {
  const raw = (community.logoImageUrl || community.coverImageUrl || '').trim();
  if (!raw) return null;
  if (isAbsoluteUrl(raw)) return raw;
  return resolveAssetUrl(raw);
};

const reload = () => store.loadCommunities(true);

const selectCommunity = (id: string) => {
  store.setActiveCommunity(id);
  emit('close');
};

onMounted(() => {
  void store.loadCommunities();
});
</script>
