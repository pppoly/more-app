interface LocalizedField {
  original?: string;
  lang?: string;
  translations?: Record<string, string>;
  [key: string]: unknown;
}

export function getLocalizedText(
  field: LocalizedField | null | undefined,
  preferredLangs: string[] = ['ja', 'en'],
): string {
  if (!field) {
    return '';
  }

  const normalizedLangs = preferredLangs.map((lang) => lang.toLowerCase());
  const lang = typeof field.lang === 'string' ? field.lang.toLowerCase() : undefined;
  const translations: Record<string, string> = (field.translations as Record<string, string>) || {};

  if (lang && normalizedLangs.includes(lang) && typeof field.original === 'string') {
    return field.original;
  }

  for (const preferred of normalizedLangs) {
    const directMatch = field[preferred];
    if (typeof directMatch === 'string' && directMatch.trim().length > 0) {
      return directMatch;
    }

    if (typeof translations[preferred] === 'string' && translations[preferred].trim().length > 0) {
      return translations[preferred];
    }
  }

  if (typeof field.original === 'string') {
    return field.original;
  }

  const fallback = Object.values(field).find((value) => typeof value === 'string' && value.trim().length > 0);
  return typeof fallback === 'string' ? fallback : '';
}
