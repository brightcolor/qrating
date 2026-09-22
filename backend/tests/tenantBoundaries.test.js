import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { signAdmin } from '../src/middleware/auth.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let platformCookie;
let foreignEvent;
let other;

async function request(method, path, { body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* a file or an empty answer */ }
  return {
    status: response.status,
    body: parsed,
    cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null
  };
}

async function account(organizationId, email, role, extra = '') {
  const user = (await query(
    `INSERT INTO users (organization_id, name, email, password_hash, role, status)
     VALUES ($1, $2, $3, 'x', $4, 'active')
     RETURNING *`,
    [organizationId, email.split('@')[0], email, role]
  )).rows[0];
  if (extra) await query(`UPDATE users SET ${extra} WHERE id = $1`, [user.id]);
  return { user, cookie: `qrating_admin=${signAdmin(user)}` };
}

const tokenOf = (url) => new URL(url).searchParams.get('token');

beforeAll(async () => {
  await runMigrations();
  await seedDefaultData();
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const setup = await request('POST', '/admin/setup/first-admin', {
    body: { name: 'Plattform', email: 'plattform@example.test', password: 'test-password-123', organizationName: 'Beispiel Events' }
  });
  expect(setup.status).toBe(201);
  platformCookie = setup.cookie;
  foreignEvent = (await query("SELECT * FROM events WHERE slug = 'demo-nacht'")).rows[0];

  // A second tenant on the plan with teams, with its own owner and event manager.
  const organization = (await query(
    `INSERT INTO organizations (name, slug, billing_override_plan)
     VALUES ('Stadthalle Beispiel', 'stadthalle-beispiel', 'business')
     RETURNING *`
  )).rows[0];
  other = {
    organization,
    owner: await account(organization.id, 'owner@stadthalle.test', 'owner'),
    manager: await account(organization.id, 'manager@stadthalle.test', 'event_manager')
  };
}, 60_000);

afterAll(async () => {
  server?.close();
  await db.close();
});

describe('the events of another organization', () => {
  it('stay closed to every role of a tenant, the owner included', async () => {
    for (const who of [other.owner, other.manager]) {
      const analytics = await request('GET', `/admin/events/${foreignEvent.id}/analytics`, { cookie: who.cookie });

      expect(analytics.status).toBe(404);
      expect(analytics.body.error).toContain('anderen Organisation');
      expect(JSON.stringify(analytics.body)).not.toContain('voices');
    }
  });

  it('stay closed on every page that reads or acts on an event', async () => {
    const cookie = other.owner.cookie;
    const id = foreignEvent.id;

    const answers = await Promise.all([
      request('GET', `/admin/events/${id}/qr-analytics`, { cookie }),
      request('GET', `/admin/events/${id}/image-cache`, { cookie }),
      request('POST', `/admin/events/${id}/report-email`, { cookie, body: {} }),
      request('GET', `/admin/events/${id}/assignments`, { cookie }),
      request('PUT', `/admin/events/${id}/assignments`, { cookie, body: { assignments: [{ userId: other.manager.user.id, assigned: true }] } }),
      request('POST', '/admin/forms', { cookie, body: { eventId: id, name: 'Fremdes Formular' } }),
      request('GET', `/admin/low-rating-cases?eventId=${id}`, { cookie })
    ]);

    expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404, 404, 404, 404]);
    const strays = await query(
      `SELECT (SELECT count(*) FROM user_event_assignments WHERE event_id = $1 AND organization_id = $2)::int AS assignments,
              (SELECT count(*) FROM feedback_forms WHERE event_id = $1 AND organization_id = $2)::int AS forms`,
      [id, other.organization.id]
    );
    expect(strays.rows[0]).toEqual({ assignments: 0, forms: 0 });
  });

  it('keeps the own events open to the own organization', async () => {
    const analytics = await request('GET', `/admin/events/${foreignEvent.id}/analytics`, { cookie: platformCookie });

    expect(analytics.status).toBe(200);
    expect(Array.isArray(analytics.body.voices)).toBe(true);
  });

  it('shows an account below event manager only the events it is assigned to', async () => {
    const support = await account(foreignEvent.organization_id, 'support@beispiel.test', 'support');

    const refused = await request('GET', `/admin/events/${foreignEvent.id}/analytics`, { cookie: support.cookie });
    const list = await request('GET', '/admin/events?stats=1', { cookie: support.cookie });

    expect(refused.status).toBe(403);
    expect(list.body.map((event) => event.id)).not.toContain(foreignEvent.id);

    await query(
      'INSERT INTO user_event_assignments (organization_id, user_id, event_id) VALUES ($1, $2, $3)',
      [foreignEvent.organization_id, support.user.id, foreignEvent.id]
    );
    const allowed = await request('GET', `/admin/events/${foreignEvent.id}/analytics`, { cookie: support.cookie });
    expect(allowed.status).toBe(200);
  });
});

