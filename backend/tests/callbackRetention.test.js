import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { env } from '../src/config/env.js';
import { JobWorker } from '../src/services/jobService.js';
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
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null
  };
}

const setPhoneDays = (days) => query('UPDATE organizations SET retention_low_rating_phone_days = $2 WHERE id = $1', [event.organization_id, days]);

// A guest who gave one star and left a number for a call back.
async function leaveNumber(sessionKey) {
  const sent = await request('POST', `/public/events/${event.event_feedback_token}/feedback`, {
    body: {
      rating: 1,
      contactRequested: true,
      contactPhone: '0151 2345678',
      sourceType: 'dynamic',
      sessionKey,
      startedAt: new Date(Date.now() - 60_000).toISOString()
    }
  });
  expect(sent.status).toBe(201);
  return (await query(
    `SELECT lrc.id, extract(epoch FROM lrc.retention_until - lrc.created_at) / 86400 AS days
     FROM low_rating_cases lrc
     JOIN guest_sessions gs ON gs.feedback_response_id = lrc.feedback_response_id
     WHERE gs.event_id = $1 AND gs.session_key = $2`,
    [event.id, sessionKey]
  )).rows[0];
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

describe('a callback number stays as long as the privacy page says', () => {
  it('follows the period of the organization', async () => {
    await setPhoneDays(180);

    const left = await leaveNumber('rueckruf-180');

    expect(Number(left.days)).toBe(180);
  });

  it('follows the default of the installation where the organization holds no period', async () => {
    await setPhoneDays(0);
    const before = env.retentionPhoneDefaultDays;
    env.retentionPhoneDefaultDays = 45;
    try {
      const left = await leaveNumber('rueckruf-vorgabe');

      expect(Number(left.days)).toBe(45);
    } finally {
      env.retentionPhoneDefaultDays = before;
    }
  });

  it('starts a new organization with the default of the installation', async () => {
    const before = env.retentionPhoneDefaultDays;
    env.retentionPhoneDefaultDays = 30;
    try {
      const created = await request('POST', '/admin/platform/organizations', { cookie: ownerCookie, body: { name: 'Zweite Bühne' } });

      expect(created.status).toBe(201);
      const stored = (await query('SELECT retention_low_rating_phone_days AS days FROM organizations WHERE id = $1', [created.body.id])).rows[0];
      expect(stored.days).toBe(30);
    } finally {
      env.retentionPhoneDefaultDays = before;
    }
  });

  it('holds a period outside the bounds to the nearest bound', async () => {
    await setPhoneDays(env.retentionMaxDays + 1);

    const left = await leaveNumber('rueckruf-ausserhalb');

    expect(Number(left.days)).toBe(env.retentionMaxDays);
  });

  it('keeps the number past 90 days when the organization keeps numbers for 180', async () => {
    await setPhoneDays(180);
    const left = await leaveNumber('rueckruf-lang');
    // A hundred days later: the promise of 180 days still holds.
    await query(
      `UPDATE low_rating_cases
       SET created_at = created_at - interval '100 days', retention_until = retention_until - interval '100 days'
       WHERE id = $1`,
      [left.id]
    );

    await new JobWorker({ query }).handlePrivacyRetention({ organization_id: event.organization_id });

    const kept = (await query('SELECT contact_phone_encrypted IS NOT NULL AS has_phone FROM low_rating_cases WHERE id = $1', [left.id])).rows[0];
    expect(kept.has_phone).toBe(true);
  });
});

describe('the deletion run removes callback numbers on time', () => {
  const run = () => new JobWorker({ query }).handlePrivacyRetention({ organization_id: event.organization_id });
  const hasPhone = async (id) => (await query('SELECT contact_phone_encrypted IS NOT NULL AS has_phone FROM low_rating_cases WHERE id = $1', [id])).rows[0].has_phone;
  // Moves a case back in time: created that many days ago, promised until that many days from its creation.
  const age = (id, days, promisedDays) => query(
    `UPDATE low_rating_cases
     SET created_at = now() - ($2 * interval '1 day'),
         retention_until = now() - ($2 * interval '1 day') + ($3 * interval '1 day')
     WHERE id = $1`,
    [id, days, promisedDays]
  );

  it('deletes a number whose promised date has passed, even under a longer period now', async () => {
    await setPhoneDays(180);
    const left = await leaveNumber('lauf-zusage-vorbei');
    await age(left.id, 50, 45);

    await run();

    expect(await hasPhone(left.id)).toBe(false);
  });

  it('deletes a number older than a period shortened since', async () => {
    await setPhoneDays(180);
    const left = await leaveNumber('lauf-verkuerzt');
    await age(left.id, 100, 180);
    await setPhoneDays(30);

    await run();

    expect(await hasPhone(left.id)).toBe(false);
  });

  it('keeps a number inside both its promise and the current period', async () => {
    await setPhoneDays(45);
    const left = await leaveNumber('lauf-offen');
    await age(left.id, 20, 45);

    await run();

    expect(await hasPhone(left.id)).toBe(true);
  });

  it('still deletes when the stored period lies outside the bounds, and the privacy page names the period that holds', async () => {
    await setPhoneDays(env.retentionMaxDays + 1);
    const left = await leaveNumber('lauf-ausserhalb');
    await age(left.id, env.retentionMaxDays + 10, env.retentionMaxDays);

    await expect(run()).resolves.toBeUndefined();

    expect(await hasPhone(left.id)).toBe(false);
    const slug = (await query('SELECT slug FROM organizations WHERE id = $1', [event.organization_id])).rows[0].slug;
    const privacy = JSON.stringify((await request('GET', `/public/privacy/${slug}`)).body);
    expect(privacy).toContain(`${env.retentionMaxDays} Tage`);
  });
});
