import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { env } from '../src/config/env.js';
import { formatEventPeriod, renderQrPrintSheet, safeAccent } from '../src/utils/printSheet.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let ownerCookie;
let eventId;

async function request(method, path, { body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null
  };
}

async function page(path, cookie) {
  const response = await fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : {} });
  return { status: response.status, text: await response.text() };
}

describe('print sheet of an event', () => {
  beforeAll(async () => {
    await runMigrations();
    await seedDefaultData();
    server = app.listen(0);
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const setup = await request('POST', '/admin/setup/first-admin', {
      body: {
        name: 'Owner',
        email: 'owner@example.test',
        password: 'test-password-123',
        organizationName: 'HSP-Events'
      }
    });
    expect(setup.status).toBe(201);
    ownerCookie = setup.cookie;
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await db.close();
  });

  it('writes the day in words and keeps a run of days in one line', () => {
    const zone = 'Europe/Berlin';

    expect(formatEventPeriod({ date_from: '2026-09-19T15:30:00.000Z', event_timezone: zone })).toBe('Samstag, 19. September 2026');
    // Late in the evening the day in Berlin is already the next one.
    expect(formatEventPeriod({ date_from: '2026-09-19T22:30:00.000Z', event_timezone: zone })).toBe('Sonntag, 20. September 2026');
    expect(formatEventPeriod({ date_from: '2026-09-19T15:30:00.000Z', date_to: '2026-09-22T20:00:00.000Z', event_timezone: zone }))
      .toBe('19. – 22. September 2026');
    expect(formatEventPeriod({ date_from: '2026-07-31T10:00:00.000Z', date_to: '2026-08-02T20:00:00.000Z', event_timezone: zone }))
      .toBe('31. Juli – 2. August 2026');
    expect(formatEventPeriod({ date_from: '2026-12-31T10:00:00.000Z', date_to: '2027-01-01T20:00:00.000Z', event_timezone: zone }))
      .toBe('31. Dezember 2026 – 1. Januar 2027');
    expect(formatEventPeriod({})).toBe('');
  });

  it('takes only a real color into the style block', () => {
    expect(safeAccent('#c2410c')).toBe('#c2410c');
    expect(safeAccent('#abc')).toBe('#abc');
    expect(safeAccent('red; } body { display: none')).toBe('#2563eb');
    expect(safeAccent(null)).toBe('#2563eb');
  });

  it('escapes names that come from the Pretix sync', () => {
    const sheet = renderQrPrintSheet({
      event: { name: '<img src=x onerror=alert(1)>' },
      organizationName: 'HSP-Events',
      accentColor: '#2563eb',
      qrSvg: '<svg></svg>',
      nonce: 'test'
    });

    expect(sheet).not.toContain('<img src=x');
    expect(sheet).toContain('&lt;img src=x');
  });

  it('shows the event with its date and leaves the address off the sheet', async () => {
    const created = await request('POST', '/admin/events', {
      cookie: ownerCookie,
      body: {
        name: 'Hafenfest',
        dateFrom: '2026-08-14T16:00:00.000Z',
        dateTo: '2026-08-16T20:00:00.000Z',
        location: 'Alter Hafen',
        eventTimezone: 'Europe/Berlin'
      }
    });
    expect(created.status).toBe(201);
    eventId = created.body.id;

    const sheet = await page(`/admin/events/${eventId}/qr-print`, ownerCookie);

    expect(sheet.status).toBe(200);
    expect(sheet.text).toContain('Hafenfest');
    expect(sheet.text).toContain('14. – 16. August 2026');
    expect(sheet.text).toContain('Alter Hafen');
    expect(sheet.text).toContain('HSP-Events');
    // Guests scan the code, so the address itself stays off the paper.
    expect(sheet.text).not.toContain(created.body.event_feedback_token);
    expect(sheet.text).not.toContain(env.feedbackAppUrl);
  });

  it('asks for a login before it hands out a sheet', async () => {
    const sheet = await page(`/admin/events/${eventId}/qr-print`);

    expect(sheet.status).toBe(401);
    expect(sheet.text).toContain('melde dich an');
  });
});