describe('an invitation', () => {
  it('leaves an account of another organization untouched, the platform account included', async () => {
    const before = (await query("SELECT * FROM users WHERE email = 'plattform@example.test'")).rows[0];

    const invited = await request('POST', '/admin/users/invite', {
      cookie: other.owner.cookie,
      body: { email: 'plattform@example.test', name: 'Übernahme', role: 'owner' }
    });

    expect(invited.status).toBe(409);
    expect(invited.body.error).toContain('schon ein Konto');
    expect(invited.body.inviteUrl).toBeUndefined();
    const after = (await query("SELECT * FROM users WHERE email = 'plattform@example.test'")).rows[0];
    expect(after).toMatchObject({ status: 'active', role: before.role, name: before.name, invite_token_hash: null, organization_id: before.organization_id });
    const login = await request('POST', '/admin/login', { body: { email: 'plattform@example.test', password: 'test-password-123' } });
    expect(login.status).toBe(200);
  });

  it('leaves an open invitation of another organization untouched as well', async () => {
    await query(
      `INSERT INTO users (organization_id, name, email, password_hash, role, status, invite_token_hash, invite_expires_at)
       VALUES ($1, 'Offen', 'offen@beispiel.test', 'x', 'support', 'invited', 'hash-der-ersten-einladung', now() + interval '7 days')`,
      [foreignEvent.organization_id]
    );

    const invited = await request('POST', '/admin/users/invite', { cookie: other.owner.cookie, body: { email: 'offen@beispiel.test', role: 'owner' } });

    expect(invited.status).toBe(409);
    const row = (await query("SELECT organization_id, role, invite_token_hash FROM users WHERE email = 'offen@beispiel.test'")).rows[0];
    expect(row).toEqual({ organization_id: foreignEvent.organization_id, role: 'support', invite_token_hash: 'hash-der-ersten-einladung' });
  });

  it('renews an open invitation of the own organization, and only the newest link works', async () => {
    const first = await request('POST', '/admin/users/invite', { cookie: other.owner.cookie, body: { email: 'neu@stadthalle.test', role: 'analyst' } });
    const second = await request('POST', '/admin/users/invite', { cookie: other.owner.cookie, body: { email: 'neu@stadthalle.test', role: 'support' } });

    expect([first.status, second.status]).toEqual([201, 201]);
    const stale = await request('POST', '/admin/accept-invite', { body: { token: tokenOf(first.body.inviteUrl), password: 'neues-passwort-123' } });
    expect(stale.status).toBe(400);
    const accepted = await request('POST', '/admin/accept-invite', { body: { token: tokenOf(second.body.inviteUrl), password: 'neues-passwort-123' } });
    expect(accepted.status).toBe(200);
    expect(accepted.cookie).toMatch(/^qrating_admin=/);
    expect(accepted.body.user).toMatchObject({ email: 'neu@stadthalle.test', role: 'support' });
  });

  it('refuses an account of the own team that is already in use', async () => {
    const invited = await request('POST', '/admin/users/invite', { cookie: other.owner.cookie, body: { email: 'manager@stadthalle.test', role: 'support' } });

    expect(invited.status).toBe(409);
    expect(invited.body.error).toContain('Einstellungen → Team');
    const row = (await query("SELECT role, status FROM users WHERE email = 'manager@stadthalle.test'")).rows[0];
    expect(row).toEqual({ role: 'event_manager', status: 'active' });
  });
});

describe('an account with a second factor', () => {
  it('gets no session from a reset link alone', async () => {
    const guarded = await account(other.organization.id, 'zweiter-faktor@stadthalle.test', 'admin', 'two_factor_enabled = true');
    const asked = await request('POST', '/admin/password-reset/request', { body: { email: 'zweiter-faktor@stadthalle.test' } });

    const confirmed = await request('POST', '/admin/password-reset/confirm', {
      body: { token: tokenOf(asked.body.resetUrl), password: 'neues-passwort-123' }
    });

    expect(confirmed.status).toBe(200);
    expect(confirmed.cookie).toBe(null);
    expect(confirmed.body).toMatchObject({ twoFactorRequired: true, user: { email: 'zweiter-faktor@stadthalle.test' } });
    expect(confirmed.body.challengeToken).toBeTruthy();
    const row = (await query('SELECT status, two_factor_challenge_hash FROM users WHERE id = $1', [guarded.user.id])).rows[0];
    expect(row.status).toBe('active');
    expect(row.two_factor_challenge_hash).toBeTruthy();
  });

  it('gets no session from an invitation alone', async () => {
    const invited = await request('POST', '/admin/users/invite', { cookie: other.owner.cookie, body: { email: 'eingeladen@stadthalle.test', role: 'support' } });
    await query("UPDATE users SET two_factor_enabled = true WHERE email = 'eingeladen@stadthalle.test'");

    const accepted = await request('POST', '/admin/accept-invite', { body: { token: tokenOf(invited.body.inviteUrl), password: 'neues-passwort-123' } });

    expect(accepted.status).toBe(200);
    expect(accepted.cookie).toBe(null);
    expect(accepted.body.twoFactorRequired).toBe(true);
  });

  it('keeps the direct way in for an account without a second factor', async () => {
    const asked = await request('POST', '/admin/password-reset/request', { body: { email: 'owner@stadthalle.test' } });

    const confirmed = await request('POST', '/admin/password-reset/confirm', {
      body: { token: tokenOf(asked.body.resetUrl), password: 'neues-passwort-123' }
    });

    expect(confirmed.status).toBe(200);
    expect(confirmed.cookie).toMatch(/^qrating_admin=/);
    expect((await request('GET', '/admin/me', { cookie: confirmed.cookie })).status).toBe(200);
  });
});
