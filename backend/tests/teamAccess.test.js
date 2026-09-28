import { once } from 'node:events';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { env } from '../src/config/env.js';
import { requireAdmin, signAdmin } from '../src/middleware/auth.js';
import { SmtpService } from '../src/services/smtpService.js';
import { randomToken } from '../src/utils/crypto.js';
import { freshSetupCode } from './support/setupCode.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let home;
let away;
let demo;

const password = 'test-password-123';

async function request(method, path, { body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* an empty answer */ }
  return { status: response.status, body: parsed, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null };
}

// An account with a password it can sign in with, and a session cookie signed for it.
async function account(organizationId, email, role, extra = {}) {
  const user = (await query(
    `INSERT INTO users (organization_id, name, email, password_hash, role, status, platform_admin)
     VALUES ($1, $2, $3, $4, $5, 'active', $6)
     RETURNING *`,
    [organizationId, email.split('@')[0], email, await bcrypt.hash(password, 4), role, Boolean(extra.platformAdmin)]
  )).rows[0];
  return { user, cookie: `${env.adminCookieName}=${signAdmin(user)}` };
}

const tokenOf = (url) => new URL(url).searchParams.get('token');
const userRow = async (id) => (await query('SELECT * FROM users WHERE id = $1', [id])).rows[0];

beforeAll(async () => {
  await runMigrations();
  await seedDefaultData();
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const setup = await request('POST', '/admin/setup/first-admin', {
    body: { setupCode: await freshSetupCode(), name: 'Plattform', email: 'plattform@example.test', password, organizationName: 'Beispiel Events' }
  });
  expect(setup.status).toBe(201);
  demo = (await query("SELECT * FROM events WHERE slug = 'demo-nacht'")).rows[0];
  await query("UPDATE organizations SET billing_override_plan = 'business' WHERE id = $1", [demo.organization_id]);
  const platform = (await query("SELECT * FROM users WHERE email = 'plattform@example.test'")).rows[0];
  home = {
    id: demo.organization_id,
    platform: { user: platform, cookie: setup.cookie },
    owner: await account(demo.organization_id, 'zweite-owner@beispiel.test', 'owner'),
    manager: await account(demo.organization_id, 'manager@beispiel.test', 'event_manager'),
    support: await account(demo.organization_id, 'support@beispiel.test', 'support')
  };
  await query(
    'INSERT INTO user_event_assignments (organization_id, user_id, event_id) VALUES ($1, $2, $3)',
    [home.id, home.support.user.id, demo.id]
  );

  const organization = (await query(
    `INSERT INTO organizations (name, slug, billing_override_plan) VALUES ('Stadthalle Beispiel', 'stadthalle-beispiel', 'business') RETURNING *`
  )).rows[0];
  const event = (await query(
    `INSERT INTO events (organization_id, name, slug, event_feedback_token, date_from)
     VALUES ($1, 'Abend in der Halle', 'abend-in-der-halle', $2, now()) RETURNING *`,
    [organization.id, randomToken()]
  )).rows[0];
  const connection = (await query(
    `INSERT INTO pretix_connections (organization_id, base_url, pretix_organizer_slug, api_token_encrypted, last_sync_status)
     VALUES ($1, 'https://pretix.example.test', 'halle', 'verschluesselt', 'OK') RETURNING *`,
    [organization.id]
  )).rows[0];
  away = { id: organization.id, event, connection, owner: await account(organization.id, 'owner@stadthalle.test', 'owner') };
}, 60_000);

afterAll(async () => {
  server?.close();
  await db.close();
});

