// Pretix answers with translated fields: {"de": "Zum Festplatz 32", "en": "..."}.
// Everything that reaches a guest, a sheet or a report goes through here first,
// so nobody ever reads a piece of JSON.
export function plainText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return fromTranslations(value, fallback);
  const text = String(value).trim();
  if (!text) return fallback;
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') return fromTranslations(parsed, fallback);
    } catch {
      return text;
    }
  }
  return text;
}

function fromTranslations(value, fallback) {
  const translations = Object.entries(value)
    .filter(([, text]) => typeof text === 'string' && text.trim())
    .map(([language, text]) => [language, text.trim()]);
  if (!translations.length) return fallback;
  const byLanguage = new Map(translations);
  return byLanguage.get('de') || byLanguage.get('de-informal') || byLanguage.get('en') || translations[0][1];
}
