const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JP_PHONE_REGEX = /(?:\+?81[-\s]?|0)\d{1,4}[-\s]?\d{1,4}[-\s]?\d{4}/g;
const CN_PHONE_REGEX = /(?:\+?86[-\s]?)?1[3-9]\d{9}/g;
const NAME_LABEL_REGEX = /(名前|氏名|name|姓名)\s*[:：]\s*([^\s]+)/gi;

const redactNameLabels = (text: string) =>
  text.replace(NAME_LABEL_REGEX, (_match, label) => `${label}: ***`);

export const redactText = (text?: string | null): string => {
  if (!text) return '';
  let redacted = text;
  redacted = redactNameLabels(redacted);
  redacted = redacted.replace(EMAIL_REGEX, '***@***');
  redacted = redacted.replace(JP_PHONE_REGEX, '***');
  redacted = redacted.replace(CN_PHONE_REGEX, '***');
  return redacted;
};