describe('taking over an account of the own organization', () => {
  it('leaves a platform account to the platform role', async () => {
    const disabled = await request('PATCH', `/admin/users/${home.platform.user.id}`, { cookie: home.owner.cookie, body: { status: 'disabled' } });
    const invited = await request('PATCH', `/admin/users/${home.platform.user.id}`, { cookie: home.owner.cookie, body: { status: 'invited' } });
    const reinvited = await request('POST', '/admin/users/invite', { cookie: home.owner.cookie, body: { email: 'plattform@example.test', role: 'owner' } });

    expect([disabled.status, invited.status, reinvited.status]).toEqual([403, 400, 409]);
    expect(disabled.body.error).toContain('Plattform-Verwaltung');
    expect(await userRow(home.platform.user.id)).toMatchObject({ status: 'active', invite_token_hash: null });
    expect((await request('POST', '/admin/login', { body: { email: 'plattform@example.test', password } })).status).toBe(200);
  });

  it('keeps the way over "invited" closed for every colleague', async () => {
    const invited = await request('PATCH', `/admin/users/${home.manager.user.id}`, { cookie: home.owner.cookie, body: { status: 'invited' } });
    expect(invited.status).toBe(400);
    expect(invited.body.error).toContain('setzt nur eine Einladung');

    const disabled = await request('PATCH', `/admin/users/${home.manager.user.id}`, { cookie: home.owner.cookie, body: { status: 'disabled' } });
    const reinvited = await request('POST', '/admin/users/invite', { cookie: home.owner.cookie, body: { email: 'manager@beispiel.test', role: 'owner' } });
    const session = await request('GET', '/admin/events', { cookie: home.manager.cookie });
    const back = await request('PATCH', `/admin/users/${home.manager.user.id}`, { cookie: home.owner.cookie, body: { status: 'active' } });

    expect([disabled.status, reinvited.status, session.status, back.status]).toEqual([200, 409, 401, 200]);
    expect(await userRow(home.manager.user.id)).toMatchObject({ status: 'active', role: 'event_manager', invite_token_hash: null });
    expect((await request('POST', '/admin/login', { body: { email: 'manager@beispiel.test', password } })).status).toBe(200);
  });

  it('lets nobody change their own role or access', async () => {
    const demoted = await request('PATCH', `/admin/users/${home.owner.user.id}`, { cookie: home.owner.cookie, body: { role: 'admin' } });
    const locked = await request('PATCH', `/admin/users/${home.platform.user.id}`, { cookie: home.platform.cookie, body: { status: 'disabled' } });

    expect([demoted.status, locked.status]).toEqual([409, 409]);
    expect(demoted.body.error).toBe('Deine eigene Rolle und deinen Zugang ändert ein anderer Owner deiner Organisation.');
  });

  it('keeps the last active owner of an organization', async () => {
    const entered = await request('POST', `/admin/platform/organizations/${away.id}/enter`, { cookie: home.platform.cookie });
    const demoted = await request('PATCH', `/admin/users/${away.owner.user.id}`, { cookie: entered.cookie, body: { role: 'admin' } });
    const disabled = await request('PATCH', `/admin/users/${away.owner.user.id}`, { cookie: entered.cookie, body: { status: 'disabled' } });

    expect([demoted.status, disabled.status]).toEqual([409, 409]);
    expect(demoted.body.error).toContain('der letzte aktive Owner');

    await account(away.id, 'zweiter@stadthalle.test', 'owner');
    const handedOver = await request('PATCH', `/admin/users/${away.owner.user.id}`, { cookie: entered.cookie, body: { role: 'admin' } });
    expect(handedOver.status).toBe(200);
    await request('POST', '/admin/platform/leave', { cookie: entered.cookie });
  });

  it('withdraws an invitation nobody took up and sends it again', async () => {
    const first = await request('POST', '/admin/users/invite', { cookie: home.owner.cookie, body: { email: 'neu@beispiel.test', role: 'analyst' } });
    expect(first.status).toBe(201);
    const id = first.body.user.id;

    const activated = await request('PATCH', `/admin/users/${id}`, { cookie: home.owner.cookie, body: { status: 'active' } });
    const withdrawn = await request('PATCH', `/admin/users/${id}`, { cookie: home.owner.cookie, body: { status: 'disabled' } });
    const stale = await request('POST', '/admin/accept-invite', { body: { token: tokenOf(first.body.inviteUrl), password } });
    expect([activated.status, withdrawn.status, stale.status]).toEqual([409, 200, 400]);
    expect(activated.body.error).toContain('sobald die Person die Einladung annimmt');

    const second = await request('POST', '/admin/users/invite', { cookie: home.owner.cookie, body: { email: 'neu@beispiel.test', role: 'analyst' } });
    const accepted = await request('POST', '/admin/accept-invite', { body: { token: tokenOf(second.body.inviteUrl), password } });
    const third = await request('POST', '/admin/users/invite', { cookie: home.owner.cookie, body: { email: 'neu@beispiel.test', role: 'owner' } });

    expect([second.status, accepted.status, third.status]).toEqual([201, 200, 409]);
    expect(await userRow(id)).toMatchObject({ status: 'active', role: 'analyst' });
  });

  it('keeps an invitation valid for the days of its setting', async () => {
    const before = env.inviteValidDays;
    env.inviteValidDays = 3;
    try {
      const invited = await request('POST', '/admin/users/invite', { cookie: home.owner.cookie, body: { email: 'drei-tage@beispiel.test' } });
      const days = (new Date(invited.body.user.invite_expires_at) - Date.now()) / 86_400_000;

      expect(days).toBeGreaterThan(2.9);
      expect(days).toBeLessThan(3.1);
    } finally {
      env.inviteValidDays = before;
    }
  });

  it('hands the link back only when no mail carried it', async () => {
    const sent = vi.spyOn(SmtpService.prototype, 'sendMail').mockResolvedValue({ messageId: 'probe' });
    try {
      const invited = await request('POST', '/admin/users/invite', { cookie: home.owner.cookie, body: { email: 'post@beispiel.test' } });

      expect(invited.status).toBe(201);
      expect(invited.body.inviteUrl).toBe(null);
      expect(sent).toHaveBeenCalledTimes(1);
    } finally {
      sent.mockRestore();
    }
  });

  it('writes role, access and name changes into the audit log', async () => {
    await request('PATCH', `/admin/users/${home.support.user.id}`, { cookie: home.owner.cookie, body: { role: 'analyst' } });
    await request('PATCH', `/admin/users/${home.support.user.id}`, { cookie: home.owner.cookie, body: { name: 'Support Neu', role: 'support' } });

    const entries = (await query(
      `SELECT action, metadata, user_id FROM audit_log WHERE entity_id = $1 AND action LIKE 'team.%' ORDER BY created_at, action`,
      [home.support.user.id]
    )).rows;
    expect(entries.map((entry) => entry.action)).toEqual(['team.role_changed', 'team.role_changed', 'team.user_renamed']);
    expect(entries[0].metadata).toEqual({ from: 'support', to: 'analyst' });
    expect(entries.every((entry) => entry.user_id === home.owner.user.id)).toBe(true);
    const invites = (await query("SELECT count(*)::int AS count FROM audit_log WHERE action = 'team.user_invited'")).rows[0].count;
    expect(invites).toBeGreaterThan(0);
  });
});

