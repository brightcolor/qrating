import { describe, expect, it } from 'vitest';
import { buildEventReportPdf } from '../src/utils/pdf.js';

describe('PDF reporting', () => {
  it('creates a multi-section event report PDF', () => {
    const pdf = buildEventReportPdf({
      event: { name: 'Demo Nacht', date_from: '2026-09-05T18:00:00Z', location: 'Hauptsaal' },
      summary: { total: 12, average_rating: '4.25', low_ratings: 1, newsletter_optins: 3, average_nps: '8.50' },
      distribution: [{ rating: 5, count: 8 }, { rating: 4, count: 3 }, { rating: 2, count: 1 }],
      timeline: [{ bucket: '2026-09-05T20:00:00Z', count: 6, average_rating: '4.50' }],
      questionStats: [{ label: 'Musik', answer_value: 'Sehr gut', count: 5 }],
      comments: [{ rating: 5, comment_positive: 'Sehr schoener Abend' }]
    });

    expect(pdf.subarray(0, 8).toString()).toBe('%PDF-1.4');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
