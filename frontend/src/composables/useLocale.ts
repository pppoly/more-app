import { computed } from 'vue';
import { i18n, messages } from '../i18n';

const STORAGE_KEY = 'app.locale';

const supportedLocales = Object.keys(messages);
const defaultLocale = 'ja';

const buildPreferredLangs = (locale: string) => {
  const fallbacks = [defaultLocale, 'en', 'zh'];
  return Array.from(new Set([locale, ...fallbacks]));
};

function loadLocale() {
  if (typeof localStorage === 'undefined') return defaultLocale;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && supportedLocales.includes(saved)) return saved;
  return defaultLocale;
}

export function useLocale() {
  const current = computed(() => i18n.global.locale.value as string);
  const preferredLangs = computed(() => buildPreferredLangs(current.value));

  const setLocale = (locale: string) => {
    if (!supportedLocales.includes(locale)) return;
    i18n.global.locale.value = locale;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, locale);
    }
  };

  // Enforce default locale when none is set.
  if (!supportedLocales.includes(i18n.global.locale.value as string)) {
    setLocale(loadLocale());
  }

  return {
    currentLocale: current,
    supportedLocales,
    setLocale,
    preferredLangs,
  };
}

export { buildPreferredLangs };
