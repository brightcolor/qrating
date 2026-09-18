import { describe, expect, it } from 'vitest';
import { plainText } from '../src/utils/localized.js';
import { renderQrPrintSheet } from '../src/utils/printSheet.js';
import { buildEventReportPdf } from '../src/utils/pdf.js';
import { publicEventStatus } from '../src/utils/security.js';

const pretixLocation = '{"de": "Zum Festplatz 32, 23966 Wismar", "en": "Festival ground 32"}';

describe('translated fields from Pretix', () => {
  it('picks the German text out of a translated field', () => {
    expect(plainText(pretixLocation)).toBe('Zum Festplatz 32, 23966 Wismar');
    expect(plainText({ de: 'Rathaus', en: 'Town hall' })).toBe('Rathaus');
    expect(plainText({ en: 'Town hall' })).toBe('Town hall');
    expect(plainText({ fr: 'Mairie' })).toBe('Mairie');
  });

  it('leaves plain text, empty values and broken JSON alone', () => {
    expect(plainText('Alter Hafen, Wismar')).toBe('Alter Hafen, Wismar');
    expect(plainText('{kein json}')).toBe('{kein json}');
    expect(plainText('   ')).toBe('');
    expect(plainText(null)).toBe('');
    expect(plainText(undefined, 'Ohne Ort')).toBe('Ohne Ort');
    expect(plainText({})).toBe('');
  });

  it('keeps the JSON off the printed sheet', () => {
    const sheet = renderQrPrintSheet({
      event: { name: 'Wismar tanzt', date_from: '2026-09-19T15:30:00.000Z', location: pretixLocation, event_timezone: 'Europe/Berlin' },
      organizationName: 'HSP-Events',
      accentColor: '#2563eb',
      qrSvg: '<svg></svg>',
      nonce: 'test'
    });

    expect(sheet).toContain('Zum Festplatz 32, 23966 Wismar');
    expect(sheet).not.toContain('&quot;de&quot;');
    expect(sheet).not.toContain('{&quot;');
  });

  it('keeps the JSON out of the report', () => {
    const pdf = buildEventReportPdf({
      event: { name: 'Wismar tanzt', date_from: '2026-09-19T15:30:00.000Z', location: pretixLocation, event_timezone: 'Europe/Berlin' },
      organization: { name: 'HSP-Events', primary_color: '#2563eb' },
      summary: { total: 3 },
      distribution: [],
      timeline: [],
      questionStats: [],
      comments: []
    }).toString('latin1');

    expect(pdf).toContain('Zum Festplatz 32, 23966 Wismar');
    expect(pdf).not.toContain('\\{"de"');
  });

  it('hands the guest page a readable place', () => {
    const view = publicEventStatus(
      { name: 'Wismar tanzt', location: pretixLocation, date_from: '2026-09-19T15:30:00.000Z', organization_name: 'HSP-Events' }
    );

    expect(view.location).toBe('Zum Festplatz 32, 23966 Wismar');
  });
});
