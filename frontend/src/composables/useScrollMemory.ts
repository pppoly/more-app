import { onActivated, onDeactivated, onMounted, Ref } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import { makeScrollKey, restoreScroll, saveScroll } from './useNavStack';

type Options = {
  /**
   * Override scroll key; defaults to current route.fullPath.
   */
  key?: string;
  /**
   * Optional target element ref. If omitted, falls back to `[data-scroll="main"]`,
   * then to window scroll.
   */
  target?: Ref<HTMLElement | null>;
};

const storageKey = (key: string) => `scroll:${key}`;

export function useScrollMemory(options: Options = {}) {
  const route = useRoute();

  const resolveKey = () => options.key ?? makeScrollKey({ fullPath: route.fullPath });

  const resolveTarget = () => {
    if (options.target?.value) return options.target.value;
    if (typeof document !== 'undefined') {
      const el = document.querySelector('[data-scroll="main"]') as HTMLElement | null;
      if (el && el.scrollHeight > el.clientHeight + 2) return el;
    }
    return null;
  };

  const saveWindowScroll = () => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(storageKey(resolveKey()), String(window.scrollY || 0));
  };

  const restoreWindowScroll = () => {
    if (typeof window === 'undefined') return;
    const saved = Number(sessionStorage.getItem(storageKey(resolveKey())) || 0);
    if (saved > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: saved, behavior: 'auto' });
      });
    }
  };

  const save = () => {
    const target = resolveTarget();
    if (target) {
      saveScroll({ fullPath: resolveKey() }, target);
    } else {
      saveWindowScroll();
    }
  };

  const restore = () => {
    const target = resolveTarget();
    if (target) {
      restoreScroll({ fullPath: resolveKey() }, target);
    } else {
      restoreWindowScroll();
    }
  };

  onMounted(restore);
  onActivated(restore);
  onDeactivated(save);
  onBeforeRouteLeave((_to, _from, next) => {
    save();
    next();
  });

  return { save, restore };
}
