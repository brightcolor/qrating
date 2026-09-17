import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { asciiName, attachmentHeader, buildDownloadName } from '../src/utils/downloadName.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let ownerCookie;
let eventId;

const berlin = 'Europe/Berlin';
const downloadedAt = new Date('2026-09-18T08:30:00.000Z');

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

async function download(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { cookie: ownerCookie } });
  return { status: response.status, disposition: response.headers.get('content-disposition') ?? '' };
}

describe('file names of downloads', () => {
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

    const created = await request('POST', '/admin/events', {
      cookie: ownerCookie,
      body: {
        name: 'Wismar tanzt - Gestört aber GeiL',
        dateFrom: '2026-09-19T15:30:00.000Z',
        dateTo: '2026-09-19T20:00:00.000Z',
        eventTimezone: berlin
      }
    });
    expect(created.status).toBe(201);
    eventId = created.body.id;
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await db.close();
  });

  it('carries the event, its date, the kind and the moment of the download', () => {
    const event = { name: 'Wismar tanzt - Gestört aber GeiL', date_from: '2026-09-19T15:30:00.000Z', event_timezone: berlin };

    const { name, ascii } = buildDownloadName({ event, kind: 'Feedback', extension: 'csv', now: downloadedAt });

    expect(name).toBe('Wismar-tanzt-Gestört-aber-GeiL_2026-09-19_Feedback_geladen-2026-09-18-1030.csv');
    expect(ascii).toBe('Wismar-tanzt-Gestoert-aber-GeiL_2026-09-19_Feedback_geladen-2026-09-18-1030.csv');
  });

  it('reads both dates in the timezone of the event', () => {
    const event = { name: 'Lange Nacht', date_from: '2026-09-19T22:30:00.000Z', event_timezone: berlin };

    const { name } = buildDownloadName({ event, kind: 'Bericht', extension: 'pdf', now: new Date('2026-09-20T23:10:00.000Z') });

    // 22:30 UTC is already the next day in Berlin, and so is the download at 23:10 UTC.
    expect(name).toBe('Lange-Nacht_2026-09-20_Bericht_geladen-2026-09-21-0110.pdf');
  });

  it('gets by without a name and without a date', () => {
    const { name } = buildDownloadName({ event: { name: '   ' }, kind: 'Newsletter', extension: 'csv', now: downloadedAt });

    expect(name).toBe('Event_Newsletter_geladen-2026-09-18-1030.csv');
  });

  it('keeps a very long event name short and clean', () => {
    const event = { name: 'Sommerfest der Freiwilligen Feuerwehr Groß Stieten und Umgebung 2026', date_from: '2026-07-31T10:00:00.000Z' };

    const { name, ascii } = buildDownloadName({ event, kind: 'Feedback', extension: 'xlsx', now: downloadedAt });

    expect(name.split('_')[0]).toBe('Sommerfest-der-Freiwilligen-Feuerwehr-Groß-Stieten-und-Umgeb');
    expect(name.split('_')[0].length).toBe(60);
    expect(ascii).not.toMatch(/--/);
    expect(asciiName('Grüße/Wege:Test')).toBe('Gruesse-Wege-Test');
  });

  it('writes a header that every browser can read', () => {
    const event = { name: 'Wismar tanzt - Gestört aber GeiL', date_from: '2026-09-19T15:30:00.000Z', event_timezone: berlin };

    const header = attachmentHeader({ event, kind: 'Feedback', extension: 'csv', now: downloadedAt });

    expect(header).toBe(
      'attachment; filename="Wismar-tanzt-Gestoert-aber-GeiL_2026-09-19_Feedback_geladen-2026-09-18-1030.csv"; '
      + "filename*=UTF-8''Wismar-tanzt-Gest%C3%B6rt-aber-GeiL_2026-09-19_Feedback_geladen-2026-09-18-1030.csv"
    );
    // A header travels as latin1: an umlaut in the plain name would end the response with an error.
    expect(header).toMatch(/^[ -~]+$/);
  });

  it('names every download of an event after the event', async () => {
    const exports = [
      ['/export.csv', 'Feedback', 'csv'],
      ['/export.xlsx', 'Feedback', 'xlsx'],
      ['/newsletter.csv', 'Newsletter', 'csv'],
      ['/report.pdf', 'Bericht', 'pdf']
    ];

    for (const [path, kind, extension] of exports) {
      const result = await download(`/admin/events/${eventId}${path}`);

      expect(result.status).toBe(200);
      expect(result.disposition).toContain('Wismar-tanzt-Gestoert-aber-GeiL_2026-09-19_' + kind + '_geladen-');
      expect(result.disposition).toContain('.' + extension + '"');
      expect(result.disposition).not.toContain('qrating-');
    }
  });
});