describe('what each role may change', () => {
  it('leaves forms, questions, texts, QR sources and events to event managers and above', async () => {
    const form = (await query('SELECT id FROM feedback_forms WHERE event_id = $1 LIMIT 1', [demo.id])).rows[0];
    const question = (await query('SELECT id FROM feedback_questions WHERE feedback_form_id = $1 LIMIT 1', [form.id])).rows[0];
    const cookie = home.support.cookie;

    const answers = await Promise.all([
      request('POST', '/admin/forms', { cookie, body: { eventId: demo.id, name: 'Von Support' } }),
      request('PATCH', `/admin/forms/${form.id}/questions/${question.id}`, { cookie, body: { label: 'Geändert von Support' } }),
      request('POST', '/admin/text-templates', { cookie, body: { key: 'submit', value: 'Los' } }),
      request('POST', '/admin/qr-sources', { cookie, body: { sourceSlug: 'tuer', label: 'Tür' } }),
      request('PATCH', `/admin/events/${demo.id}`, { cookie, body: { status: 'closed' } })
    ]);

    expect(answers.map((answer) => answer.status)).toEqual([403, 403, 403, 403, 403]);
    expect(answers[0].body.error).toContain('Ein Owner deiner Organisation kann deine Rolle anpassen');
    const allowed = await request('POST', '/admin/text-templates', { cookie: home.manager.cookie, body: { key: 'submit', value: 'Los' } });
    expect(allowed.status).toBe(201);
    expect((await query('SELECT status FROM events WHERE id = $1', [demo.id])).rows[0].status).toBe('active');
  });

  it('leaves the mail server to admins and the ticket shop to event managers', async () => {
    const support = home.support.cookie;
    const manager = home.manager.cookie;

    const answers = await Promise.all([
      request('GET', '/admin/smtp-settings', { cookie: support }),
      request('PUT', '/admin/smtp-settings', { cookie: manager, body: { host: 'mail.example.test', fromEmail: 'a@example.test' } }),
      request('POST', '/admin/pretix-connections', { cookie: support, body: { baseUrl: 'https://pretix.example.test', organizerSlug: 'x', apiToken: 'probe' } }),
      request('GET', '/admin/pretix-connections', { cookie: support }),
      request('GET', '/admin/pretix-connections', { cookie: manager })
    ]);

    expect(answers.map((answer) => answer.status)).toEqual([403, 403, 403, 403, 200]);
  });

  it('refuses the ids of another organization', async () => {
    const response = (await query(
      `INSERT INTO feedback_responses (organization_id, event_id, source_type, rating) VALUES ($1, $2, 'event_specific', 1) RETURNING id`,
      [home.id, demo.id]
    )).rows[0];
    const lowCase = (await query(
      `INSERT INTO low_rating_cases (organization_id, event_id, feedback_response_id, rating) VALUES ($1, $2, $3, 1) RETURNING id`,
      [home.id, demo.id, response.id]
    )).rows[0];
    const cookie = home.manager.cookie;

    const answers = await Promise.all([
      request('POST', '/admin/text-templates', { cookie, body: { eventId: away.event.id, key: 'submit', value: 'Fremd' } }),
      request('POST', '/admin/qr-sources', { cookie, body: { eventId: away.event.id, sourceSlug: 'fremd', label: 'Fremd' } }),
      request('PATCH', `/admin/low-rating-cases/${lowCase.id}`, { cookie, body: { assignedUserId: away.owner.user.id } }),
      request('POST', `/admin/pretix-connections/${away.connection.id}/sync`, { cookie, body: {} })
    ]);

    expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404]);
    expect(answers[2].body.error).toContain('gehört nicht zu deiner Organisation');
    const connection = (await query('SELECT last_sync_status, last_sync_error FROM pretix_connections WHERE id = $1', [away.connection.id])).rows[0];
    expect(connection).toEqual({ last_sync_status: 'OK', last_sync_error: null });
    const strays = (await query('SELECT count(*)::int AS count FROM text_templates WHERE event_id = $1', [away.event.id])).rows[0].count;
    expect(strays).toBe(0);
  });
});

