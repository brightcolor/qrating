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
let organizationId;

async function request(method, path, { body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

// The planner looks at the clock; a fresh worker plans on its first call.
async function plan() {
  const worker = new JobWorker({ query });
  await worker.scheduleRecurringJobs();
}

const retentionJobs = async () => (await query(
  "SELECT id, status FROM background_jobs WHERE job_type = 'privacy.retention' AND organization_id = $1 ORDER BY created_at",
  [organizationId]
)).rows;

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
  ownerCookie = (await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.test', password: 'test-password-123' })
  })).headers.get('set-cookie').split(';')[0];
  organizationId = (await query('SELECT id FROM organizations LIMIT 1')).rows[0].id;
}, 60_000);

afterAll(async () => {
  server?.close();
  await db.close();
});

describe('the deletion runs of an organization', () => {
  it('start once per interval, also after the last run has finished', async () => {
    await plan();
    const [first] = await retentionJobs();
    await query("UPDATE background_jobs SET status = 'done' WHERE id = $1", [first.id]);

    await plan();

    expect(await retentionJobs()).toHaveLength(1);
  });

  it('start again once the interval of their setting has passed', async () => {
    const before = env.retentionIntervalHours;
    env.retentionIntervalHours = 2;
    try {
      await query("UPDATE background_jobs SET created_at = now() - interval '3 hours' WHERE job_type = 'privacy.retention'");

      await plan();

      expect(await retentionJobs()).toHaveLength(2);
    } finally {
      env.retentionIntervalHours = before;
    }
  });

  it('clear finished jobs after the days of their setting and keep failed ones', async () => {
    const insert = (status, days) => query(
      `INSERT INTO background_jobs (organization_id, job_type, payload, status, updated_at)
       VALUES ($1, 'newsletter.sync', '{}'::jsonb, $2, now() - ($3 * interval '1 day')) RETURNING id`,
      [organizationId, status, days]
    ).then((result) => result.rows[0].id);
    const old = await insert('done', 40);
    const failed = await insert('failed', 40);
    const recent = await insert('done', 5);

    await plan();
    const kept = (await query('SELECT id FROM background_jobs WHERE id = ANY($1::uuid[])', [[old, failed, recent]])).rows.map((row) => row.id);
    expect(kept.sort()).toEqual([failed, recent].sort());

    const before = env.jobHistoryDays;
    env.jobHistoryDays = 3;
    try {
      await plan();
      expect((await query('SELECT id FROM background_jobs WHERE id = $1', [recent])).rows).toHaveLength(0);
    } finally {
      env.jobHistoryDays = before;
    }
  });

  it('delete what each period allows, even when another period cannot be used', async () => {
    await query(
      `INSERT INTO newsletter_optins (organization_id, email, consent_text, consent_given_at)
       VALUES ($1, 'alt@example.test', 'Einwilligung', now() - interval '40 days')`,
      [organizationId]
    );
    // A period from before the bounds existed, far beyond the calendar.
    await query(
      'UPDATE organizations SET retention_feedback_days = 99999999, retention_newsletter_days = 30 WHERE id = $1',
      [organizationId]
    );

    const worker = new JobWorker({ query });
    await expect(worker.handlePrivacyRetention({ organization_id: organizationId }))
      .rejects.toThrow('Die Löschfrist für Bewertungen steht auf „99999999“');

    const left = (await query('SELECT count(*)::int AS count FROM newsletter_optins WHERE organization_id = $1', [organizationId])).rows[0].count;
    expect(left).toBe(0);
    await query('UPDATE organizations SET retention_feedback_days = NULL, retention_newsletter_days = NULL WHERE id = $1', [organizationId]);
  });
});

describe('the deletion periods an organization can enter', () => {
  it('stay inside the bounds of their settings, and the message names the bounds', async () => {
    const tooLong = await request('PATCH', '/admin/branding', { cookie: ownerCookie, body: { retentionLowRatingPhoneDays: 99999999 } });

    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toBe(`Die Löschfrist für Rückrufnummern muss eine ganze Zahl von ${env.retentionMinDays} bis ${env.retentionMaxDays} Tagen sein, zum Beispiel ${env.retentionPhoneDefaultDays}.`);
  });

  it('follow other bounds when the settings name them', async () => {
    const before = { min: env.retentionMinDays, max: env.retentionMaxDays };
    env.retentionMinDays = 7;
    env.retentionMaxDays = 400;
    try {
      const answers = await Promise.all([6, 7, 400, 401].map((days) => request('PATCH', '/admin/branding', { cookie: ownerCookie, body: { retentionFeedbackDays: days } })));

      expect(answers.map((answer) => answer.status)).toEqual([400, 200, 200, 400]);
      expect(answers[3].body.error).toContain('von 7 bis 400 Tagen');
    } finally {
      env.retentionMinDays = before.min;
      env.retentionMaxDays = before.max;
      await request('PATCH', '/admin/branding', { cookie: ownerCookie, body: { retentionFeedbackDays: '' } });
    }
  });

  it('are named on the form, so it offers what the server takes', async () => {
    const branding = await request('GET', '/admin/branding', { cookie: ownerCookie });

    expect(branding.body.retention_limits).toEqual({
      minDays: env.retentionMinDays,
      maxDays: env.retentionMaxDays,
      phoneDefaultDays: env.retentionPhoneDefaultDays
    });
  });
});
