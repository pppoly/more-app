import { computed, reactive } from 'vue';
import { fetchManagedCommunities } from '../api/client';
import type { ManagedCommunity } from '../types/api';

const ACTIVE_KEY = 'more_console_active_community_id';

interface ConsoleCommunityState {
  communities: ManagedCommunity[];
  activeCommunityId: string | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  activeCommunityVersion: number;
}

const state = reactive<ConsoleCommunityState>({
  communities: [],
  activeCommunityId: null,
  loading: false,
  loaded: false,
  error: null,
  activeCommunityVersion: 0,
});

let loadPromise: Promise<void> | null = null;

function hasWindow() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function persistActive(id: string | null) {
  if (!hasWindow()) return;
  if (id) {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } else {
    window.localStorage.removeItem(ACTIVE_KEY);
  }
}

async function loadCommunities(force = false) {
  if (state.loading && loadPromise) {
    return loadPromise;
  }
  if (state.loaded && !force) {
    return;
  }
  state.loading = true;
  state.error = null;
  loadPromise = (async () => {
    try {
      const data = await fetchManagedCommunities();
      state.communities = data;
      state.loaded = true;
      if (hasWindow()) {
        const stored = window.localStorage.getItem(ACTIVE_KEY);
        if (stored && data.some((community) => community.id === stored)) {
          state.activeCommunityId = stored;
        } else {
          state.activeCommunityId = null;
          persistActive(null);
        }
      } else {
        state.activeCommunityId = null;
      }
      ensureActiveCommunity();
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'コミュニティの取得に失敗しました';
      state.communities = [];
      state.activeCommunityId = null;
      state.loaded = false;
      persistActive(null);
    } finally {
      state.loading = false;
      loadPromise = null;
    }
  })();
  return loadPromise;
}

function bumpActiveCommunityVersion() {
  state.activeCommunityVersion += 1;
}

function setActiveCommunity(id: string | null) {
  if (id && !state.communities.some((community) => community.id === id)) {
    return;
  }
  const changed = state.activeCommunityId !== id;
  state.activeCommunityId = id;
  persistActive(id);
  if (changed) {
    bumpActiveCommunityVersion();
  }
}

function refreshActiveCommunity() {
  bumpActiveCommunityVersion();
}

function ensureActiveCommunity() {
  if (!state.communities.length) {
    setActiveCommunity(null);
    return;
  }
  if (!state.activeCommunityId || !state.communities.some((community) => community.id === state.activeCommunityId)) {
    setActiveCommunity(state.communities[0].id);
  }
}

function hasCommunity(id: string) {
  return state.communities.some((community) => community.id === id);
}

function getActiveCommunity() {
  return state.communities.find((community) => community.id === state.activeCommunityId) || null;
}

export function useConsoleCommunityStore() {
  return {
    communities: computed(() => state.communities),
    activeCommunityId: computed({
      get: () => state.activeCommunityId,
      set: (val) => setActiveCommunity(val),
    }),
    activeCommunityVersion: computed(() => state.activeCommunityVersion),
    loading: computed(() => state.loading),
    loaded: computed(() => state.loaded),
    error: computed(() => state.error),
    loadCommunities,
    setActiveCommunity,
    ensureActiveCommunity,
    hasCommunity,
    getActiveCommunity,
    refreshActiveCommunity,
  };
}
