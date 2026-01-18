import { computed, ref, watch } from 'vue';
import { fetchMyFavoriteEvents, followEvent, unfollowEvent } from '../api/client';
import type { FavoriteEventItem } from '../types/api';
import { resolveAssetUrl } from '../utils/assetUrl';
import { getLocalizedText } from '../utils/i18nContent';
import { useAuth } from './useAuth';

export interface FavoriteEvent {
  id: string;
  title: string;
  coverUrl: string;
  timeText?: string;
  locationText?: string;
}

const favorites = ref<FavoriteEvent[]>([]);
let loaded = false;
let loading = false;
let initialized = false;

const formatTime = (value?: string | null) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
};

const formatLongDate = (value?: string | null) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
};

const formatDayWithWeekday = (value?: string | null) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ja-JP', { day: 'numeric', weekday: 'short' });
};

const formatScheduleLine = (start?: string | null, end?: string | null) => {
  if (!start) return '';
  const startDate = new Date(start);
  const startText = `${formatLongDate(start)} ${formatTime(start)}`;
  if (!end) return startText;
  const endDate = new Date(end);
  const sameDay = startDate.toDateString() === endDate.toDateString();
  if (sameDay) {
    return `${formatLongDate(start)} ${formatTime(start)}〜${formatTime(end)}`;
  }
  const sameMonth =
    startDate.getFullYear() === endDate.getFullYear() && startDate.getMonth() === endDate.getMonth();
  const endDateText = sameMonth ? formatDayWithWeekday(end) : formatLongDate(end);
  return `${formatLongDate(start)} ${formatTime(start)}〜${endDateText} ${formatTime(end)}`;
};

const isFavorite = (id?: string | null) => {
  if (!id) return false;
  return favorites.value.some((fav) => fav.id === id);
};

const removeFavorite = (id: string) => {
  favorites.value = favorites.value.filter((fav) => fav.id !== id);
};

const buildFavoritePayload = (item: FavoriteEventItem, preferredLangs: string[]) => ({
  id: item.id,
  title: getLocalizedText(item.title, preferredLangs) || 'イベント',
  coverUrl: resolveAssetUrl(item.coverImageUrl ?? ''),
  timeText: formatScheduleLine(item.startTime ?? null, item.endTime ?? null),
  locationText: item.locationText ?? '',
});

const upsertFavorite = (payload: FavoriteEvent) => {
  if (!payload.id) return;
  const existingIndex = favorites.value.findIndex((fav) => fav.id === payload.id);
  if (existingIndex >= 0) {
    favorites.value[existingIndex] = payload;
  } else {
    favorites.value.unshift(payload);
  }
};

export function useFavorites() {
  const { accessToken, user } = useAuth();
  const preferredLangs = computed(() => {
    const langs = [user.value?.preferredLocale, 'ja', 'en'].filter(Boolean) as string[];
    return Array.from(new Set(langs));
  });

  const loadFavorites = async () => {
    if (loading) return;
    loading = true;
    try {
      if (!accessToken.value) {
        favorites.value = [];
        loaded = true;
        return;
      }
      const items = await fetchMyFavoriteEvents();
      favorites.value = items.map((item) => buildFavoritePayload(item, preferredLangs.value));
      loaded = true;
    } catch (error) {
      console.warn('Failed to load favorites', error);
      favorites.value = [];
    } finally {
      loading = false;
    }
  };

  if (!initialized) {
    initialized = true;
    watch(
      accessToken,
      () => {
        loaded = false;
        void loadFavorites();
      },
      { immediate: true },
    );
  } else if (!loaded && !loading) {
    void loadFavorites();
  }

  const favoriteCount = computed(() => favorites.value.length);

  const ensureLoaded = () => {
    if (!loaded && !loading) {
      void loadFavorites();
    }
  };

  const ensureAuth = () => {
    if (!accessToken.value) {
      throw new Error('ログインが必要です。');
    }
  };

  const addFavoriteAsync = async (payload: FavoriteEvent) => {
    ensureAuth();
    await followEvent(payload.id);
    upsertFavorite(payload);
    return { following: true };
  };

  const removeFavoriteAsync = async (id: string) => {
    ensureAuth();
    await unfollowEvent(id);
    removeFavorite(id);
    return { following: false };
  };

  const toggleFavorite = async (payload: FavoriteEvent) => {
    ensureLoaded();
    if (isFavorite(payload.id)) {
      return removeFavoriteAsync(payload.id);
    }
    return addFavoriteAsync(payload);
  };

  return {
    favorites,
    favoriteCount,
    isFavorite: (id?: string | null) => {
      ensureLoaded();
      return isFavorite(id);
    },
    addFavorite: addFavoriteAsync,
    removeFavorite: removeFavoriteAsync,
    toggleFavorite,
    reloadFavorites: loadFavorites,
  };
}
