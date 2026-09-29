// Deletion periods on the organization page. A shorter period deletes at the next deletion run
// whatever is older, for good, so the page names each shortened period before it saves.

const periods = [
  { key: 'retentionLowRatingPhoneDays', column: 'retention_low_rating_phone_days', subject: 'Rückrufnummern' },
  { key: 'retentionFeedbackDays', column: 'retention_feedback_days', subject: 'Bewertungen samt Besuchen der Gästeseite' },
  { key: 'retentionNewsletterDays', column: 'retention_newsletter_days', subject: 'Newsletter-Anmeldungen' }
];

const days = (value) => (value === '' || value === null || value === undefined ? null : Number(value));

// The periods this save makes shorter. An empty field keeps data without end, so a first period
// counts as shorter as well.
export function shortenedPeriods(form, stored = {}) {
  return periods.flatMap(({ key, column, subject }) => {
    const next = days(form?.[key]);
    const before = days(stored?.[column]);
    if (next === null || !Number.isFinite(next)) return [];
    if (before !== null && next >= before) return [];
    return [{ subject, before, next }];
  });
}

// One sentence per shortened period, as the confirmation reads it.
export function shortenedSentence({ subject, before, next }) {
  const from = before === null ? 'bisher ohne Frist' : `bisher ${before} Tage`;
  return `${subject}: ${from}, neu ${next} ${next === 1 ? 'Tag' : 'Tage'}. Der nächste Löschlauf entfernt alle, die älter sind.`;
}