describe('a session', () => {
  it('ends when a new password is set, while the session of the new password holds', async () => {
    const member = await account(home.id, 'passwort@beispiel.test', 'analyst');
    const signedIn = await request('POST', '/admin/login', { body: { email: 'passwort@beispiel.test', password } });
    const asked = await request('POST', '/admin/password-reset/request', { body: { email: 'passwort@beispiel.test' } });

    const confirmed = await request('POST', '/admin/password-reset/confirm', { body: { token: tokenOf(asked.body.resetUrl), password: 'ganz-neues-passwort' } });

    const old = await request('GET', '/admin/events', { cookie: signedIn.cookie });
    const signed = await request('GET', '/admin/events', { cookie: member.cookie });
    const fresh = await request('GET', '/admin/events', { cookie: confirmed.cookie });
    expect([old.status, signed.status, fresh.status]).toEqual([401, 401, 200]);
    expect(old.body.error).toContain('neues Passwort gesetzt');
  });

  it('works with the visit role while the platform role lasts, and with the home role at home', async () => {
    const visitor = await account(home.id, 'plattform-support@beispiel.test', 'support', { platformAdmin: true });

    const atHome = await request('PATCH', '/admin/branding', { cookie: visitor.cookie, body: { footerText: 'Zu Hause' } });
    const plans = await request('GET', '/admin/billing', { cookie: visitor.cookie });
    const entered = await request('POST', `/admin/platform/organizations/${away.id}/enter`, { cookie: visitor.cookie });
    const visiting = await request('PATCH', '/admin/branding', { cookie: entered.cookie, body: { footerText: 'Zu Besuch' } });

    expect([atHome.status, plans.status, entered.status, visiting.status]).toEqual([403, 200, 200, 200]);
  });

  it('ends a visit to an organization that is gone', async () => {
    const visitor = await account(home.id, 'besucher@beispiel.test', 'owner', { platformAdmin: true });
    const gone = (await query("INSERT INTO organizations (name, slug) VALUES ('Weg', 'weg') RETURNING id")).rows[0];
    const entered = await request('POST', `/admin/platform/organizations/${gone.id}/enter`, { cookie: visitor.cookie });
    await query('DELETE FROM organizations WHERE id = $1', [gone.id]);

    const me = await request('GET', '/admin/me', { cookie: entered.cookie });

    expect(me.status).toBe(401);
    expect(me.body.error).toContain('Die Organisation dieser Sitzung gibt es nicht mehr');
  });

  it('carries the cookie name of its setting', async () => {
    const before = env.adminCookieName;
    env.adminCookieName = 'andere_sitzung';
    try {
      const signedIn = await request('POST', '/admin/login', { body: { email: 'zweite-owner@beispiel.test', password } });
      const token = signedIn.cookie.split('=').slice(1).join('=');

      expect(signedIn.cookie.startsWith('andere_sitzung=')).toBe(true);
      expect((await request('GET', '/admin/me', { cookie: `andere_sitzung=${token}` })).status).toBe(200);
      expect((await request('GET', '/admin/me', { cookie: `qrating_admin=${token}` })).status).toBe(401);
    } finally {
      env.adminCookieName = before;
    }
  });

  it('reads the account once per request, however many routers ask', async () => {
    const next = vi.fn();

    // Without a cookie a second check would answer 401; the first answer counts.
    await requireAdmin({ admin: { sub: 'schon-geprueft' }, cookies: {} }, {}, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('takes a wrong password when switching off 2FA as an input error, and stays signed in', async () => {
    const wrong = await request('POST', '/admin/2fa/disable', { cookie: home.owner.cookie, body: { password: 'falsch', code: '' } });

    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toContain('Das Passwort stimmt nicht');
    expect((await request('GET', '/admin/me', { cookie: home.owner.cookie })).status).toBe(200);
  });

  it('finds an address typed with spaces and capitals', async () => {
    const signedIn = await request('POST', '/admin/login', { body: { email: '  Zweite-Owner@Beispiel.TEST ', password } });
    const asked = await request('POST', '/admin/password-reset/request', { body: { email: ' ZWEITE-OWNER@beispiel.test' } });

    expect(signedIn.status).toBe(200);
    expect(asked.body.resetUrl).toBeTruthy();
  });
});
