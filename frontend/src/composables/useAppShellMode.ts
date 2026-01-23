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
  const uaLine = ref(false);
  const isLiffEntry = ref(false);

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
      const ua = window.navigator.userAgent.toLowerCase();
      uaLine.value = ua.includes(' line');
      const hasLiffState = params.has('liff.state');
      const hasLiffReferrer = params.has('liff.referrer');
      const fromEntrySource = params.get('entrySource');
      const from = params.get('from');
      const src = params.get('src');
      const refLiff =
        Boolean(document.referrer) &&
        (document.referrer.includes('liff.line.me') || document.referrer.includes('miniapp.line.me'));
      isLiffEntry.value =
        hasLiffState ||
        hasLiffReferrer ||
        refLiff ||
        fromEntrySource?.toLowerCase() === 'liff' ||
        from?.toLowerCase() === 'liff' ||
        src?.toLowerCase() === 'liff';
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

  const showBrandBar = computed(() => isLiffEntry.value || uaLine.value || forceBrandBar.value);
  const showBrandDebug = computed(() => debugParam.value && !isLiffClientMode.value);
  const brandDebugText = computed(
    () => `liffEntry=${isLiffEntry.value} uaLine=${uaLine.value} inClient=${isLiffClientMode.value}`,
  );

  return {
    isLiffClientMode: computed(() => isLiffClientMode.value),
    uaLine: computed(() => uaLine.value),
    forceBrandBar: computed(() => forceBrandBar.value),
    isLiffEntry: computed(() => isLiffEntry.value),
    showBrandBar,
    showBrandDebug,
    brandDebugText,
    debugParam: computed(() => debugParam.value),
  };
}
