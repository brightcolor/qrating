import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let platformCookie;
let tenantCookie;
let secondOrganizationId;

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

describe('platform administration', () => {
  beforeAll(async () => {
    await runMigrations();
    await seedDefaultData();
    server = app.listen(0);
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const setup = await request('POST', '/admin/setup/first-admin', {
      body: {
        name: 'Platform Owner',
        email: 'platform@example.test',
        password: 'test-password-123',
        organizationName: 'HSP-Events'
      }
    });
    expect(setup.status).toBe(201);
    platformCookie = setup.cookie;
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await db.close();
  });

  it('makes the account of the first setup the platform administrator', async () => {
    const me = await request('GET', '/admin/me', { cookie: platformCookie });

    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      platformAdmin: true,
      acting: false,
      organization_slug: 'hsp-events',
      home_organization_slug: 'hsp-events'
    });
  });

  it('lists every organization with its numbers', async () => {
    const list = await request('GET', '/admin/platform/organizations', { cookie: platformCookie });

    expect(list.status).toBe(200);
    expect(list.body.organizations).toHaveLength(1);
    expect(list.body.organizations[0]).toMatchObject({ slug: 'hsp-events', name: 'HSP-Events', events: 1, users: 1 });
    expect(list.body.acting).toBe(false);
  });

  it('creates another tenant and keeps its slug unique', async () => {
    const created = await request('POST', '/admin/platform/organizations', {
      cookie: platformCookie,
      body: { name: 'Stadthalle Wismar' }
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ slug: 'stadthalle-wismar', events: 0, users: 0 });
    secondOrganizationId = created.body.id;

    const again = await request('POST', '/admin/platform/organizations', {
      cookie: platformCookie,
      body: { name: 'Stadthalle Wismar' }
    });
    expect(again.status).toBe(409);
    expect(again.body.error).toContain('stadthalle-wismar');

    const empty = await request('POST', '/admin/platform/organizations', { cookie: platformCookie, body: { name: '  ' } });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toContain('Namen');
  });

  it('works inside the tenant after entering it and returns home afterwards', async () => {
    const event = await request('POST', '/admin/events', {
      cookie: platformCookie,
      body: { name: 'Eigenes Event', dateFrom: '2026-10-01T18:00:00.000Z' }
    });
    expect(event.status).toBe(201);

    const entered = await request('POST', `/admin/platform/organizations/${secondOrganizationId}/enter`, { cookie: platformCookie });
    expect(entered.status).toBe(200);
    expect(entered.body).toMatchObject({ acting: true, organization: { slug: 'stadthalle-wismar' } });
    tenantCookie = entered.cookie;

    const me = await request('GET', '/admin/me', { cookie: tenantCookie });
    expect(me.body).toMatchObject({ acting: true, organization_slug: 'stadthalle-wismar', home_organization_slug: 'hsp-events' });

    // The new tenant starts empty; the events of the home organization stay there.
    const events = await request('GET', '/admin/events', { cookie: tenantCookie });
    expect(events.body).toEqual([]);

    const left = await request('POST', '/admin/platform/leave', { cookie: tenantCookie });
    expect(left.status).toBe(200);
    expect(left.body).toMatchObject({ acting: false, organization: { slug: 'hsp-events' } });

    const home = await request('GET', '/admin/events', { cookie: left.cookie });
    expect(home.body.map((item) => item.name)).toContain('Eigenes Event');
  });

  it('writes every visit into the audit log', async () => {
    const entries = await query(
      `SELECT action, entity_id FROM audit_log
       WHERE action LIKE 'platform.%'
       ORDER BY created_at`
    );

    expect(entries.rows.map((row) => row.action)).toEqual([
      'platform.organization.created',
      'platform.organization.entered',
      'platform.organization.left'
    ]);
    expect(entries.rows[1].entity_id).toBe(secondOrganizationId);
  });

  it('keeps the platform area away from accounts of a single tenant', async () => {
    const created = await query(
      `INSERT INTO users (organization_id, name, email, password_hash, role, status)
       VALUES ((SELECT id FROM organizations WHERE slug = 'hsp-events'), 'Team Mitglied', 'team@example.test', 'x', 'admin', 'active')
       RETURNING id`
    );
    const { signAdmin } = await import('../src/middleware/auth.js');
    const user = (await query('SELECT * FROM users WHERE id = $1', [created.rows[0].id])).rows[0];
    const cookie = `qrating_admin=${signAdmin(user)}`;

    const list = await request('GET', '/admin/platform/organizations', { cookie });

    expect(list.status).toBe(403);
    expect(list.body.error).toContain('Plattform-Verwaltung');
  });
});
