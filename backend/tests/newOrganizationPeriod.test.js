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

async function withPhoneDefault(days, run) {
  const before = env.retentionPhoneDefaultDays;
  env.retentionPhoneDefaultDays = days;
  try {
    return await run();
  } finally {
    env.retentionPhoneDefaultDays = before;
  }
}

const storedPeriods = async () => (await query('SELECT retention_low_rating_phone_days AS days FROM organizations')).rows.map((row) => row.days);

// No seed here: each test decides how the first organization comes about.
beforeAll(async () => {
  await runMigrations();
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}, 60_000);

afterAll(async () => {
  server?.close();
  await db.close();
});

describe('a new organization starts with the period of the installation for callback numbers', () => {
  it('when the first start seeds it', async () => {
    await withPhoneDefault(30, () => seedDefaultData());

    expect(await storedPeriods()).toEqual([30]);
  });

  it('when the first setup creates it', async () => {
    await query('DELETE FROM organizations');

    const setup = await withPhoneDefault(25, async () => {
      const response = await fetch(`${baseUrl}/admin/setup/first-admin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupCode: await freshSetupCode(), name: 'Owner', email: 'owner@example.test', password: 'test-password-123', organizationName: 'Beispiel Events' })
      });
      return response.status;
    });

    expect(setup).toBe(201);
    expect(await storedPeriods()).toEqual([25]);
  });
});
