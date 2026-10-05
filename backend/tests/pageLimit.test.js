import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';

// The limit is read when the routes load, so it is set before anything imports them.
vi.hoisted(() => {
  process.env.PAGE_RATE_LIMIT_MAX = '3';
});

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;

beforeAll(async () => {
  await runMigrations();
  await seedDefaultData();
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}, 60_000);

afterAll(async () => {
  server?.close();
  await db.close();
  delete process.env.PAGE_RATE_LIMIT_MAX;
});

describe('the public pages', () => {
  it('stop at the limit of their setting with a message for the guest, and a refused call counts no scan', async () => {
    const event = (await query("SELECT id, event_feedback_token FROM events WHERE slug = 'demo-nacht'")).rows[0];
    const scans = async () => Number((await query(
      'SELECT COALESCE(sum(scans_count), 0)::int AS scans FROM qr_source_daily_stats WHERE event_id = $1',
      [event.id]
    )).rows[0].scans);

    // The guest page, the page of the organization and the website share one count per address.
    const statuses = [];
    let refusal = null;
    for (const path of [`/public/e/${event.event_feedback_token}`, '/public/f/demo-events', '/public/site', `/public/e/${event.event_feedback_token}`]) {
      const response = await fetch(`${baseUrl}${path}`);
      statuses.push(response.status);
      if (response.status === 429) refusal = await response.json();
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(refusal.error).toBe('Von diesem Anschluss kamen gerade sehr viele Seitenaufrufe. Bitte warte eine Minute und lade die Seite dann neu.');
    expect(await scans()).toBe(2);
  });

  it('leave the steps of a guest to their own limit', async () => {
    const { event_feedback_token: token } = (await query("SELECT event_feedback_token FROM events WHERE slug = 'demo-nacht'")).rows[0];

    const response = await fetch(`${baseUrl}/public/events/${token}/progress`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: 'gast-nach-vielen-aufrufen', step: 'rating', stepIndex: 0, stepsTotal: 3 })
    });

    expect(response.status).toBe(200);
  });
});
