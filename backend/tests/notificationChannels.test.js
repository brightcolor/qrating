import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { NotificationService } from '../src/services/notificationService.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let platformCookie;
let visitingCookie;
let homeOrganizationId;
let tenantOrganizationId;
let platformUserId;

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

async function createEvent(organizationId, name, token) {
  return (await query(
    `INSERT INTO events (organization_id, source, name, slug, event_feedback_token, date_from, event_timezone, status)
     VALUES ($1, 'manual', $2, $3, $4, now(), 'Europe/Berlin', 'active')
     RETURNING *`,
    [organizationId, name, token, token]
  )).rows[0];
}

async function createFeedback(event, rating) {
  return (await query(
    `INSERT INTO feedback_responses (organization_id, event_id, source_type, rating, submitted_at)
     VALUES ($1, $2, 'qr', $3, now())
     RETURNING *`,
    [event.organization_id, event.id, rating]
  )).rows[0];
}

function serviceWithMailbox() {
  const smtpService = { sendMail: vi.fn().mockResolvedValue({ accepted: ['someone@example.test'] }) };
  return { smtpService, service: new NotificationService({ query }, { smtpService }) };
}

describe('notification channels of a visited tenant', () => {
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
        organizationName: 'Bright Color'
      }
    });
    expect(setup.status).toBe(201);
    platformCookie = setup.cookie;
    homeOrganizationId = (await query("SELECT id FROM organizations WHERE slug = 'bright-color'")).rows[0].id;
    platformUserId = (await query("SELECT id FROM users WHERE email = 'platform@example.test'")).rows[0].id;

    const tenant = await request('POST', '/admin/platform/organizations', {
      cookie: platformCookie,
      body: { name: 'HSP Events' }
    });
    expect(tenant.status).toBe(201);
    tenantOrganizationId = tenant.body.id;

    const entered = await request('POST', `/admin/platform/organizations/${tenantOrganizationId}/enter`, { cookie: platformCookie });
    expect(entered.status).toBe(200);
    visitingCookie = entered.cookie;
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await db.close();
  });

  it('gives a channel created inside a visited tenant to that tenant', async () => {
    // The tenant has no accounts of its own, so the form sends no user at all.
    const created = await request('POST', '/admin/notification-channels', {
      cookie: visitingCookie,
      body: { channelType: 'email', label: 'E-Mail an das Haus', minRating: 2, config: { to: 'haus@example.test' } }
    });

    expect(created.status).toBe(201);
    const row = (await query('SELECT organization_id, user_id FROM notification_channels WHERE id = $1', [created.body.id])).rows[0];
    expect(row.organization_id).toBe(tenantOrganizationId);
    expect(row.user_id).toBeNull();
  });

  it('refuses a channel for an account of another organization', async () => {
    const refused = await request('POST', '/admin/notification-channels', {
      cookie: visitingCookie,
      body: { channelType: 'email', label: 'Fremdes Konto', config: { to: 'haus@example.test' }, userId: platformUserId }
    });

    expect(refused.status).toBe(404);
    expect(refused.body.message || refused.body.error).toMatch(/Organisation/);
    const left = await query(
      'SELECT id FROM notification_channels WHERE organization_id = $1 AND user_id = $2',
      [tenantOrganizationId, platformUserId]
    );
    expect(left.rows).toHaveLength(0);
  });

  it('keeps a personal channel for an account of the tenant itself', async () => {
    const member = (await query(
      `INSERT INTO users (organization_id, name, email, password_hash, role, status)
       VALUES ($1, 'Hausleitung', 'haus@example.test', 'x', 'admin', 'active')
       RETURNING id`,
      [tenantOrganizationId]
    )).rows[0];

    const created = await request('POST', '/admin/notification-channels', {
      cookie: visitingCookie,
      body: { channelType: 'email', label: 'Persoenlich', config: {}, userId: member.id }
    });

    expect(created.status).toBe(201);
    const row = (await query('SELECT user_id FROM notification_channels WHERE id = $1', [created.body.id])).rows[0];
    expect(row.user_id).toBe(member.id);
  });

  it('alerts an organization channel for an event that has no assignments', async () => {
    const event = await createEvent(tenantOrganizationId, 'Abend ohne Team', 'token-ohne-team');
    const feedback = await createFeedback(event, 1);
    const channel = (await query(
      `INSERT INTO notification_channels (organization_id, user_id, channel_type, label, min_rating, config)
       VALUES ($1, NULL, 'email', 'Haus-Postfach', 2, '{"to":"haus-postfach@example.test"}'::jsonb)
       RETURNING id`,
      [tenantOrganizationId]
    )).rows[0];
    const { service, smtpService } = serviceWithMailbox();

    const deliveries = await service.dispatchLowRating(event, feedback);

    expect(deliveries).toContainEqual(expect.objectContaining({ channelId: channel.id, ok: true }));
    expect(smtpService.sendMail.mock.calls.map((call) => call[1].to)).toContain('haus-postfach@example.test');
    const delivery = (await query(
      'SELECT status FROM notification_deliveries WHERE notification_channel_id = $1 AND feedback_response_id = $2',
      [channel.id, feedback.id]
    )).rows[0];
    expect(delivery.status).toBe('sent');
  });

  it('keeps the channels of another organization out of the alerting', async () => {
    const event = await createEvent(tenantOrganizationId, 'Abend mit Gast', 'token-mit-gast');
    const feedback = await createFeedback(event, 1);
    // The platform account lives elsewhere and is on the team of this event.
    await query(
      `INSERT INTO user_event_assignments (organization_id, user_id, event_id, notify_low_rating)
       VALUES ($1, $2, $3, true)`,
      [tenantOrganizationId, platformUserId, event.id]
    );
    const foreign = (await query(
      `INSERT INTO notification_channels (organization_id, user_id, channel_type, label, min_rating, config)
       VALUES ($1, $2, 'email', 'Eigener Kanal', 2, '{"to":"platform@example.test"}'::jsonb)
       RETURNING id`,
      [homeOrganizationId, platformUserId]
    )).rows[0];
    const { service } = serviceWithMailbox();

    const deliveries = await service.dispatchLowRating(event, feedback);

    expect(deliveries.map((item) => item.channelId)).not.toContain(foreign.id);
  });

  it('names the missing recipient of an organization mail channel', async () => {
    const event = await createEvent(tenantOrganizationId, 'Abend ohne Adresse', 'token-ohne-adresse');
    const feedback = await createFeedback(event, 1);
    await query(
      `INSERT INTO notification_channels (organization_id, user_id, channel_type, label, min_rating, config)
       VALUES ($1, NULL, 'email', 'Haus-Postfach ohne Adresse', 2, '{}'::jsonb)
       RETURNING id`,
      [tenantOrganizationId]
    );
    const { service } = serviceWithMailbox();

    const deliveries = await service.dispatchLowRating(event, feedback);

    const failed = deliveries.find((item) => !item.ok);
    expect(failed?.error).toMatch(/Empfängeradresse/);
  });
});
