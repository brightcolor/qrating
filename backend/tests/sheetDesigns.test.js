import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { renderQrPrintSheet, sheetDesigns } from '../src/utils/printSheet.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let ownerCookie;
let organization;
let event;

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

async function sheet(path, cookie = ownerCookie) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { cookie } });
  return { status: response.status, body: await response.text() };
}

describe('sheets for events and for the organizer', () => {
  beforeAll(async () => {
    await runMigrations();
    await seedDefaultData();
    server = app.listen(0);
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const setup = await request('POST', '/admin/setup/first-admin', {
      body: { name: 'Owner', email: 'owner@example.test', password: 'test-password-123', organizationName: 'HSP-Events' }
    });
    expect(setup.status).toBe(201);
    ownerCookie = setup.cookie;
    organization = (await query('SELECT * FROM organizations LIMIT 1')).rows[0];
    event = (await query("SELECT * FROM events WHERE slug = 'demo-nacht'")).rows[0];
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await db.close();
  });

  it('names the designs it can print', async () => {
    const list = await request('GET', '/admin/print-designs', { cookie: ownerCookie });

    expect(list.status).toBe(200);
    expect(list.body.map((item) => item.id)).toEqual(['klassik', 'pur', 'tafel', 'karte']);
    for (const item of list.body) expect(item.label.length).toBeGreaterThan(2);
  });

  it('prints a sheet for the organizer without naming an evening', async () => {
    const paper = await sheet(`/admin/organizations/${organization.id}/qr-print`);

    expect(paper.status).toBe(200);
    expect(paper.body).toContain('HSP-Events');
    expect(paper.body).toContain('Wie war');
    // The dynamic code leads to whatever runs, so no single event stands on it.
    expect(paper.body).not.toContain('Demo Nacht');
    expect(paper.body).toContain('#FFC933');
  });

  it('takes the design out of the address', async () => {
    const board = await sheet(`/admin/organizations/${organization.id}/qr-print?design=tafel`);
    const card = await sheet(`/admin/events/${event.id}/qr-print?design=karte`);
    const unknown = await sheet(`/admin/events/${event.id}/qr-print?design=bunt`);

    expect(board.body).toContain('class="band"');
    expect(card.body).toContain('Ausschneiden und aufstellen');
    expect(card.body).toContain('Demo Nacht');
    // A design nobody knows falls back to the one everybody knows.
    expect(unknown.body).not.toContain('class="band"');
    expect(unknown.body).toContain('class="stars"');
  });

  it('writes an own headline when one is handed over', () => {
    const own = renderQrPrintSheet({
      organizationName: 'HSP-Events',
      accentColor: '#2563eb',
      qrSvg: '<svg></svg>',
      nonce: 'test',
      design: 'pur',
      hook: 'Sag uns die Meinung'
    });

    expect(own).toContain('Sag uns die Meinung');
    expect(own).not.toContain('Wie war');
  });

  // The code is the only thing a guest uses, so no design may shrink it again.
  it('gives the code the room it needs in every design', () => {
    const floors = { klassik: 110, pur: 135, tafel: 118, karte: 85 };

    for (const [design, floor] of Object.entries(floors)) {
      const paper = renderQrPrintSheet({
        event: { name: 'Sommerfest', date_from: '2026-07-01T16:00:00.000Z', event_timezone: 'Europe/Berlin' },
        organizationName: 'HSP-Events',
        accentColor: '#2563eb',
        qrSvg: '<svg id="code"></svg>',
        nonce: 'test',
        design
      });
      // The last rule for the code wins, so the width of this design stands at the end.
      const widths = [...paper.matchAll(/\.code svg \{[^}]*width: ([\d.]+)mm/g)].map((hit) => Number(hit[1]));

      expect(widths.length, `${design}: keine Breite gefunden`).toBeGreaterThan(0);
      expect(widths.at(-1), `${design}: Code zu klein`).toBeGreaterThanOrEqual(floor);
    }
  });

  it('keeps every design on one page and readable', () => {
    for (const design of Object.keys(sheetDesigns)) {
      const paper = renderQrPrintSheet({
        event: { name: 'Sommerfest', date_from: '2026-07-01T16:00:00.000Z', event_timezone: 'Europe/Berlin' },
        organizationName: 'HSP-Events',
        accentColor: '#c2410c',
        qrSvg: '<svg id="code"></svg>',
        nonce: 'test',
        design
      });

      expect(paper).toContain('@page { size: A4; margin: 14mm; }');
      expect(paper).toContain('<svg id="code">');
      expect(paper).toContain('Sommerfest');
      expect(paper).toContain('0.761 0.255 0.047'.slice(0, 0) + '#c2410c');
    }
  });
});
