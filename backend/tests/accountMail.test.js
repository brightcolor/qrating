import { once } from 'node:events';
import bcrypt from 'bcryptjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { env } from '../src/config/env.js';
import { signAdmin } from '../src/middleware/auth.js';
import { encryptSecret } from '../src/utils/crypto.js';
import { issueResetLink } from '../src/services/passwordResetService.js';
import { freshSetupCode } from './support/setupCode.js';
import { catchSystemMail } from './support/systemMail.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let organizationId;
let owner;
let manager;
let admin;
let mail;
const password = 'test-password-123';

async function request(method, path, { body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null };
}

async function account(email, role) {
  const user = (await query(
    `INSERT INTO users (organization_id, name, email, password_hash, role, status)
     VALUES ($1, $2, $3, $4, $5, 'active') RETURNING *`,
    [organizationId, email.split('@')[0], email, await bcrypt.hash(password, 4), role]
  )).rows[0];
  return { user, cookie: `${env.adminCookieName}=${signAdmin(user)}` };
}

const tokenOf = (url) => new URL(url).searchParams.get('token');

beforeAll(async () => {
  await runMigrations();
  await seedDefaultData();
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const setup = await request('POST', '/admin/setup/first-admin', {
    body: { setupCode: await freshSetupCode(), name: 'Owner', email: 'owner@example.test', password, organizationName: 'Beispiel Events' }
  });
  expect(setup.status).toBe(201);
  organizationId = (await query('SELECT organization_id FROM users WHERE email = $1', ['owner@example.test'])).rows[0].organization_id;
  owner = { cookie: setup.cookie };
  await query("UPDATE organizations SET billing_override_plan = 'business' WHERE id = $1", [organizationId]);
  manager = await account('manager@example.test', 'event_manager');
  admin = await account('admin@example.test', 'admin');
  // The organization runs a mail server of its own. Mails that open an account must pass it by.
  await query(
    `INSERT INTO smtp_settings (organization_id, host, port, secure, username, password_encrypted, from_email, enabled)
     VALUES ($1, 'org-mail.example.test', 25, false, 'org', $2, 'events@example.test', true)`,
    [organizationId, encryptSecret('org-secret')]
  );
}, 60_000);

afterEach(() => {
  mail?.restore();
  mail = null;
});

afterAll(async () => {
  server?.close();
  await db.close();
});

describe('a link to reset a password', () => {
  it('travels over the mail server of the installation, never over the one of the organization', async () => {
    mail = catchSystemMail();

    const asked = await request('POST', '/admin/password-reset/request', { body: { email: 'admin@example.test' } });

    expect(asked.body).toEqual({ ok: true });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: 'admin@example.test', from: 'qrating <noreply@example.test>' });
    expect(mail.transports.map((transport) => transport.host)).toEqual(['mail.example.test']);
    expect(mail.linkTo('admin@example.test')).toMatch(/\/admin\/reset-password\?token=/);
  });

  it('goes nowhere without a mail server of the installation, and the log names the command', async () => {
    mail = catchSystemMail({ host: '', from: '' });
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const asked = await request('POST', '/admin/password-reset/request', { body: { email: 'admin@example.test' } });

      expect(asked.body).toEqual({ ok: true });
      expect(mail.sent).toHaveLength(0);
      expect(mail.transports).toHaveLength(0);
      const logged = warned.mock.calls.flat().join(' ');
      expect(logged).toContain(env.resetLinkCommand);
      expect(logged).not.toMatch(/token=/);
    } finally {
      warned.mockRestore();
    }
  });

  it('never comes back in the answer', async () => {
    mail = catchSystemMail();

    const known = await request('POST', '/admin/password-reset/request', { body: { email: 'manager@example.test' } });
    const unknown = await request('POST', '/admin/password-reset/request', { body: { email: 'niemand@example.test' } });

    expect(known.body).toEqual({ ok: true });
    expect(unknown.body).toEqual({ ok: true });
  });

  it('is only for accounts in use: an invited person takes up the invitation', async () => {
    const invited = await request('POST', '/admin/users/invite', { cookie: owner.cookie, body: { email: 'eingeladen@example.test', role: 'analyst' } });
    expect(invited.status).toBe(201);
    mail = catchSystemMail();

    await request('POST', '/admin/password-reset/request', { body: { email: 'eingeladen@example.test' } });

    expect(mail.sent).toHaveLength(0);
  });

  it('works from the command in the container as well', async () => {
    const user = (await query('SELECT * FROM users WHERE email = $1', ['manager@example.test'])).rows[0];
    const link = await issueResetLink({ query }, user);

    const confirmed = await request('POST', '/admin/password-reset/confirm', { body: { token: tokenOf(link), password: 'neues-passwort-123' } });

    expect(confirmed.status).toBe(200);
    manager.cookie = confirmed.cookie;
  });
});

describe('an invitation', () => {
  it('travels over the mail server of the installation and names the organization', async () => {
    mail = catchSystemMail();

    const invited = await request('POST', '/admin/users/invite', { cookie: owner.cookie, body: { email: 'neu@example.test', role: 'support' } });

    expect(invited.status).toBe(201);
    expect(invited.body.inviteUrl).toBe(null);
    expect(mail.transports.map((transport) => transport.host)).toEqual(['mail.example.test']);
    expect(mail.sent[0].subject).toBe('Einladung zu Beispiel Events in qrating');
  });

  it('comes back to the owner when the installation sends no mail', async () => {
    mail = catchSystemMail({ host: '', from: '' });

    const invited = await request('POST', '/admin/users/invite', { cookie: owner.cookie, body: { email: 'hand@example.test', role: 'support' } });

    expect(invited.body.inviteUrl).toMatch(/\/admin\/accept-invite\?token=/);
    expect(mail.transports).toHaveLength(0);
  });
});

describe('deletion periods and the privacy details', () => {
  const branding = async (cookie, body) => request('PATCH', '/admin/branding', { cookie, body });

  it('belong to admins and owners', async () => {
    const shortened = await branding(manager.cookie, { retentionFeedbackDays: 1 });
    const renamed = await branding(manager.cookie, { legalName: 'Andere Firma' });

    expect([shortened.status, renamed.status]).toEqual([403, 403]);
    expect(shortened.body.error).toContain('die Löschfrist für Bewertungen');
    expect(renamed.body.error).toContain('die verantwortliche Stelle');
    expect((await query('SELECT retention_feedback_days FROM organizations WHERE id = $1', [organizationId])).rows[0].retention_feedback_days).toBe(null);
  });

  it('let an event manager save the rest of the page while they stay as they were', async () => {
    const current = (await query('SELECT * FROM organizations WHERE id = $1', [organizationId])).rows[0];

    const saved = await branding(manager.cookie, {
      name: 'Beispiel Events Nord',
      retentionLowRatingPhoneDays: current.retention_low_rating_phone_days,
      retentionFeedbackDays: '',
      retentionNewsletterDays: '',
      legalName: current.legal_name ?? '',
      privacyText: current.privacy_text
    });

    expect(saved.status).toBe(200);
    expect(saved.body.name).toBe('Beispiel Events Nord');
  });

  it('change for an admin', async () => {
    const saved = await branding(admin.cookie, { retentionFeedbackDays: 400 });

    expect(saved.status).toBe(200);
    expect(saved.body.retention_feedback_days).toBe(400);
  });
});
