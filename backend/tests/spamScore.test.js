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
let token;

async function request(method, path, { body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null };
}

// Runs a check with other values for settings and puts the old ones back.
async function withSettings(values, check) {
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, env[key]]));
  Object.assign(env, values);
  try {
    await check();
  } finally {
    Object.assign(env, before);
  }
}

// A form sent right after it opened, with or without the hidden field filled in. With a visit, the
// guest tapped the stars first, and the form completes that vote.
async function send(honeypot, visit = null) {
  if (visit) {
    const tapped = await request('POST', `/public/events/${token}/rating`, { body: { rating: 5, sessionKey: visit } });
    expect(tapped.status).toBe(201);
  }
  const answer = await request('POST', `/public/events/${token}/feedback`, {
    body: { rating: 5, startedAt: new Date().toISOString(), honeypot: honeypot ? 'bot' : '', ...(visit ? { sessionKey: visit } : {}) }
  });
  expect(answer.status).toBe(201);
  return (await query('SELECT spam_score, is_suspicious FROM feedback_responses ORDER BY completed_at DESC NULLS LAST LIMIT 1')).rows[0];
}

const antiSpam = (body) => request('PATCH', '/admin/anti-spam-settings', { cookie: ownerCookie, body });

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
  token = (await query("SELECT event_feedback_token FROM events WHERE slug = 'demo-nacht'")).rows[0].event_feedback_token;
}, 60_000);

afterAll(async () => {
  server?.close();
  await db.close();
});

describe('the spam points of a form', () => {
  it('follow the points and the threshold of the settings', async () => {
    await query("UPDATE organizations SET anti_spam_settings = '{}'::jsonb");
    await withSettings({ spamScoreHoneypot: 50, spamScoreTooFast: 7, spamSuspiciousScore: 55 }, async () => {
      expect(await send(false)).toEqual({ spam_score: '7', is_suspicious: false });
      expect(await send(true)).toEqual({ spam_score: '57', is_suspicious: true });
      await withSettings({ antiSpamMinSecondsDefault: 0 }, async () => {
        expect(await send(true)).toEqual({ spam_score: '50', is_suspicious: false });
      });
    });
  });

  it('follow the threshold as well when the form completes a tapped vote', async () => {
    await withSettings({ spamScoreHoneypot: 50, spamScoreTooFast: 7, spamSuspiciousScore: 55, antiSpamMinSecondsDefault: 0 }, async () => {
      expect(await send(true, 'gast-mit-sternen')).toEqual({ spam_score: '50', is_suspicious: false });
    });
    await withSettings({ spamScoreHoneypot: 50, spamSuspiciousScore: 45, antiSpamMinSecondsDefault: 0 }, async () => {
      expect(await send(true, 'zweiter-gast-mit-sternen')).toEqual({ spam_score: '50', is_suspicious: true });
    });
  });

  it('count a form as too fast by the minimum time of the setting while the organization names none', async () => {
    await query("UPDATE organizations SET anti_spam_settings = '{}'::jsonb");

    await withSettings({ antiSpamMinSecondsDefault: 0 }, async () => {
      expect(await send(false)).toEqual({ spam_score: '0', is_suspicious: false });
    });
    expect((await send(false)).spam_score).toBe(String(env.spamScoreTooFast));
  });
});

describe('the minimum time an organization enters', () => {
  it('stays within the bound of its setting, and the message names it', async () => {
    const answers = await Promise.all([0, 60, 61, -1, 2.5, 'drei'].map((minSeconds) => antiSpam({ minSeconds })));

    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 400, 400, 400, 400]);
    expect(answers[2].body.error).toBe(`Die Mindestzeit bis zum Absenden muss eine ganze Zahl von 0 bis 60 Sekunden sein, zum Beispiel ${env.antiSpamMinSecondsDefault}.`);
  });

  it('follows another bound and another default', async () => {
    await withSettings({ antiSpamMinSecondsMax: 90, antiSpamMinSecondsDefault: 8 }, async () => {
      expect((await antiSpam({ minSeconds: 90 })).status).toBe(200);
      expect((await antiSpam({ minSeconds: '' })).body.min_seconds).toBe(8);
    });
  });

  it('switches the trap field only with a yes or a no', async () => {
    const refused = await antiSpam({ minSeconds: 3, honeypotEnabled: 'nein' });

    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('Ob das Fangfeld gegen Bots mitläuft, steht im Feld „honeypotEnabled“ als true oder false.');
  });

  it('comes with its bounds to the form', async () => {
    const branding = await request('GET', '/admin/branding', { cookie: ownerCookie });

    expect(branding.body.anti_spam_limits).toEqual({ defaultSeconds: env.antiSpamMinSecondsDefault, maxSeconds: env.antiSpamMinSecondsMax });
  });
});
