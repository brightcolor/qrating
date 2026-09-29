import { describe, expect, it } from 'vitest';
import { shortenedPeriods, shortenedSentence } from './retention.js';

const stored = { retention_low_rating_phone_days: 90, retention_feedback_days: 180, retention_newsletter_days: null };

describe('shorter deletion periods', () => {
  it('names a period that gets shorter', () => {
    const shorter = shortenedPeriods({ retentionLowRatingPhoneDays: '90', retentionFeedbackDays: '30', retentionNewsletterDays: '' }, stored);

    expect(shorter).toEqual([{ subject: 'Bewertungen samt Besuchen der Gästeseite', before: 180, next: 30 }]);
  });

  it('counts a first period after keeping without end as shorter', () => {
    const shorter = shortenedPeriods({ retentionLowRatingPhoneDays: 90, retentionFeedbackDays: 180, retentionNewsletterDays: 365 }, stored);

    expect(shorter).toEqual([{ subject: 'Newsletter-Anmeldungen', before: null, next: 365 }]);
  });

  it('lets a longer, equal or emptied period pass without asking', () => {
    expect(shortenedPeriods({ retentionLowRatingPhoneDays: 120, retentionFeedbackDays: '', retentionNewsletterDays: '' }, stored)).toEqual([]);
  });

  it('says what the next run removes', () => {
    expect(shortenedSentence({ subject: 'Rückrufnummern', before: 90, next: 1 }))
      .toBe('Rückrufnummern: bisher 90 Tage, neu 1 Tag. Der nächste Löschlauf entfernt alle, die älter sind.');
    expect(shortenedSentence({ subject: 'Newsletter-Anmeldungen', before: null, next: 30 }))
      .toBe('Newsletter-Anmeldungen: bisher ohne Frist, neu 30 Tage. Der nächste Löschlauf entfernt alle, die älter sind.');
  });
});
