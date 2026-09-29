import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';

// The limit is read when the routes load, so it is set before anything imports them.
vi.hoisted(() => {
  process.env.PROGRESS_RATE_LIMIT_MAX = '3';
});

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

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
  delete process.env.PROGRESS_RATE_LIMIT_MAX;
});

describe('the step reports of the guest page', () => {
  it('stop at the limit of their setting, with a message for the guest', async () => {
    const { event_feedback_token: token } = (await query("SELECT event_feedback_token FROM events WHERE slug = 'demo-nacht'")).rows[0];
    const statuses = [];
    let refusal = null;
    for (let step = 0; step < 4; step += 1) {
      const response = await fetch(`${baseUrl}/public/events/${token}/progress`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey: 'gast-mit-vielen-schritten', step: `schritt-${step}`, stepIndex: step, stepsTotal: 4 })
      });
      statuses.push(response.status);
      if (response.status === 429) refusal = await response.json();
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(refusal.error).toBe('Von diesem Anschluss kamen gerade sehr viele Anfragen. Bitte lade die Seite in einem Moment neu.');
  });
});
