<template>
  <div class="space-y-3">
    <label class="text-xs font-semibold text-slate-600 block">Google マップで場所を検索</label>
    <div class="flex gap-2">
      <input
        ref="inputRef"
        v-model="localAddress"
        type="text"
        class="flex-1 px-3 py-2 rounded-full border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#00B900]/40 focus:border-[#00B900]"
        placeholder="例：代々木公園、東京都渋谷区..."
      />
      <button type="button" class="px-3 py-2 text-xs text-slate-500" @click="clearLocation">クリア</button>
    </div>
    <div class="text-[11px] text-slate-500 flex flex-wrap gap-3">
      <span>緯度: {{ props.lat ?? '未設定' }}</span>
      <span>経度: {{ props.lng ?? '未設定' }}</span>
    </div>
    <div class="rounded-2xl border border-slate-200 overflow-hidden h-48 relative">
      <div v-if="!mapReady" class="absolute inset-0 flex items-center justify-center text-[11px] text-slate-500 px-4 text-center">
        {{ mapStatus }}
      </div>
      <div ref="mapRef" class="w-full h-full"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

declare global {
  interface Window {
    google: any;
  }
}

const props = defineProps<{
  address: string;
  lat: number | null;
  lng: number | null;
}>();
const emit = defineEmits<{
  (e: 'update:address', value: string): void;
  (e: 'update:lat', value: number | null): void;
  (e: 'update:lng', value: number | null): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const mapRef = ref<HTMLDivElement | null>(null);
const mapInstance = ref<any>(null);
const marker = ref<any>(null);
const autocomplete = ref<any>(null);
const localAddress = ref(props.address || '');
const mapReady = ref(false);
const mapStatus = ref('Google マップを読み込み中...');

const defaultCenter = computed(() => ({
  lat: props.lat ?? 35.681236,
  lng: props.lng ?? 139.767125,
}));

let googleMapsPromise: Promise<void> | null = null;

const loadGoogleMaps = () => {
  if (window.google && window.google.maps) {
    return Promise.resolve();
  }
  if (googleMapsPromise) return googleMapsPromise;
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    mapStatus.value = '環境変数 VITE_GOOGLE_MAPS_API_KEY を設定すると地図を表示できます。';
    return Promise.reject(new Error('地図を読み込めませんでした。時間をおいて再試行するか管理者に連絡してください。')); 
  }
  googleMapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (err) => {
      mapStatus.value = 'Google マップを読み込めませんでした。';
      reject(err);
    };
    document.head.appendChild(script);
  });
  return googleMapsPromise;
};

const initAutocomplete = () => {
  if (!inputRef.value || !window.google?.maps?.places) return;
  autocomplete.value = new window.google.maps.places.Autocomplete(inputRef.value, {
    fields: ['formatted_address', 'geometry'],
  });
  autocomplete.value.addListener('place_changed', () => {
    const place = autocomplete.value.getPlace();
    if (place.formatted_address) {
      localAddress.value = place.formatted_address;
    }
    const location = place.geometry?.location;
    if (location) {
      emit('update:lat', location.lat());
      emit('update:lng', location.lng());
      updateMap(location.lat(), location.lng());
    }
  });
};

const initMap = () => {
  if (!mapRef.value || !window.google?.maps) return;
  mapInstance.value = new window.google.maps.Map(mapRef.value, {
    center: defaultCenter.value,
    zoom: 14,
    disableDefaultUI: true,
  });
  marker.value = new window.google.maps.Marker({
    map: mapInstance.value,
    position: defaultCenter.value,
  });
  mapReady.value = true;
  mapStatus.value = '';
};

const updateMap = (lat?: number | null, lng?: number | null) => {
  if (!mapInstance.value || !marker.value) return;
  if (typeof lat === 'number' && typeof lng === 'number') {
    const position = { lat, lng };
    marker.value.setPosition(position);
    mapInstance.value.setCenter(position);
  }
};

const clearLocation = () => {
  localAddress.value = '';
  emit('update:address', '');
  emit('update:lat', null);
  emit('update:lng', null);
  updateMap(defaultCenter.value.lat, defaultCenter.value.lng);
};

watch(
  () => props.address,
  (val) => {
    if (val !== localAddress.value) {
      localAddress.value = val || '';
    }
  },
);

watch(localAddress, (val) => {
  emit('update:address', val);
});

watch(
  () => [props.lat, props.lng],
  ([lat, lng]) => {
    if (typeof lat === 'number' && typeof lng === 'number') {
      updateMap(lat, lng);
    }
  },
);

onMounted(async () => {
  try {
    await loadGoogleMaps();
    await nextTick();
    initAutocomplete();
    initMap();
    if (typeof props.lat === 'number' && typeof props.lng === 'number') {
      updateMap(props.lat, props.lng);
    }
  } catch (error) {
    console.warn('Google Maps failed to load', error);
  }
});

onUnmounted(() => {
  autocomplete.value = null;
  mapInstance.value = null;
  marker.value = null;
});
</script>
