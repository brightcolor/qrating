import { once } from 'node:events';
import { format } from 'node:util';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { query } from '../src/db/pool.js';
import { app } from '../src/server.js';

vi.mock('../src/db/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  pool: { query: vi.fn() }
}));

let server;
let baseUrl;

async function readiness() {
  const response = await fetch(`${baseUrl}/health/ready`);
  return { status: response.status, body: await response.json() };
}

describe('the readiness check', () => {
  beforeAll(async () => {
    server = app.listen(0);
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => server?.close());

  afterEach(() => vi.restoreAllMocks());

  it('answers HTTP 200 while the database answers', async () => {
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 });

    expect(await readiness()).toEqual({ status: 200, body: { ok: true, database: 'ok' } });
  });

  it('answers a failing database with a general message and a reference, the details stand in the log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    query.mockRejectedValueOnce(Object.assign(
      new Error('password authentication failed for user "qrating" at db-intern.example:5432'),
      { code: '28P01' }
    ));

    const { status, body } = await readiness();

    expect(status).toBe(503);
    expect(body.reference).toMatch(/^[0-9A-F]{8}$/);
    expect(body).toEqual({
      ok: false,
      database: 'error',
      error: `qrating ist nicht bereit, die Prüfabfrage an die Datenbank ist gescheitert. Die Einzelheiten stehen im Log des Backends unter der Fehlerkennung ${body.reference}.`,
      reference: body.reference
    });
    expect(JSON.stringify(body)).not.toMatch(/password|db-intern|28P01/);

    const line = format(...log.mock.calls[0]);
    expect(line).toContain(`[Fehler ${body.reference}] GET /health/ready`);
    expect(line).toContain('password authentication failed for user "qrating" at db-intern.example:5432');
  });

  it('keeps the address of an unreachable database in the log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    query.mockRejectedValueOnce(Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { code: 'ECONNREFUSED', port: 5432 }));

    const { status, body } = await readiness();

    expect(status).toBe(503);
    expect(body.error).toContain(`Fehlerkennung ${body.reference}`);
    expect(JSON.stringify(body)).not.toMatch(/10\.0\.0\.5|ECONNREFUSED/);
    expect(format(...log.mock.calls[0])).toContain('connect ECONNREFUSED 10.0.0.5:5432');
  });
});
