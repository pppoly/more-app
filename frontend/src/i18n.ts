import { createI18n } from 'vue-i18n';
import ja from './locales/ja.json';
import en from './locales/en.json';
import zh from './locales/zh.json';
import vi from './locales/vi.json';
import ko from './locales/ko.json';
import tl from './locales/tl.json';
import ptbr from './locales/pt-br.json';
import ne from './locales/ne.json';
import id from './locales/id.json';
import th from './locales/th.json';
import zhtw from './locales/zh-tw.json';
import my from './locales/my.json';

const defaultLocale = 'ja';

export const messages = {
  ja,
  en,
  zh,
  vi,
  ko,
  tl,
  'pt-br': ptbr,
  ne,
  id,
  th,
  'zh-tw': zhtw,
  my,
};

export const i18n = createI18n({
  legacy: false,
  locale: defaultLocale,
  fallbackLocale: defaultLocale,
  messages,
});

export type AppLocales = keyof typeof messages;
