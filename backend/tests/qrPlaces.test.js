import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { env } from '../src/config/env.js';
import { recordRating } from '../src/services/ratingService.js';
import { withoutGonePlace } from '../src/utils/gonePlace.js';
import { freshSetupCode } from './support/setupCode.js';

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

const create = (body) => request('POST', '/admin/qr-sources', { cookie: ownerCookie, body });
const rename = (id, body) => request('PATCH', `/admin/qr-sources/${id}`, { cookie: ownerCookie, body });

// Runs a check with another value for a setting and puts the old one back.
async function withSetting(key, value, check) {
  const before = env[key];
  env[key] = value;
  try {
    await check();
  } finally {
    env[key] = before;
  }
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
}, 60_000);

afterAll(async () => {
  server?.close();
  await db.close();
});

describe('a new QR place', () => {
  it('keeps its name without the spaces around it', async () => {
    const created = await create({ sourceSlug: 'garderobe', label: '  Garderobe  ' });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ label: 'Garderobe', source_slug: 'garderobe', type: 'dynamic_organization' });
  });

  it('needs a name, and says so', async () => {
    const refused = await create({ sourceSlug: 'ohne-namen', label: '   ' });

    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/Namen/);
  });

  it('takes a short name that fits into the address of the code', async () => {
    const refused = await create({ sourceSlug: 'Bar Nord', label: 'Bar Nord' });

    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/Kleinbuchstaben, Ziffern und Bindestriche/);
  });

  it('keeps the names of the ways into the guest page free', async () => {
    const refused = await create({ sourceSlug: 'event', label: 'Eventlink' });

    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/„event“ benennt schon einen Weg zur Gästeseite/);
  });

  it('names the short name that is taken already', async () => {
    const taken = await create({ sourceSlug: 'garderobe', label: 'Zweite Garderobe' });

    expect(taken.status).toBe(409);
    expect(taken.body.error).toMatch(/„garderobe“ hat schon ein QR-Platz/);
  });

  it('asks for the event of a place that belongs to one event', async () => {
    const refused = await create({ sourceSlug: 'buehne', label: 'Bühne', type: 'event_specific' });

    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/Event/);
  });

  it('keeps a place for all events apart from every single event', async () => {
    const event = (await query("SELECT id FROM events WHERE slug = 'demo-nacht'")).rows[0];
    const refused = await create({ sourceSlug: 'foyer', label: 'Foyer', eventId: event.id });

    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('Ein QR-Platz für alle Events gehört zu keinem Event. Lass die Event-ID weg, oder lege mit Typ „event_specific“ einen Platz für dieses eine Event an.');
    expect((await query("SELECT count(*)::int AS count FROM qr_sources WHERE source_slug = 'foyer'")).rows[0].count).toBe(0);
  });

  it('starts counting or paused only with a yes or a no', async () => {
    const refused = await create({ sourceSlug: 'abendkasse', label: 'Abendkasse', active: 'false' });

    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('Ob ein QR-Platz zählt, steht im Feld „active“ als true oder false.');
    expect((await create({ sourceSlug: 'abendkasse', label: 'Abendkasse', active: false })).body.active).toBe(false);
  });

  it('knows only the two kinds of places, and names them', async () => {
    const refused = await create({ sourceSlug: 'tuer', label: 'Tür', type: 'irgendwas' });

    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/alle Events .*einzelnes Event/);
  });

  it('follows the lengths of the settings', async () => {
    await withSetting('qrSourceLabelMaxLength', 12, async () => {
      expect((await create({ sourceSlug: 'lang', label: 'Dreizehn Zei.' })).status).toBe(400);
      expect((await create({ sourceSlug: 'lang', label: 'Zwölf Zeiche' })).status).toBe(201);
    });
    await withSetting('qrSourceSlugMaxLength', 5, async () => {
      const refused = await create({ sourceSlug: 'eingang', label: 'Eingang' });
      expect(refused.status).toBe(400);
      expect(refused.body.error).toMatch(/höchstens 5 Zeichen/);
    });
  });
});

describe('renaming a QR place', () => {
  it('changes the name and keeps the short name of the printed code', async () => {
    const place = (await create({ sourceSlug: 'tresen', label: 'Tresen' })).body;

    const renamed = await rename(place.id, { label: ' Tresen Nord ' });

    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ label: 'Tresen Nord', source_slug: 'tresen' });
  });

  it('keeps a name that is not empty', async () => {
    const place = (await create({ sourceSlug: 'kasse', label: 'Kasse' })).body;

    const refused = await rename(place.id, { label: '' });

    expect(refused.status).toBe(400);
    expect((await query('SELECT label FROM qr_sources WHERE id = $1', [place.id])).rows[0].label).toBe('Kasse');
  });

  it('refuses a name longer than the setting allows', async () => {
    const place = (await create({ sourceSlug: 'foyer', label: 'Foyer' })).body;

    await withSetting('qrSourceLabelMaxLength', 10, async () => {
      const refused = await rename(place.id, { label: 'Foyer im Erdgeschoss' });
      expect(refused.status).toBe(400);
      expect(refused.body.error).toMatch(/höchstens 10 Zeichen/);
    });
  });

  it('switches a place off only with a yes or a no', async () => {
    const place = (await create({ sourceSlug: 'balkon', label: 'Balkon' })).body;

    expect((await rename(place.id, { active: 'nein' })).status).toBe(400);
    expect((await rename(place.id, { active: false })).body.active).toBe(false);
  });

  it('says when the place is gone', async () => {
    const missing = await rename('00000000-0000-4000-8000-000000000000', { label: 'Weg' });

    expect(missing.status).toBe(404);
    expect(missing.body.error).toMatch(/QR-Quelle gibt es nicht mehr/);
  });
});

