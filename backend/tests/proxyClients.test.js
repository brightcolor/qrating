import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';

// A tunnel or reverse proxy in front of the frontend nginx makes two proxy hops.
vi.hoisted(() => {
  process.env.TRUST_PROXY = '2';
});

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

describe('guests behind two proxy hops', () => {
  let server;
  let baseUrl;

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
    delete process.env.TRUST_PROXY;
  });

  it('records each guest under the address the outer proxy reported', async () => {
    const { event_feedback_token: token } = (await query(
      "SELECT event_feedback_token FROM events WHERE slug = 'demo-nacht'"
    )).rows[0];

    for (const guest of ['203.0.113.10', '203.0.113.11']) {
      const response = await fetch(`${baseUrl}/public/events/${token}/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `${guest}, 172.18.0.1` },
        body: JSON.stringify({ rating: 5 })
      });
      expect(response.status).toBe(201);
    }

    const hashes = await query('SELECT ip_hash FROM feedback_responses ORDER BY submitted_at');
    expect(hashes.rows.map((row) => row.ip_hash)).toEqual([sha256('203.0.113.10'), sha256('203.0.113.11')]);
  });
});
