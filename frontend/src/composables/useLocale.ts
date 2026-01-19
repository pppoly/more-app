import { computed } from 'vue';
import { i18n, messages, type AppLocales } from '../i18n';

const STORAGE_KEY = 'app.locale';

const BLOCKED_LOCALES = new Set<AppLocales>(['zh', 'zh-tw']);
const supportedLocales = (Object.keys(messages) as AppLocales[]).filter((locale) => !BLOCKED_LOCALES.has(locale));
const defaultLocale: AppLocales = 'ja';

const isSupportedLocale = (locale: string): locale is AppLocales => supportedLocales.includes(locale as AppLocales);

const buildPreferredLangs = (locale: string) => {
  const fallbacks = [defaultLocale, 'en'];
  return Array.from(
    new Set([locale, ...fallbacks].filter((lang) => !BLOCKED_LOCALES.has(lang as AppLocales))),
  );
};

function loadLocale(): AppLocales {
  if (typeof localStorage === 'undefined') return defaultLocale;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && isSupportedLocale(saved)) return saved;
  return defaultLocale;
}

export function useLocale() {
  const current = computed(() => i18n.global.locale.value as AppLocales);
  const preferredLangs = computed(() => buildPreferredLangs(current.value));

  const setLocale = (locale: string) => {
    if (!isSupportedLocale(locale)) return;
    i18n.global.locale.value = locale;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, locale);
    }
  };

  // Enforce default locale when none is set.
  if (!isSupportedLocale(i18n.global.locale.value)) {
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
