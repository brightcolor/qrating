import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { renderQrPrintSheet } from '../src/utils/printSheet.js';
import { productCredit } from '../src/utils/qrCode.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let ownerCookie;
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

async function text(path, cookie) {
  const response = await fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : {} });
  return { status: response.status, body: await response.text() };
}

describe('the note about qrating and the mark in the code', () => {
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
    event = (await query("SELECT * FROM events WHERE slug = 'demo-nacht'")).rows[0];
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await db.close();
  });

  it('shows the note on the guest page of an untouched installation', async () => {
    const guest = await request('GET', `/public/e/${event.event_feedback_token}`);

    expect(guest.status).toBe(200);
    expect(guest.body.event.credit).toBe(productCredit);
    expect(guest.body.event.credit).toContain('bright color');
  });

  it('carries the mark in the QR code and the note on the sheet', async () => {
    const code = await text(`/admin/events/${event.id}/qr`, ownerCookie);
    const sheet = await text(`/admin/events/${event.id}/qr-print`, ownerCookie);

    expect(code.body).toContain('#FFC933');
    expect(sheet.body).toContain('#FFC933');
    expect(sheet.body).toContain('ein Projekt von bright color');
  });

  it('leaves both out once the organization switches them off', async () => {
    const saved = await request('PATCH', '/admin/branding', {
      cookie: ownerCookie,
      body: { qrMarkEnabled: false, productCreditEnabled: false }
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ qr_mark_enabled: false, product_credit_enabled: false });

    const guest = await request('GET', `/public/e/${event.event_feedback_token}`);
    const code = await text(`/admin/events/${event.id}/qr`, ownerCookie);
    const sheet = await text(`/admin/events/${event.id}/qr-print`, ownerCookie);

    expect(guest.body.event.credit).toBe(null);
    expect(code.body).not.toContain('#FFC933');
    expect(sheet.body).not.toContain('#FFC933');
    expect(sheet.body).not.toContain('bright color');
  });

  it('switches both on again', async () => {
    const saved = await request('PATCH', '/admin/branding', {
      cookie: ownerCookie,
      body: { qrMarkEnabled: true, productCreditEnabled: true }
    });

    expect(saved.body).toMatchObject({ qr_mark_enabled: true, product_credit_enabled: true });
    const guest = await request('GET', `/public/e/${event.event_feedback_token}`);
    expect(guest.body.event.credit).toBe(productCredit);
  });

  it('prints the note only when it is handed over', () => {
    const withNote = renderQrPrintSheet({
      event: { name: 'Sommerfest' },
      organizationName: 'HSP-Events',
      accentColor: '#2563eb',
      qrSvg: '<svg></svg>',
      nonce: 'test',
      credit: productCredit
    });
    const without = renderQrPrintSheet({
      event: { name: 'Sommerfest' },
      organizationName: 'HSP-Events',
      accentColor: '#2563eb',
      qrSvg: '<svg></svg>',
      nonce: 'test'
    });

    expect(withNote).toContain('ein Projekt von bright color');
    expect(without).not.toContain('bright color');
  });

  it('keeps the note in the website content until it is switched off', async () => {
    const site = await request('GET', '/public/site');
    expect(site.body.content.showProductCredit).toBe(true);

    const saved = await request('PATCH', '/admin/site-content', {
      cookie: ownerCookie,
      body: { content: { ...site.body.content, showProductCredit: false } }
    });
    expect(saved.status).toBe(200);

    const again = await request('GET', '/public/site');
    expect(again.body.content.showProductCredit).toBe(false);
  });
});
