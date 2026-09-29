import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { NewsletterService } from '../src/services/newsletterService.js';
import { freshSetupCode } from './support/setupCode.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let ownerCookie;
let event;

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

async function createSpot(sourceSlug, label) {
  const created = await request('POST', '/admin/qr-sources', {
    cookie: ownerCookie,
    body: { sourceSlug, label, eventId: event.id, type: 'event_specific' }
  });
  expect(created.status).toBe(201);
  return created.body;
}

async function deleteSpot(spot) {
  const removed = await request('DELETE', `/admin/qr-sources/${spot.id}`, { cookie: ownerCookie });
  expect(removed.status).toBe(200);
  expect((await query('SELECT 1 FROM qr_sources WHERE id = $1', [spot.id])).rows).toHaveLength(0);
}

async function voteOf(sessionKey) {
  return (await query(
    'SELECT feedback_response_id AS id FROM guest_sessions WHERE event_id = $1 AND session_key = $2',
    [event.id, sessionKey]
  )).rows[0].id;
}

// A guest who scanned the code of a spot and sent the form.
async function sendThrough(sourceSlug, sessionKey) {
  const sent = await request('POST', `/public/events/${event.event_feedback_token}/feedback`, {
    body: { sourceType: sourceSlug, sessionKey, rating: 4, startedAt: new Date(Date.now() - 60_000).toISOString() }
  });
  expect(sent.status).toBe(201);
  return voteOf(sessionKey);
}

// What the evaluation of the event names as the place of a vote.
async function placeOf(voteId) {
  const analytics = await request('GET', `/admin/events/${event.id}/analytics`, { cookie: ownerCookie });
  expect(analytics.status).toBe(200);
  const voice = analytics.body.voices.find((item) => item.id === voteId);
  expect(voice).toBeTruthy();
  return voice.source;
}

beforeAll(async () => {
  await runMigrations();
  await seedDefaultData();
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const setup = await request('POST', '/admin/setup/first-admin', {
    body: { setupCode: await freshSetupCode(), name: 'Owner', email: 'owner@example.test', password: 'test-password-123', organizationName: 'Beispiel Events' }
  });
  expect(setup.status).toBe(201);
  ownerCookie = setup.cookie;
  event = (await query("SELECT * FROM events WHERE slug = 'demo-nacht'")).rows[0];
}, 60_000);

afterAll(async () => {
  server?.close();
  await db.close();
});

describe('a vote keeps the name of the spot it came through', () => {
  it('names the spot after its QR source is deleted', async () => {
    const spot = await createSpot('tresen', 'Tresen');
    const vote = await sendThrough('tresen', 'gast-tresen');
    expect(await placeOf(vote)).toBe('Tresen');

    await deleteSpot(spot);

    expect(await placeOf(vote)).toBe('Tresen');
  });

  it('keeps the name the source had last', async () => {
    const spot = await createSpot('garderobe', 'Garderobe');
    const vote = await sendThrough('garderobe', 'gast-garderobe');
    const renamed = await request('PATCH', `/admin/qr-sources/${spot.id}`, { cookie: ownerCookie, body: { label: 'Garderobe Nord' } });
    expect(renamed.status).toBe(200);

    await deleteSpot(spot);

    expect(await placeOf(vote)).toBe('Garderobe Nord');
  });

  it('keeps it for a guest who only tapped the stars', async () => {
    const spot = await createSpot('kasse', 'Kasse');
    const tapped = await request('POST', `/public/events/${event.event_feedback_token}/rating`, {
      body: { rating: 2, sessionKey: 'gast-kasse', sourceType: 'kasse' }
    });
    expect(tapped.status).toBe(201);
    const vote = await voteOf('gast-kasse');

    await deleteSpot(spot);

    expect(await placeOf(vote)).toBe('Kasse');
  });

  it('hands the name to the newsletter when the source went before the handover', async () => {
    const spot = await createSpot('eingang', 'Eingang');
    const vote = await sendThrough('eingang', 'gast-eingang');

    await deleteSpot(spot);

    const source = await new NewsletterService({ query }).sourceValueFor(
      { feedback_response_id: vote },
      { source_field_use_qr: true, source_field_value: 'qrating' }
    );
    expect(source).toBe('Eingang');
  });

  it('leaves a source of another organization where it is', async () => {
    const other = (await query("INSERT INTO organizations (name, slug) VALUES ('Andere Bühne', 'andere-buehne') RETURNING id")).rows[0];
    const foreign = (await query(
      "INSERT INTO qr_sources (organization_id, source_slug, label, type) VALUES ($1, 'foyer', 'Foyer', 'dynamic_organization') RETURNING id",
      [other.id]
    )).rows[0];

    const removed = await request('DELETE', `/admin/qr-sources/${foreign.id}`, { cookie: ownerCookie });

    expect(removed.status).toBe(200);
    expect((await query('SELECT label FROM qr_sources WHERE id = $1', [foreign.id])).rows).toEqual([{ label: 'Foyer' }]);
  });
});
