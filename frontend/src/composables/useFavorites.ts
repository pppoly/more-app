import { computed, ref } from 'vue';

export interface FavoriteEvent {
  id: string;
  title: string;
  coverUrl: string;
  timeText?: string;
  locationText?: string;
}

const STORAGE_KEY = 'moreapp_favorites';

function hasWindow() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

const favorites = ref<FavoriteEvent[]>([]);
let loaded = false;

const loadFavorites = () => {
  if (loaded || !hasWindow()) return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    favorites.value = raw ? (JSON.parse(raw) as FavoriteEvent[]) : [];
  } catch (error) {
    console.warn('Failed to load favorites', error);
    favorites.value = [];
  }
};

const persistFavorites = () => {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites.value));
  } catch (error) {
    console.warn('Failed to save favorites', error);
  }
};

const isFavorite = (id?: string | null) => {
  if (!id) return false;
  return favorites.value.some((fav) => fav.id === id);
};

const addFavorite = (payload: FavoriteEvent) => {
  if (!payload.id) return;
  const existingIndex = favorites.value.findIndex((fav) => fav.id === payload.id);
  if (existingIndex >= 0) {
    favorites.value[existingIndex] = payload;
  } else {
    favorites.value.unshift(payload);
  }
  persistFavorites();
};

const removeFavorite = (id: string) => {
  favorites.value = favorites.value.filter((fav) => fav.id !== id);
  persistFavorites();
};

const toggleFavorite = (payload: FavoriteEvent) => {
  if (isFavorite(payload.id)) {
    removeFavorite(payload.id);
  } else {
    addFavorite(payload);
  }
};

export function useFavorites() {
  loadFavorites();

  const favoriteCount = computed(() => favorites.value.length);

  return {
    favorites,
    favoriteCount,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
  };
}
