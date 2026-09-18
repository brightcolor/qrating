import { describe, expect, it } from 'vitest';
import { buildEventReportPdf, simplePdf, textWidth, wrapText } from '../src/utils/pdf.js';

const fullReport = {
  event: { name: 'Demo Nacht', date_from: '2026-09-05T18:00:00Z', location: 'Hauptsaal', event_timezone: 'Europe/Berlin' },
  organization: { name: 'HSP-Events', primary_color: '#c2410c' },
  summary: { total: 12, average_rating: '4.25', low_ratings: 1, newsletter_optins: 3, average_nps: '8.50' },
  distribution: [{ rating: 5, count: 8 }, { rating: 4, count: 3 }, { rating: 2, count: 1 }],
  timeline: [{ bucket: '2026-09-05T20:00:00Z', count: 6, average_rating: '4.50' }],
  questionStats: [{ label: 'Musik', answer_value: 'Sehr gut', count: 5 }],
  comments: [{ rating: 5, comment_positive: 'Sehr schöner Abend' }],
  now: new Date('2026-09-08T06:30:00Z')
};

describe('PDF reporting', () => {
  it('creates an event report with both fonts and the figures of the event', () => {
    const pdf = buildEventReportPdf(fullReport);
    const text = pdf.toString('latin1');

    expect(pdf.subarray(0, 8).toString()).toBe('%PDF-1.4');
    expect(text).toContain('/BaseFont /Helvetica-Bold');
    expect(text).toContain('(FEEDBACK-BERICHT) Tj');
    expect(text).toContain('(Demo Nacht) Tj');
    expect(text).toContain('(HSP-Events) Tj');
    expect(text).toContain('(12) Tj');
    expect(text).toContain('(4,25) Tj');
    expect(text).toContain('(Samstag, 5. September 2026 um 20:00 Uhr  \\225  Hauptsaal) Tj');
    expect(text).toContain('(Erstellt am 8. September 2026 um 08:30 Uhr) Tj');
    expect(text).toContain('(1/1) Tj');
  });

  it('paints the rating bars in the colour of the organization', () => {
    const pdf = buildEventReportPdf(fullReport).toString('latin1');

    // #c2410c as PDF colour, plus a bar that stands for the eight five-star ratings.
    expect(pdf).toContain('0.761 0.255 0.047 rg');
    expect(pdf).toContain('(8 \\(67 %\\)) Tj');
    expect(pdf).toContain('(5 Sterne) Tj');
  });

  it('prints umlauts, ß and typographic quotes in the report', () => {
    const pdf = buildEventReportPdf({
      ...fullReport,
      event: { name: 'Sommerfest Lübeck', date_from: null, location: 'Straßenbahnhof' },
      organization: null,
      comments: [{ rating: 5, comment_positive: 'Grüße (Straße) – „super“ č 🎉' }]
    });
    const text = pdf.toString('latin1');

    expect(text).toContain('/Encoding /WinAnsiEncoding');
    expect(text).toContain('(Sommerfest L\\374beck) Tj');
    expect(text).toContain('Stra\\337enbahnhof');
    expect(text).toContain('(Gr\\374\\337e \\(Stra\\337e\\) \\226 \\204super\\223 c ?) Tj');
    // Without an organization colour the report falls back to the qrating blue.
    expect(text).toContain('0.145 0.388 0.922 rg');
  });

  it('carries long comments to the next page and numbers every page', () => {
    const long = 'Der Abend war schön, aber die Schlange am Einlass war lang und der Sound im Nebenraum zu leise.';
    const pdf = buildEventReportPdf({
      ...fullReport,
      comments: Array.from({ length: 12 }, (_, index) => ({ rating: 4, general_comment: `${index + 1}. ${long}` }))
    }).toString('latin1');

    expect(pdf).toContain('/Count 2');
    expect(pdf).toContain('(1/2) Tj');
    expect(pdf).toContain('(2/2) Tj');
  });

  it('measures and wraps text along the width of the font', () => {
    expect(textWidth('Hallo', 10)).toBeCloseTo(22.78, 2);
    expect(textWidth('Hallo', 10, true)).toBeGreaterThan(textWidth('Hallo', 10));
    // An umlaut is as wide as its base letter, so a German line still fits its box.
    expect(textWidth('ü', 10)).toBe(textWidth('u', 10));
    expect(textWidth('Grüße', 10)).toBeCloseTo(textWidth('Gruße', 10), 5);

    const lines = wrapText('Ein Satz mit mehreren Wörtern, der umbrechen muss', 10, 80);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(textWidth(line, 10)).toBeLessThanOrEqual(80);
    expect(lines.join(' ')).toBe('Ein Satz mit mehreren Wörtern, der umbrechen muss');
  });

  it('writes a short report without an event', () => {
    const pdf = simplePdf('Kurzbericht', ['Erste Zeile', 'Zweite Zeile']).toString('latin1');

    expect(pdf).toContain('(Kurzbericht) Tj');
    expect(pdf).toContain('(Erste Zeile) Tj');
  });
});
