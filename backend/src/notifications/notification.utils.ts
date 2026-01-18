import { NotificationData, NotificationLocale } from './notification.types';

const JST_OFFSET_MINUTES = 9 * 60;
const JST_OFFSET_MS = JST_OFFSET_MINUTES * 60 * 1000;

export const normalizeLocale = (value?: string | null): NotificationLocale => {
  if (!value) return 'ja';
  const lower = value.toLowerCase();
  if (lower.startsWith('en')) return 'en';
  if (lower.startsWith('zh')) return 'zh';
  return 'ja';
};

export const renderTemplate = (template: string, data: NotificationData) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const raw = data[key];
    return raw === null || raw === undefined ? '' : String(raw);
  });

export const formatJstDateTime = (date: Date | string | null | undefined) => {
  if (!date) {
    return { date: '', time: '' };
  }
  const source = typeof date === 'string' ? new Date(date) : date;
  const local = new Date(source.getTime() + JST_OFFSET_MS);
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day = String(local.getUTCDate()).padStart(2, '0');
  const hour = String(local.getUTCHours()).padStart(2, '0');
  const minute = String(local.getUTCMinutes()).padStart(2, '0');
  return {
    date: `${month}/${day}`,
    time: `${hour}:${minute}`,
  };
};

export const getJstDateKey = (date: Date) => {
  const local = new Date(date.getTime() + JST_OFFSET_MS);
  const year = String(local.getUTCFullYear());
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day = String(local.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getJstDateRange = (date: Date) => {
  const local = new Date(date.getTime() + JST_OFFSET_MS);
  const startJstUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 0, 0, 0);
  const startUtc = new Date(startJstUtc - JST_OFFSET_MS);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc, dateKey: getJstDateKey(date) };
};

export const formatYen = (amount?: number | null) => {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '';
  return `¥${Number(amount).toLocaleString('ja-JP')}`;
};
