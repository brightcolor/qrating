import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { buildFunnel, scanFunnel } from '../src/services/guestSessionService.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let ownerCookie;
let event;
let slug;

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

// Everything the event ever collected, no matter which QR source brought it in.
async function scans() {
  return (await query(
    `SELECT coalesce(sum(scans_count), 0)::int AS live,
            coalesce(sum(scans_before), 0)::int AS before_round,
            coalesce(sum(scans_after), 0)::int AS after_round
     FROM qr_source_daily_stats WHERE event_id = $1`,
    [event.id]
  )).rows[0];
}

async function moveRound(offset, windowDays = 3) {
  event = (await query(
    `UPDATE events SET date_from = now() + $2::interval, date_to = now() + $2::interval, feedback_window_days = $3
     WHERE id = $1 RETURNING *`,
    [event.id, offset, windowDays]
  )).rows[0];
}

describe('a scan knows which phase of the round it happened in', () => {
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
    slug = (await query('SELECT slug FROM organizations LIMIT 1')).rows[0].slug;
    event = (await query("SELECT * FROM events WHERE slug = 'demo-nacht'")).rows[0];
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await db.close();
  });

  it('counts the guest who scanned before the round, on a counter of its own', async () => {
    await moveRound('5 days');

    const waiting = await request('GET', `/public/f/${slug}`);

    expect(waiting.status).toBe(200);
    expect(waiting.body.status).toBe('waiting');
    // The round has not started, so nothing may land on the counter that means "was there".
    expect(await scans()).toMatchObject({ live: 0, before_round: 1, after_round: 0 });
  });

  it('keeps the early scan of the event code off the counter of the round', async () => {
    // The round is still five days away; this is the code printed on a single event.
    const waiting = await request('GET', `/public/e/${event.event_feedback_token}`);

    expect(waiting.body.status).toBe('waiting');
    expect(await scans()).toMatchObject({ live: 0, before_round: 2, after_round: 0 });
  });

  it('counts a scan of the running round where it belongs', async () => {
    await moveRound('-1 hour');

    const open = await request('GET', `/public/f/${slug}`);

    expect(open.body.status).toBe('ok');
    expect(await scans()).toMatchObject({ live: 1, before_round: 2, after_round: 0 });
  });

  it('counts the guest who came too late without touching the round', async () => {
    await moveRound('-40 days', 1);

    const closed = await request('GET', `/public/e/${event.event_feedback_token}`);

    expect(closed.status).toBe(410);
    expect(await scans()).toMatchObject({ live: 1, before_round: 2, after_round: 1 });
  });

  it('hands all three numbers to the analytics of the event', async () => {
    const analytics = await request('GET', `/admin/events/${event.id}/analytics`, { cookie: ownerCookie });

    expect(analytics.status).toBe(200);
    expect(analytics.body.funnel).toMatchObject({ scanned: 1, scansBefore: 2, scansAfter: 1 });
  });

  it('names the phases per QR source as well', async () => {
    const qr = await request('GET', `/admin/events/${event.id}/qr-analytics`, { cookie: ownerCookie });

    expect(qr.status).toBe(200);
    const total = qr.body.bySource.reduce(
      (sum, row) => ({
        before: sum.before + (row.scans_before || 0),
        after: sum.after + (row.scans_after || 0)
      }),
      { before: 0, after: 0 }
    );
    expect(total).toEqual({ before: 2, after: 1 });
  });

  it('puts the scans on top of the funnel and counts every share against them', () => {
    const funnel = buildFunnel([
      { position: 0, step: 'rating', kind: 'rating', label: 'Bewertung', stopped: 4, completed: 0 },
      { position: 4, step: 'submitted', kind: 'submitted', label: null, stopped: 6, completed: 6 }
    ]);

    const combined = scanFunnel(funnel, { live: 20, before: 3, after: 2 });

    expect(combined).toMatchObject({ scanned: 20, scansBefore: 3, scansAfter: 2, scansCounted: true });
    expect(combined.steps.map((step) => [step.step, step.reached, step.dropped, step.share])).toEqual([
      ['scan', 20, 10, 100],
      ['rating', 10, 4, 50],
      ['submitted', 6, 0, 30]
    ]);
  });

  it('leaves the scan row off when a round has more visits than counted scans', () => {
    const funnel = buildFunnel([{ position: 0, step: 'rating', kind: 'rating', label: 'Bewertung', stopped: 5, completed: 5 }]);

    const combined = scanFunnel(funnel, { live: 2 });

    // Rounds from before the counting would otherwise show a top smaller than the step below it.
    expect(combined.scansCounted).toBe(false);
    expect(combined.steps.map((step) => step.step)).toEqual(['rating']);
    expect(combined.scanned).toBe(2);
  });
});
