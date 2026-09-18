import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let ownerCookie;
let organization;
let running;
let soon;
let later;

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

async function createEvent(name, { days, shop = null }) {
  const created = await request('POST', '/admin/events', {
    cookie: ownerCookie,
    body: { name, dateFrom: new Date(Date.now() + days * 86_400_000).toISOString(), location: 'Alter Hafen' }
  });
  expect(created.status).toBe(201);
  if (shop) await query('UPDATE events SET pretix_public_url = $2 WHERE id = $1', [created.body.id, shop]);
  return (await query('SELECT * FROM events WHERE id = $1', [created.body.id])).rows[0];
}

describe('events that are still to come', () => {
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
    // The free plan allows two events; this test needs a few more.
    await query("UPDATE organizations SET billing_override_plan = 'business', ticketshop_url = 'https://shop.example.test'");
    organization = (await query('SELECT * FROM organizations LIMIT 1')).rows[0];
    running = (await query("SELECT * FROM events WHERE slug = 'demo-nacht'")).rows[0];
    soon = await createEvent('Weihnachtsedition', { days: 30, shop: 'https://shop.example.test/weihnacht' });
    later = await createEvent('Hafenklang', { days: 90 });
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await db.close();
  });

  it('sends the guest into the open rating and names what comes after it', async () => {
    const guest = await request('GET', `/public/e/${running.event_feedback_token}`);

    expect(guest.status).toBe(200);
    expect(guest.body.status).toBe('ok');
    expect(guest.body.upcoming.map((item) => item.name)).toEqual(['Weihnachtsedition', 'Hafenklang']);
    expect(guest.body.upcoming[0]).toMatchObject({ shopUrl: 'https://shop.example.test/weihnacht', location: 'Alter Hafen' });
    // Without a shop link of its own the event falls back to the shop of the organization.
    expect(guest.body.upcoming[1].shopUrl).toBe('https://shop.example.test');
  });

  it('takes the events the event itself chose', async () => {
    const saved = await request('PATCH', `/admin/events/${running.id}`, {
      cookie: ownerCookie,
      body: { upcomingEventIds: [later.id] }
    });
    expect(saved.status).toBe(200);

    const guest = await request('GET', `/public/e/${running.event_feedback_token}`);
    expect(guest.body.upcoming.map((item) => item.name)).toEqual(['Hafenklang']);

    await request('PATCH', `/admin/events/${running.id}`, { cookie: ownerCookie, body: { upcomingEventIds: [] } });
  });

  it('says nothing about other events once the hint is switched off', async () => {
    await request('PATCH', `/admin/events/${running.id}`, { cookie: ownerCookie, body: { upcomingEnabled: false } });

    const guest = await request('GET', `/public/e/${running.event_feedback_token}`);
    expect(guest.body.upcoming).toEqual([]);

    await request('PATCH', `/admin/events/${running.id}`, { cookie: ownerCookie, body: { upcomingEnabled: true } });
  });

  it('shows an event before its round with the moment it opens', async () => {
    const guest = await request('GET', `/public/e/${soon.event_feedback_token}`);

    expect(guest.status).toBe(200);
    expect(guest.body.status).toBe('waiting');
    expect(guest.body.event.name).toBe('Weihnachtsedition');
    expect(new Date(guest.body.feedback.opensAt).getTime()).toBeGreaterThan(Date.now());
    expect(guest.body.texts.upcoming_headline).toBe('Als Nächstes');
  });

  it('lists the coming events on the page of the organization while nothing runs', async () => {
    await query("UPDATE events SET status = 'closed' WHERE id = $1", [running.id]);

    const guest = await request('GET', `/public/f/${organization.slug}`);

    expect(guest.status).toBe(200);
    expect(guest.body.status).toBe('waiting');
    expect(guest.body.upcoming.map((item) => item.name)).toEqual(['Weihnachtsedition', 'Hafenklang']);
    expect(guest.body.organization.name).toBe('HSP-Events');

    await query("UPDATE events SET status = 'active' WHERE id = $1", [running.id]);
  });

  it('goes straight into the rating while a round is open', async () => {
    const guest = await request('GET', `/public/f/${organization.slug}`);

    expect(guest.body.status).toBe('ok');
    expect(guest.body.event.name).toBe(running.name);
    expect(guest.body.upcoming.length).toBeGreaterThan(0);
  });
});
