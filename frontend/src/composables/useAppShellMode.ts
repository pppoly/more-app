import { computed, onMounted, ref, watch } from 'vue';
import { isLiffClient } from '../utils/device';
import { isLiffReady } from '../utils/liff';

function hasWindow() {
  return typeof window !== 'undefined';
}

export function useAppShellMode() {
  const isLiffClientMode = ref(false);
  const forceBrandBar = ref(false);
  const debugParam = ref(false);

  const refresh = () => {
    try {
      isLiffClientMode.value = isLiffClient();
    } catch {
      isLiffClientMode.value = false;
    }
    if (hasWindow()) {
      const params = new URLSearchParams(window.location.search);
      const force = params.get('forceBrandBar');
      forceBrandBar.value = force === '1' || force === 'true';
      const dbg = params.get('debug');
      debugParam.value = dbg === '1' || dbg === 'true';
    }
  };

  onMounted(() => {
    refresh();
  });

  watch(
    () => isLiffReady.value,
    () => {
      refresh();
    },
  );

  const showBrandBar = computed(() => isLiffClientMode.value || forceBrandBar.value);
  const showBrandDebug = computed(() => forceBrandBar.value || debugParam.value || import.meta.env.DEV);
  const brandDebugText = computed(() => `liffClient=${isLiffClientMode.value}`);

  return {
    isLiffClientMode: computed(() => isLiffClientMode.value),
    forceBrandBar: computed(() => forceBrandBar.value),
    showBrandBar,
    showBrandDebug,
    brandDebugText,
    debugParam: computed(() => debugParam.value),
  };
}
