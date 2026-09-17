import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { createPreviewToken, previewValidityMs, verifyPreviewToken } from '../src/utils/previewLink.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let ownerCookie;

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

async function closedEvent() {
  // A finished event: its feedback round ended days ago.
  const result = await query(
    `UPDATE events
     SET date_from = now() - interval '30 days', date_to = now() - interval '30 days', feedback_window_days = 1
     WHERE slug = 'demo-nacht'
     RETURNING *`
  );
  return result.rows[0];
}

describe('preview of the guest page', () => {
  beforeAll(async () => {
    await runMigrations();
    await seedDefaultData();
    server = app.listen(0);
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const setup = await request('POST', '/admin/setup/first-admin', {
      body: {
        name: 'Owner',
        email: 'owner@example.test',
        password: 'test-password-123',
        organizationName: 'HSP-Events'
      }
    });
    expect(setup.status).toBe(201);
    ownerCookie = setup.cookie;
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await db.close();
  });

  it('accepts only its own signature and only while it lasts', () => {
    const now = Date.parse('2026-09-17T20:00:00.000Z');
    const token = createPreviewToken('event-token', now);

    expect(verifyPreviewToken('event-token', token, now + 60_000)).toBe(true);
    expect(verifyPreviewToken('event-token', token, now + previewValidityMs + 1000)).toBe(false);
    expect(verifyPreviewToken('other-token', token, now)).toBe(false);
    expect(verifyPreviewToken('event-token', `${now + previewValidityMs}.wrong`, now)).toBe(false);
    expect(verifyPreviewToken('event-token', '', now)).toBe(false);
  });

  it('opens a finished event through the link from the admin area', async () => {
    const event = await closedEvent();

    const closed = await request('GET', `/public/e/${event.event_feedback_token}`);
    expect(closed.status).toBe(410);
    expect(closed.body.status).toBe('closed');

    const link = await request('GET', `/admin/events/${event.id}/preview-link`, { cookie: ownerCookie });
    expect(link.status).toBe(200);
    expect(link.body.url).toContain(`/e/${event.event_feedback_token}?preview=`);

    const preview = new URL(link.body.url).searchParams.get('preview');
    const opened = await request('GET', `/public/e/${event.event_feedback_token}?preview=${encodeURIComponent(preview)}`);
    expect(opened.status).toBe(200);
    expect(opened.body).toMatchObject({ status: 'ok', preview: true });
    expect(opened.body.event.name).toBe('Demo Nacht');
    expect(opened.body.texts.preview_hint).toContain('Vorschau');

    const wrong = await request('GET', `/public/e/${event.event_feedback_token}?preview=123.abc`);
    expect(wrong.status).toBe(410);
  });

  it('keeps the preview out of the scan statistics', async () => {
    const event = await closedEvent();
    const link = await request('GET', `/admin/events/${event.id}/preview-link`, { cookie: ownerCookie });
    const preview = new URL(link.body.url).searchParams.get('preview');

    await request('GET', `/public/e/${event.event_feedback_token}?preview=${encodeURIComponent(preview)}`);

    const scans = await query('SELECT coalesce(sum(scans_count), 0)::int AS scans FROM qr_source_daily_stats WHERE event_id = $1', [event.id]);
    expect(scans.rows[0].scans).toBe(0);
  });

  it('refuses a preview link for an event of another organization', async () => {
    const otherOrganization = (await query(
      `INSERT INTO organizations (name, slug) VALUES ('Fremder Mandant', 'fremder-mandant') RETURNING id`
    )).rows[0];
    const foreign = (await query(
      `INSERT INTO events (organization_id, source, name, slug, event_feedback_token, date_from, status, feedback_enabled)
       VALUES ($1, 'manual', 'Fremdes Event', 'fremdes-event', 'fremd-token-1234', now(), 'active', true)
       RETURNING id`,
      [otherOrganization.id]
    )).rows[0];

    const link = await request('GET', `/admin/events/${foreign.id}/preview-link`, { cookie: ownerCookie });

    expect(link.status).toBe(404);
    expect(link.body.error).toContain('anderen Organisation');
  });

  it('archives an event and lets it come back', async () => {
    const event = await closedEvent();

    const archived = await request('PATCH', `/admin/events/${event.id}`, { cookie: ownerCookie, body: { status: 'archived' } });
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe('archived');
    const guest = await request('GET', '/public/f/hsp-events');
    expect(guest.body.status).toBe('no_event');

    const active = await request('PATCH', `/admin/events/${event.id}`, { cookie: ownerCookie, body: { status: 'active' } });
    expect(active.body.status).toBe('active');
  });

  it('deletes an event with everything that hangs on it', async () => {
    const event = await closedEvent();
    const response = (await query(
      `INSERT INTO feedback_responses (organization_id, event_id, source_type, rating)
       VALUES ($1, $2, 'event_specific', 4)
       RETURNING id`,
      [event.organization_id, event.id]
    )).rows[0];

    const analytics = await request('GET', `/admin/events/${event.id}/analytics`, { cookie: ownerCookie });
    expect(analytics.body.summary.total).toBe(1);

    const deleted = await request('DELETE', `/admin/events/${event.id}`, { cookie: ownerCookie });
    expect(deleted.status).toBe(200);

    const events = await query('SELECT id FROM events WHERE id = $1', [event.id]);
    expect(events.rows).toEqual([]);
    const responses = await query('SELECT id FROM feedback_responses WHERE id = $1', [response.id]);
    expect(responses.rows).toEqual([]);
  });
});
