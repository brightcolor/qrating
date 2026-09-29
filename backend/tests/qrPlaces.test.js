import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { env } from '../src/config/env.js';
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
