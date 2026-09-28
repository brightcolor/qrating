import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { env } from '../src/config/env.js';
import { announceSetupCode, issueSetupCode } from '../src/services/setupService.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;

async function request(method, path, { body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null
  };
}

const owner = { name: 'Betreiberin', email: 'betrieb@example.test', password: 'test-password-123', organizationName: 'Beispiel Events' };

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

describe('the first setup of an installation', () => {
  it('seeds no example addresses into the organization it prepares', async () => {
    const organization = (await query('SELECT ticketshop_url, website_url, instagram_url FROM organizations')).rows[0];

    expect(organization).toEqual({ ticketshop_url: null, website_url: null, instagram_url: null });
  });

  it('is open while there is no account, and names the rules of the form', async () => {
    const status = await request('GET', '/admin/setup/status');

    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ setupRequired: true, passwordMinLength: env.passwordMinLength, setupCodeCommand: env.setupCodeCommand });
    expect(status.body.userCount).toBeUndefined();
  });

  it('leads every public page to the setup while it is open', async () => {
    const site = await request('GET', '/public/site');

    expect(site.status).toBe(200);
    expect(site.headers.get('x-qrating-setup')).toBe('open');
    expect(site.headers.get('x-qrating-setup-url')).toBe(`${env.adminAppUrl}/admin`);
    // A cached copy would carry the header into a later answer 304, after the setup is done.
    expect(site.headers.get('cache-control')).toBe('no-store');
  });

  it('writes a fresh code to the log, and the fresh code replaces the one before', async () => {
    const lines = [];
    const first = await issueSetupCode({ query });

    const second = await announceSetupCode({ query }, (line) => lines.push(line));

    expect(second).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(lines.join('\n')).toContain(second);
    expect(lines.join('\n')).toContain(env.setupCodeCommand);
    const stale = await request('POST', '/admin/setup/first-admin', { body: { ...owner, setupCode: first } });
    expect(stale.status).toBe(403);
  });

  it('refuses the first account without the right code, and says where the code is', async () => {
    const without = await request('POST', '/admin/setup/first-admin', { body: owner });
    const wrong = await request('POST', '/admin/setup/first-admin', { body: { ...owner, setupCode: 'AAAA-BBBB-CCCC-DDDD' } });

    expect([without.status, wrong.status]).toEqual([403, 403]);
    expect(wrong.body.error).toContain('Log des Backends');
    expect(wrong.body.error).toContain(env.setupCodeCommand);
    expect((await query('SELECT count(*)::int AS count FROM users')).rows[0].count).toBe(0);
  });

  it('takes a password only from the length of its setting on', async () => {
    const before = env.passwordMinLength;
    env.passwordMinLength = 20;
    try {
      const code = await issueSetupCode({ query });
      const short = await request('POST', '/admin/setup/first-admin', { body: { ...owner, password: 'neunzehn-zeichen-ab', setupCode: code } });

      expect(short.status).toBe(400);
      expect(short.body.error).toBe('Das Passwort muss mindestens 20 Zeichen lang sein.');
    } finally {
      env.passwordMinLength = before;
    }
  });

  it('creates the first account with the code, typed in any case, and closes the setup for good', async () => {
    const code = await issueSetupCode({ query });

    const created = await request('POST', '/admin/setup/first-admin', { body: { ...owner, setupCode: ` ${code.toLowerCase()} ` } });

    expect(created.status).toBe(201);
    expect(created.cookie).toMatch(new RegExp(`^${env.adminCookieName}=`));
    expect((await query('SELECT count(*)::int AS count FROM setup_codes')).rows[0].count).toBe(0);
    const audit = (await query("SELECT action FROM audit_log WHERE action = 'admin.first_user_created'")).rows;
    expect(audit).toHaveLength(1);

    const status = await request('GET', '/admin/setup/status');
    const again = await request('POST', '/admin/setup/first-admin', { body: { ...owner, email: 'zweite@example.test', setupCode: code } });
    expect([status.status, again.status]).toEqual([404, 404]);
    expect(status.body.error).toBe('Die Ersteinrichtung ist abgeschlossen. Melde dich mit deinem Konto an.');
    expect(status.body.organization).toBeUndefined();
  });

  it('writes no code to the log once an account exists', async () => {
    const lines = [];

    expect(await announceSetupCode({ query }, (line) => lines.push(line))).toBe(null);
    expect(lines).toEqual([]);
  });

  it('leads no public page to the setup afterwards', async () => {
    const site = await request('GET', '/public/site');

    expect(site.headers.get('x-qrating-setup')).toBe(null);
  });

  it('tells every form the length a password needs', async () => {
    const policy = await request('GET', '/admin/password-policy');

    expect(policy.status).toBe(200);
    expect(policy.body).toEqual({ minLength: env.passwordMinLength });
  });
});
