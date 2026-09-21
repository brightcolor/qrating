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
let organizationSlug;
let event;
let source;

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

async function countedScans() {
  return (await query(
    'SELECT coalesce(sum(scans_count), 0)::int AS live FROM qr_source_daily_stats WHERE event_id = $1',
    [event.id]
  )).rows[0].live;
}

describe('the numbers of a QR spot outlive the source', () => {
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
    organizationSlug = (await query('SELECT slug FROM organizations LIMIT 1')).rows[0].slug;
    event = (await query("SELECT * FROM events WHERE slug = 'demo-nacht'")).rows[0];

    // The order that sets the trap: the printed code is scanned once while nobody has
    // entered the spot yet, so the day of that spot starts without a source.
    const early = await request('GET', `/public/f/${organizationSlug}/tresen`);
    expect(early.body.status).toBe('ok');

    const created = await request('POST', '/admin/qr-sources', {
      cookie: ownerCookie,
      body: { sourceSlug: 'tresen', label: 'Tresen', eventId: event.id, type: 'event_specific' }
    });
    expect(created.status).toBe(201);
    source = created.body;

    // From here on the same code counts on the source, on the same day, for the same event.
    await request('GET', `/public/f/${organizationSlug}/tresen`);
    await request('GET', `/public/f/${organizationSlug}/tresen`);
    expect(await countedScans()).toBe(3);
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await db.close();
  });

  it('lets the source go and keeps every scan it ever counted', async () => {
    const removed = await request('DELETE', `/admin/qr-sources/${source.id}`, { cookie: ownerCookie });

    // Emptying the column would drop the row onto the sourceless row of the same day,
    // and the unique index counts two empty values as one.
    expect(removed.status).toBe(200);
    // Taking the rows along with the source would leave the event with fewer scans
    // than feedbacks, so the counted history stays where it is.
    expect(await countedScans()).toBe(3);
  });

  it('still names the spot in the analytics of the event', async () => {
    const analytics = await request('GET', `/admin/events/${event.id}/qr-analytics`, { cookie: ownerCookie });

    expect(analytics.status).toBe(200);
    const spot = analytics.body.bySource.filter((row) => row.source_slug === 'tresen');
    expect(spot).toHaveLength(1);
    expect(spot[0]).toMatchObject({ label: 'Tresen', scans_count: 3 });
  });

  it('knows the name of the spot even when the source vanishes past the admin area', async () => {
    const flyer = (await request('POST', '/admin/qr-sources', {
      cookie: ownerCookie,
      body: { sourceSlug: 'flyer', label: 'Flyer', eventId: event.id, type: 'event_specific' }
    })).body;
    await request('GET', `/public/f/${organizationSlug}/flyer`);

    // A cleanup in the database, a cascade, any way that never touches the admin route:
    // the name is on the counted day itself because every scan writes it there.
    await query('DELETE FROM qr_sources WHERE id = $1', [flyer.id]);

    const analytics = await request('GET', `/admin/events/${event.id}/qr-analytics`, { cookie: ownerCookie });
    const spot = analytics.body.bySource.find((row) => row.source_slug === 'flyer');
    expect(spot).toMatchObject({ label: 'Flyer', scans_count: 1 });
  });

  it('remembers the name a source was given after its last scan', async () => {
    const stand = (await request('POST', '/admin/qr-sources', {
      cookie: ownerCookie,
      body: { sourceSlug: 'aufsteller', label: 'Aufsteller', eventId: event.id, type: 'event_specific' }
    })).body;
    await request('GET', `/public/f/${organizationSlug}/aufsteller`);
    const renamed = await request('PATCH', `/admin/qr-sources/${stand.id}`, {
      cookie: ownerCookie,
      body: { label: 'Aufsteller Eingang' }
    });
    expect(renamed.status).toBe(200);

    await request('DELETE', `/admin/qr-sources/${stand.id}`, { cookie: ownerCookie });

    const analytics = await request('GET', `/admin/events/${event.id}/qr-analytics`, { cookie: ownerCookie });
    const spot = analytics.body.bySource.find((row) => row.source_slug === 'aufsteller');
    expect(spot).toMatchObject({ label: 'Aufsteller Eingang', scans_count: 1 });
  });
});
