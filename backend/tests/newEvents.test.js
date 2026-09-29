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
let organizationId;

async function request(method, path, { body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null };
}

const createEvent = (body) => request('POST', '/admin/events', { cookie: ownerCookie, body: { dateFrom: '2026-10-01T18:00:00.000Z', ...body } });

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
  organizationId = (await query('SELECT id FROM organizations LIMIT 1')).rows[0].id;
  // Enough events for every case below.
  await query("UPDATE organizations SET billing_override_plan = 'business', default_feedback_window_days = 5, default_feedback_start_mode = 'event_end' WHERE id = $1", [organizationId]);
}, 60_000);

afterAll(async () => {
  server?.close();
  await db.close();
});

describe('a new event', () => {
  it('takes the round of the organization when the request leaves it empty', async () => {
    const created = await createEvent({ name: 'Leeres Feld', feedbackWindowDays: '', feedbackWindowHours: '' });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ feedback_window_days: 5, feedback_window_hours: null, feedback_starts_mode: 'event_end' });
  });

  it('keeps the round the request names, a round of none included', async () => {
    const created = await createEvent({ name: 'Ohne Runde', feedbackWindowDays: 0, feedbackStartsMode: 'event_start' });

    expect(created.body).toMatchObject({ feedback_window_days: 0, feedback_starts_mode: 'event_start' });
  });

  it('runs in the time zone of the setting when the request names none', async () => {
    const before = env.defaultTimezone;
    env.defaultTimezone = 'America/New_York';
    try {
      const created = await createEvent({ name: 'Ohne Zeitzone' });

      expect(created.body.event_timezone).toBe('America/New_York');
    } finally {
      env.defaultTimezone = before;
    }
    expect((await createEvent({ name: 'Mit Zeitzone', eventTimezone: 'Europe/Lisbon' })).body.event_timezone).toBe('Europe/Lisbon');
  });

  it('refuses a time zone nobody knows, and names it', async () => {
    const refused = await createEvent({ name: 'Auf dem Mars', eventTimezone: 'Mars/Olympus' });

    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe(`Die Zeitzone „Mars/Olympus“ kennt qrating nicht. Nutze einen Namen wie „${env.defaultTimezone}“, oder lass das Feld leer.`);
  });

  it('refuses a start of the round nobody knows', async () => {
    const refused = await createEvent({ name: 'Irgendwann', feedbackStartsMode: 'irgendwann' });

    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/mit dem Event .*mit seinem Ende .*eigenen Zeit/);
    expect((await query("SELECT count(*)::int AS count FROM events WHERE name = 'Irgendwann'")).rows[0].count).toBe(0);
  });
});
