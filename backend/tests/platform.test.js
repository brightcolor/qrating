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

  it('lets the platform role unlock a plan, and nobody else', async () => {
    const unlocked = await request('PATCH', '/admin/billing/override', {
      cookie: platformCookie,
      body: { plan: 'business', reason: 'Plattform-Freischaltung' }
    });
    expect(unlocked.status).toBe(200);
    expect(unlocked.body.billing).toMatchObject({ overridePlan: 'business', canOverride: true, effectivePlan: 'business' });

    const created = await query(
      `INSERT INTO users (organization_id, name, email, password_hash, role, status)
       VALUES ((SELECT id FROM organizations WHERE slug = 'hsp-events'), 'Eigene Admina', 'admina@example.test', 'x', 'admin', 'active')
       RETURNING id`
    );
    const { signAdmin } = await import('../src/middleware/auth.js');
    const user = (await query('SELECT * FROM users WHERE id = $1', [created.rows[0].id])).rows[0];

    const refused = await request('PATCH', '/admin/billing/override', {
      cookie: `qrating_admin=${signAdmin(user)}`,
      body: { plan: 'business' }
    });

    expect(refused.status).toBe(403);
    expect(refused.body.error).toContain('Plattform-Admins');
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

  it('sends the report of a visited tenant to the platform account itself', async () => {
    const entered = await request('POST', `/admin/platform/organizations/${secondOrganizationId}/enter`, { cookie: platformCookie });
    const visiting = entered.cookie;
    const organization = (await query("SELECT id FROM organizations WHERE slug = 'stadthalle-wismar'")).rows[0];
    const event = (await query(
      `INSERT INTO events (organization_id, source, name, slug, event_feedback_token, date_from, event_timezone, status)
       VALUES ($1, 'manual', 'Abend im Haus', 'abend-im-haus', 'token-abend', now(), 'Europe/Berlin', 'active')
       RETURNING id`,
      [organization.id]
    )).rows[0];
    await query(
      `INSERT INTO smtp_settings (organization_id, host, port, from_email, enabled)
       VALUES ($1, 'mail.example.com', 587, 'feedback@example.com', true)
       ON CONFLICT (organization_id) DO UPDATE SET enabled = true`,
      [organization.id]
    );

    const sent = await request('POST', `/admin/events/${event.id}/report-email`, { cookie: visiting, body: {} });

    // The account of a platform admin lives in its home organization, never in the visited one.
    expect(sent.status).toBe(202);
    const job = (await query("SELECT payload FROM background_jobs WHERE job_type = 'report.email' ORDER BY created_at DESC LIMIT 1")).rows[0];
    const platformUser = (await query("SELECT id FROM users WHERE email = 'platform@example.test'")).rows[0];
    expect(job.payload.userId).toBe(platformUser.id);
  });

  it('refuses the report for an account of some other tenant', async () => {
    const entered = await request('POST', `/admin/platform/organizations/${secondOrganizationId}/enter`, { cookie: platformCookie });
    const organization = (await query("SELECT id FROM organizations WHERE slug = 'stadthalle-wismar'")).rows[0];
    const event = (await query('SELECT id FROM events WHERE organization_id = $1 LIMIT 1', [organization.id])).rows[0];
    const home = (await query("SELECT id FROM organizations WHERE slug = 'hsp-events'")).rows[0];
    const stranger = (await query(
      `INSERT INTO users (organization_id, name, email, password_hash, role, status)
       VALUES ($1, 'Fremd', 'fremd@example.test', 'x', 'owner', 'active') RETURNING id`,
      [home.id]
    )).rows[0];

    const sent = await request('POST', `/admin/events/${event.id}/report-email`, {
      cookie: entered.cookie,
      body: { userId: stranger.id }
    });

    // Only the own account reaches across; everyone else stays inside the visited tenant.
    expect(sent.status).toBe(404);
    expect(sent.body.message || sent.body.error).toMatch(/Benutzerkonto/);
  });

});
