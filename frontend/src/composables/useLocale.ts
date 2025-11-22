import { computed } from 'vue';
import { i18n, messages } from '../i18n';

const STORAGE_KEY = 'app.locale';

const supportedLocales = Object.keys(messages);
const defaultLocale = i18n.global.locale.value || 'ja';

function detectBrowserLocale() {
  if (typeof navigator === 'undefined') return defaultLocale;
  const langs = navigator.languages || [navigator.language];
  for (const lang of langs) {
    const normalized = lang.toLowerCase();
    if (supportedLocales.includes(normalized)) return normalized;
    const short = normalized.split('-')[0];
    if (supportedLocales.includes(short)) return short;
  }
  return defaultLocale;
}

function loadLocale() {
  if (typeof localStorage === 'undefined') return defaultLocale;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && supportedLocales.includes(saved)) return saved;
  return detectBrowserLocale();
}

export function useLocale() {
  const current = computed(() => i18n.global.locale.value as string);

  const setLocale = (locale: string) => {
    if (!supportedLocales.includes(locale)) return;
    i18n.global.locale.value = locale;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, locale);
    }
  };

  if (!supportedLocales.includes(i18n.global.locale.value as string)) {
    setLocale(loadLocale());
  }

  return {
    currentLocale: current,
    supportedLocales,
    setLocale,
  };
}