it('tells the admin area the lengths it may use', async () => {
  const me = await request('GET', '/admin/me', { cookie: ownerCookie });

  expect(me.body.settings).toMatchObject({
    qrSourceLabelMaxLength: env.qrSourceLabelMaxLength,
    qrSourceSlugMaxLength: env.qrSourceSlugMaxLength
  });
});

describe('a short name that a place for all events and a place for the running event share', () => {
  it('counts scan and vote for the place of the running event', async () => {
    const event = (await query("SELECT id, event_feedback_token, organization_id FROM events WHERE slug = 'demo-nacht'")).rows[0];
    const { slug } = (await query('SELECT slug FROM organizations WHERE id = $1', [event.organization_id])).rows[0];
    const everywhere = (await create({ sourceSlug: 'theke', label: 'Theke' })).body;
    const tonight = (await create({ sourceSlug: 'theke', label: 'Theke heute', type: 'event_specific', eventId: event.id })).body;

    const scan = await request('GET', `/public/f/${slug}/theke`);
    const vote = await request('POST', `/public/events/${event.event_feedback_token}/rating`, { body: { rating: 4, sessionKey: 'gast-an-der-theke', sourceType: 'theke' } });

    expect([scan.status, vote.status]).toEqual([200, 201]);
    const scans = Object.fromEntries((await query('SELECT id, scans_count FROM qr_sources WHERE id = ANY($1::uuid[])', [[everywhere.id, tonight.id]])).rows.map((row) => [row.id, row.scans_count]));
    expect(scans).toEqual({ [everywhere.id]: 0, [tonight.id]: 1 });
    const votes = (await query("SELECT qr_source_id FROM feedback_responses WHERE source_type = 'theke'")).rows;
    expect(votes).toEqual([{ qr_source_id: tonight.id }]);
  });

  it('counts a scan for no place of another event', async () => {
    const event = (await query("SELECT organization_id FROM events WHERE slug = 'demo-nacht'")).rows[0];
    const { slug } = (await query('SELECT slug FROM organizations WHERE id = $1', [event.organization_id])).rows[0];
    const other = (await query(
      `INSERT INTO events (organization_id, name, slug, event_feedback_token, date_from, status)
       VALUES ($1, 'Anderer Abend', 'anderer-abend', 'token-anderer-abend', now() + interval '30 days', 'active') RETURNING id`,
      [event.organization_id]
    )).rows[0];
    const everywhere = (await create({ sourceSlug: 'weinstand', label: 'Weinstand' })).body;
    const elsewhere = (await create({ sourceSlug: 'weinstand', label: 'Weinstand am anderen Abend', type: 'event_specific', eventId: other.id })).body;

    expect((await request('GET', `/public/f/${slug}/weinstand`)).status).toBe(200);

    const scans = Object.fromEntries((await query('SELECT id, scans_count FROM qr_sources WHERE id = ANY($1::uuid[])', [[everywhere.id, elsewhere.id]])).rows.map((row) => [row.id, row.scans_count]));
    expect(scans).toEqual({ [everywhere.id]: 1, [elsewhere.id]: 0 });
  });
});

describe('a vote on its way while its place is deleted', () => {
  it('is stored under the short name, without the place', async () => {
    const event = (await query("SELECT * FROM events WHERE slug = 'demo-nacht'")).rows[0];
    const gone = { id: '00000000-0000-4000-8000-00000000abcd', label: 'Weg' };

    const { qrSource, result } = await withoutGonePlace(gone, (source) => recordRating({
      event,
      rating: 3,
      sessionKey: 'gast-am-geloeschten-platz',
      sourceType: 'weg',
      qrSourceId: source?.id || null,
      userAgent: 'Testbrowser',
      ip: '192.0.2.10'
    }));

    expect(qrSource).toBe(null);
    expect(result.created).toBe(true);
    const stored = (await query('SELECT qr_source_id, source_type FROM feedback_responses WHERE id = $1', [result.id])).rows[0];
    expect(stored).toEqual({ qr_source_id: null, source_type: 'weg' });
  });

  it('passes every other failure on at once', async () => {
    const failures = [
      Object.assign(new Error('doppelt'), { code: '23505' }),
      Object.assign(new Error('insert or update on table "feedback_responses" violates foreign key constraint "feedback_responses_event_id_fkey"'), { code: '23503', constraint: 'feedback_responses_event_id_fkey' })
    ];

    for (const failure of failures) {
      const calls = [];
      await expect(withoutGonePlace({ id: 'platz' }, async (source) => { calls.push(source); throw failure; })).rejects.toBe(failure);
      expect(calls).toEqual([{ id: 'platz' }]);
    }
  });
});
