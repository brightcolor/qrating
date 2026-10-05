import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { totpCode } from '../src/services/twoFactorService.js';
import { freshSetupCode } from './support/setupCode.js';

// The limit is read when the routes load, so it is set before anything imports them. The first
// setup counts as one attempt, two wrong codes as two more.
vi.hoisted(() => {
  process.env.AUTH_RATE_LIMIT_MAX = '3';
});

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
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null };
}

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
  delete process.env.AUTH_RATE_LIMIT_MAX;
});

describe('the code that confirms a second factor', () => {
  it('can be guessed only as often as the limit for sign-in attempts allows', async () => {
    const setup = await request('POST', '/admin/setup/first-admin', {
      body: { setupCode: await freshSetupCode(), name: 'Owner', email: 'owner@example.test', password: 'test-password-123', organizationName: 'Beispiel Events' }
    });
    expect(setup.status).toBe(201);
    const started = await request('POST', '/admin/2fa/setup', { cookie: setup.cookie, body: {} });
    expect(started.status).toBe(200);

    const guesses = [];
    for (const code of ['falsch', 'auch-falsch', totpCode(started.body.secret)]) {
      guesses.push(await request('POST', '/admin/2fa/confirm', { cookie: setup.cookie, body: { code } }));
    }

    expect(guesses.map((guess) => guess.status)).toEqual([400, 400, 429]);
    expect(guesses[2].body.error).toBe('Zu viele Anmeldeversuche von diesem Anschluss. Bitte warte 15 Minuten und versuche es dann erneut.');
  });

  it('counts before the session is checked, also when the second factor is switched off', async () => {
    const confirm = await request('POST', '/admin/2fa/confirm', { body: { code: '123456' } });
    const disable = await request('POST', '/admin/2fa/disable', { body: { password: 'test-password-123', code: '123456' } });

    expect(confirm.status).toBe(429);
    expect(disable.status).toBe(429);
  });
});
