import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { env } from '../src/config/env.js';
import { freshSetupCode } from './support/setupCode.js';

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
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null };
}

beforeAll(async () => {
  await runMigrations();
  await seedDefaultData();
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const setup = await request('POST', '/admin/setup/first-admin', {
    body: { setupCode: await freshSetupCode(), name: 'Owner', email: 'owner@example.test', password: 'test-password-123', organizationName: 'Beispiel Events' }
  });
  expect(setup.status).toBe(201);
  ownerCookie = setup.cookie;
  event = (await query("SELECT * FROM events WHERE slug = 'demo-nacht'")).rows[0];
}, 60_000);

afterAll(async () => {
  server?.close();
  await db.close();
});

describe('the wallboard of an organization', () => {
  it('reloads inside the bounds of its settings', async () => {
    const tooFast = await request('PATCH', '/admin/branding', { cookie: ownerCookie, body: { wallboardSettings: { dark_mode: true, refresh_seconds: 2 } } });
    const fine = await request('PATCH', '/admin/branding', { cookie: ownerCookie, body: { wallboardSettings: { dark_mode: false, refresh_seconds: 30 } } });

    expect(tooFast.status).toBe(400);
    expect(tooFast.body.error).toBe(`Das Wallboard lädt alle ${env.wallboardRefreshMinSeconds} bis ${env.wallboardRefreshMaxSeconds} Sekunden neu. Trag eine ganze Zahl in diesem Bereich ein.`);
    expect(fine.status).toBe(200);
    expect(fine.body.wallboard_settings).toEqual({ dark_mode: false, refresh_seconds: 30 });
  });

  it('shows the default of its setting where an organization entered nothing', async () => {
    await query("UPDATE organizations SET wallboard_settings = '{}'::jsonb WHERE id = $1", [event.organization_id]);
    const before = env.wallboardRefreshDefaultSeconds;
    env.wallboardRefreshDefaultSeconds = 20;
    try {
      const branding = await request('GET', '/admin/branding', { cookie: ownerCookie });

      expect(branding.body.wallboard_settings).toEqual({ dark_mode: true, refresh_seconds: 20 });
      expect(branding.body.wallboard_limits).toEqual({ minSeconds: env.wallboardRefreshMinSeconds, maxSeconds: env.wallboardRefreshMaxSeconds });
    } finally {
      env.wallboardRefreshDefaultSeconds = before;
    }
  });
});

describe('the feedback round of an event', () => {
  it('takes whole days and hours from zero up to the bounds of their settings', async () => {
    const answers = await Promise.all([
      request('PATCH', `/admin/events/${event.id}`, { cookie: ownerCookie, body: { feedbackWindowDays: -1 } }),
      request('PATCH', `/admin/events/${event.id}`, { cookie: ownerCookie, body: { feedbackWindowHours: 'viel' } }),
      request('PATCH', `/admin/events/${event.id}`, { cookie: ownerCookie, body: { feedbackWindowDays: env.feedbackWindowMaxDays + 1 } }),
      request('POST', '/admin/events', { cookie: ownerCookie, body: { name: 'Zu lang', dateFrom: '2026-10-01T18:00:00Z', feedbackWindowHours: env.feedbackWindowMaxHours + 1 } })
    ]);

    expect(answers.map((answer) => answer.status)).toEqual([400, 400, 400, 400]);
    expect(answers[0].body.error).toBe(`Die Tage der Bewertungsrunde müssen eine ganze Zahl von 0 bis ${env.feedbackWindowMaxDays} sein.`);
    expect(answers[1].body.error).toContain('Die Stunden der Bewertungsrunde');
    const stored = (await query('SELECT feedback_window_days FROM events WHERE id = $1', [event.id])).rows[0];
    expect(stored.feedback_window_days).toBe(event.feedback_window_days);

    const saved = await request('PATCH', `/admin/events/${event.id}`, { cookie: ownerCookie, body: { feedbackWindowDays: 5, feedbackWindowHours: 6 } });
    expect(saved.body).toMatchObject({ feedback_window_days: 5, feedback_window_hours: 6 });
  });
});

describe('the upcoming events after a rating', () => {
  it('keep as many hand-picked events as their setting allows, and the admin area learns the number', async () => {
    // The free plan holds two active events; the plan with room for more keeps this test about its own subject.
    await query("UPDATE organizations SET billing_override_plan = 'business' WHERE id = $1", [event.organization_id]);
    const others = [];
    for (const name of ['Eins', 'Zwei', 'Drei']) {
      const created = await request('POST', '/admin/events', { cookie: ownerCookie, body: { name, dateFrom: '2026-11-01T18:00:00Z' } });
      expect(created.status).toBe(201);
      others.push(created.body.id);
    }
    const before = env.upcomingEventsMax;
    env.upcomingEventsMax = 2;
    try {
      const saved = await request('PATCH', `/admin/events/${event.id}`, { cookie: ownerCookie, body: { upcomingEventIds: others } });
      const me = await request('GET', '/admin/me', { cookie: ownerCookie });

      expect(saved.body.upcoming_event_ids).toEqual(others.slice(0, 2));
      expect(me.body.settings).toMatchObject({ upcomingEventsMax: 2 });
    } finally {
      env.upcomingEventsMax = before;
    }
  });
});
