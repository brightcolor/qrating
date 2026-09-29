import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { env } from '../src/config/env.js';
import { issueResetLink } from '../src/services/passwordResetService.js';
import { freshSetupCode } from './support/setupCode.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let ownerCookie;

async function request(method, path, { body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null };
}

const tokenOf = (url) => new URL(url).searchParams.get('token');
const invite = (body) => request('POST', '/admin/users/invite', { cookie: ownerCookie, body });

// 40 umlauts are 40 characters and 80 bytes; bcrypt would read only the first 72 of them.
const tooLong = 'ä'.repeat(40);
const tooLongMessage = 'Das Passwort ist zu lang: qrating wertet höchstens 72 Byte aus, und Umlaute oder Sonderzeichen belegen je zwei bis vier davon. Kürze es bitte.';
const owner = { name: 'Owner', email: 'owner@example.test', organizationName: 'Beispiel Events' };

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
});

describe('a new password', () => {
  it('stays within the 72 bytes bcrypt reads, at the first setup as well', async () => {
    const setupCode = await freshSetupCode();
    const refused = await request('POST', '/admin/setup/first-admin', { body: { ...owner, setupCode, password: tooLong } });

    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe(tooLongMessage);

    const done = await request('POST', '/admin/setup/first-admin', { body: { ...owner, setupCode, password: 'a'.repeat(72) } });
    expect(done.status).toBe(201);
    ownerCookie = done.cookie;
    await query("UPDATE organizations SET billing_override_plan = 'business'");
  });

  it('is stored with the work factor of its setting', async () => {
    const invited = await invite({ email: 'kosten@example.test', role: 'analyst' });
    const before = env.passwordHashCost;
    env.passwordHashCost = 10;
    try {
      const accepted = await request('POST', '/admin/accept-invite', { body: { token: tokenOf(invited.body.inviteUrl), password: 'kosten-passwort-10' } });
      expect(accepted.status).toBe(200);
    } finally {
      env.passwordHashCost = before;
    }

    const { password_hash: hash } = (await query("SELECT password_hash FROM users WHERE email = 'kosten@example.test'")).rows[0];
    expect(hash).toMatch(/^\$2[ab]\$10\$/);
  });

  it('stays within the 72 bytes with an invitation and a reset link', async () => {
    const invited = await invite({ email: 'lang@example.test', role: 'analyst' });
    const accepted = await request('POST', '/admin/accept-invite', { body: { token: tokenOf(invited.body.inviteUrl), password: tooLong } });
    const user = (await query("SELECT * FROM users WHERE email = 'owner@example.test'")).rows[0];
    const reset = await request('POST', '/admin/password-reset/confirm', { body: { token: tokenOf(await issueResetLink({ query }, user)), password: tooLong } });

    expect([accepted.status, reset.status]).toEqual([400, 400]);
    expect([accepted.body.error, reset.body.error]).toEqual([tooLongMessage, tooLongMessage]);
    expect((await query("SELECT status FROM users WHERE email = 'lang@example.test'")).rows[0].status).toBe('invited');
  });

  it('tells every form how long it may be', async () => {
    const policy = await request('GET', '/admin/password-policy');

    expect(policy.body).toEqual({ minLength: env.passwordMinLength, maxBytes: 72 });
  });
});

describe('an invitation', () => {
  it('needs a role chosen on purpose', async () => {
    const refused = await invite({ email: 'ohne-rolle@example.test' });

    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('Wähle eine Rolle für die Person: Support, Analyst, Event Manager, Admin oder Owner.');
    expect((await query("SELECT count(*)::int AS count FROM users WHERE email = 'ohne-rolle@example.test'")).rows[0].count).toBe(0);
  });

  it('calls the person by the start of the address until they give their own name', async () => {
    const invited = await invite({ email: 'kim.beispiel@example.test', role: 'support', name: '  ' });

    expect(invited.body.user.name).toBe('kim.beispiel');
  });

  it('shows where it leads before the person chooses a password', async () => {
    const invited = await invite({ email: 'vorab@example.test', role: 'event_manager', name: 'Robin Vorab' });

    const preview = await request('POST', '/admin/accept-invite/preview', { body: { token: tokenOf(invited.body.inviteUrl) } });

    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ name: 'Robin Vorab', email: 'vorab@example.test', role: 'event_manager', organization: 'Beispiel Events' });
    expect(new Date(preview.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('says so at once when the link cannot be used any more', async () => {
    const invited = await invite({ email: 'abgelaufen@example.test', role: 'support' });
    await query("UPDATE users SET invite_expires_at = now() - interval '1 minute' WHERE email = 'abgelaufen@example.test'");

    const answers = await Promise.all([tokenOf(invited.body.inviteUrl), 'kein-gueltiger-token'].map((token) => request('POST', '/admin/accept-invite/preview', { body: { token } })));

    expect(answers.map((answer) => answer.status)).toEqual([400, 400]);
    expect(answers[0].body.error).toBe('Dieser Einladungslink ist ungültig oder abgelaufen. Bitte einen Owner deiner Organisation, dich erneut einzuladen.');
  });
});
