import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { PretixService } from '../src/services/pretixService.js';
import { encryptSecret } from '../src/utils/crypto.js';

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

async function countRows(sql, params = []) {
  return (await query(sql, params)).rows[0].count;
}

async function demoEvent() {
  return (await query("SELECT * FROM events WHERE slug = 'demo-nacht'")).rows[0];
}

describe('backend flows against PostgreSQL', () => {
  beforeAll(async () => {
    await runMigrations();
    await seedDefaultData();
    server = app.listen(0);
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await db.close();
  });

  it('serves the guest page with the organization and event texts', async () => {
    const event = await demoEvent();
    await query(
      `INSERT INTO text_templates (organization_id, event_id, language, key, value)
       VALUES ($1, NULL, 'de', 'submit', 'Abschicken'),
              ($1, $2, 'de', 'thank_headline', 'Merci für dein Feedback'),
              ($1, NULL, 'en', 'subtitle', 'English subtitle')`,
      [event.organization_id, event.id]
    );

    const dynamic = await request('GET', '/public/f/demo-events');
    expect(dynamic.status).toBe(200);
    expect(dynamic.body.event.name).toBe('Demo Nacht');
    expect(dynamic.body.event.questions.map((question) => question.internal_name))
      .toEqual(['positive_tags', 'improvement_tags', 'moment']);
    expect(dynamic.body.texts.headline).toBe('Wie war dein Abend bei Demo Nacht?');
    expect(dynamic.body.texts.submit).toBe('Abschicken');
    expect(dynamic.body.texts.next_label).toBe('Weiter');
    expect(dynamic.body.texts.stamp_label).toBe('Angekommen');
    expect(dynamic.body.texts.thank_headline).toBe('Merci für dein Feedback');
    expect(dynamic.body.texts.subtitle)
      .toBe('Schön, dass du da warst. Dein Feedback macht den nächsten Abend besser.');

    const eventQr = await request('GET', `/public/e/${event.event_feedback_token}`);
    expect(eventQr.status).toBe(200);
    expect(eventQr.body.texts.submit).toBe('Abschicken');
  });

  it('shows a contact address on the product domain on the public website', async () => {
    const site = await request('GET', '/public/site');

    expect(site.status).toBe(200);
    expect(site.body.content.contactEmail).toBe('kontakt@qrating.de');
    expect(site.body.content.imprint).toContain('E-Mail: kontakt@qrating.de');
  });

  it('shows the current website texts and plan descriptions on an untouched installation', async () => {
    const site = await request('GET', '/public/site');

    expect(site.body.content.headline).toBe('Dein Publikum hat was zu sagen.');
    expect(site.body.content.heroImageUrl).toBe('');
    expect(site.body.content.features).toHaveLength(6);
    expect(site.body.content.pricing.map((plan) => plan.price)).toEqual(['0 € / Monat', '29 € / Monat', '79 € / Monat']);
    expect(site.body.content.pricing[0]).toMatchObject({
      text: 'Für den Einstieg mit wenigen Events',
      ctaLabel: 'Free anfragen'
    });
    expect(site.body.content.pricing[0].features).toContain('2 aktive Events, 1 Benutzer');
    // The seeded legal placeholders show the current wording with umlauts.
    expect(site.body.content.imprint).toContain('Angaben gemäß Impressumspflicht');
    expect(site.body.content.imprint).toContain('Musterstraße 1');
    expect(site.body.content.privacy).toMatch(/^Datenschutzerklärung\n/);
  });

  it('stores guest feedback with the answers of the event form', async () => {
    const event = await demoEvent();
    const response = await request('POST', `/public/events/${event.event_feedback_token}/feedback`, {
      body: {
        rating: 5,
        startedAt: '2026-01-01T00:00:00.000Z',
        answers: { moment: 'Die Zugabe', positive_tags: ['Gute Musik'], unknown_question: 'ignored' }
      }
    });
    expect(response.status).toBe(201);

    const answers = await query(
      `SELECT q.internal_name, a.answer_value
       FROM feedback_answers a
       JOIN feedback_questions q ON q.id = a.feedback_question_id
       ORDER BY q.sort_order`
    );
    expect(answers.rows).toEqual([
      { internal_name: 'positive_tags', answer_value: ['Gute Musik'] },
      { internal_name: 'moment', answer_value: 'Die Zugabe' }
    ]);
  });

  it('seeds the demo data only once across backend restarts', async () => {
    await seedDefaultData();
    await seedDefaultData();

    expect(await countRows('SELECT count(*)::int AS count FROM organizations')).toBe(1);
    expect(await countRows(
      `SELECT count(*)::int AS count FROM feedback_forms f
       JOIN events e ON e.id = f.event_id
       WHERE e.slug = 'demo-nacht'`
    )).toBe(1);
    expect(await countRows('SELECT count(*)::int AS count FROM feedback_questions')).toBe(3);
  });

  it('keeps starting after the first admin renamed the organization', async () => {
    const setup = await request('POST', '/admin/setup/first-admin', {
      body: {
        name: 'Test Owner',
        email: 'owner@example.test',
        password: 'test-password-123',
        organizationName: 'Beispiel Events GmbH'
      }
    });
    expect(setup.status).toBe(201);
    ownerCookie = setup.cookie;

    await seedDefaultData();

    const organizations = await query('SELECT slug FROM organizations');
    expect(organizations.rows).toEqual([{ slug: 'beispiel-events-gmbh' }]);
  });

  it('creates a manual event next to the demo event', async () => {
    const created = await request('POST', '/admin/events', {
      cookie: ownerCookie,
      body: {
        name: 'Sommerfest',
        dateFrom: '2026-07-01T18:00:00.000Z',
        location: 'Hof',
        imageUrl: 'https://example.test/sommerfest.jpg'
      }
    });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Sommerfest', source: 'manual', image_source: 'manual' });
    expect(await countRows("SELECT count(*)::int AS count FROM events WHERE source = 'manual'")).toBe(2);
  });

  it('closes the guest page for an event that is a draft or finished', async () => {
    const event = (await query("SELECT id, event_feedback_token FROM events WHERE slug = 'demo-nacht'")).rows[0];

    for (const status of ['draft', 'closed', 'archived']) {
      const changed = await request('PATCH', `/admin/events/${event.id}`, { cookie: ownerCookie, body: { status } });
      expect(changed.status).toBe(200);
      const guest = await request('GET', `/public/e/${event.event_feedback_token}`);
      expect(guest.status).toBe(410);
    }

    const back = await request('PATCH', `/admin/events/${event.id}`, { cookie: ownerCookie, body: { status: 'active' } });
    expect(back.status).toBe(200);
    const open = await request('GET', `/public/e/${event.event_feedback_token}`);
    expect(open.status).toBe(200);
  });

  it('names the statuses an event can have', async () => {
    const event = (await query("SELECT id FROM events WHERE slug = 'demo-nacht'")).rows[0];

    const refused = await request('PATCH', `/admin/events/${event.id}`, { cookie: ownerCookie, body: { status: 'halb-fertig' } });

    expect(refused.status).toBe(400);
    expect(refused.body.error).toContain('draft, active, closed, archived');
  });

  it('creates another event with a name that is already taken', async () => {
    // The Free plan allows two active events; the demo event and the first own event use them up.
    await query("UPDATE organizations SET billing_override_plan = 'business'");

    const created = await request('POST', '/admin/events', {
      cookie: ownerCookie,
      body: { name: 'Sommerfest', dateFrom: '2027-07-01T18:00:00.000Z' }
    });

    expect(created.status).toBe(201);
    expect(created.body.image_source).toBeNull();
    const slugs = (await query("SELECT slug FROM events WHERE name = 'Sommerfest'")).rows.map((row) => row.slug);
    expect(slugs).toHaveLength(2);
    expect(new Set(slugs).size).toBe(2);
  });

  it('escapes the event name on the print page and allows only its own print script', async () => {
    const created = await request('POST', '/admin/events', {
      cookie: ownerCookie,
      body: { name: '<img src=x onerror=alert(1)>', dateFrom: '2026-08-01T18:00:00.000Z' }
    });
    expect(created.status).toBe(201);

    const response = await fetch(`${baseUrl}/admin/events/${created.body.id}/qr-print`, {
      headers: { cookie: ownerCookie }
    });
    expect(response.status).toBe(200);
    const page = await response.text();

    expect(page).toContain('<p class="event">&lt;img src=x onerror=alert(1)&gt;</p>');
    expect(page).toContain('<title>QR-Aushang: &lt;img src=x onerror=alert(1)&gt;</title>');
    expect(page).not.toContain('<img');
    expect(page).not.toContain('onerror=alert(1)>');

    // The print dialog runs from a nonce that only this response allows.
    const nonce = /script-src 'nonce-([\w-]+)'/.exec(response.headers.get('content-security-policy'))?.[1];
    expect(nonce).toBeTruthy();
    expect(page).toContain(`<script nonce="${nonce}">`);
    expect(page).toContain('>Drucken<');
  });

  it('sets, changes and removes the picture of an event', async () => {
    const created = await request('POST', '/admin/events', {
      cookie: ownerCookie,
      body: { name: 'Bilderabend', dateFrom: '2027-08-01T18:00:00.000Z' }
    });
    expect(created.status).toBe(201);
    const eventId = created.body.id;

    const withImage = await request('PATCH', `/admin/events/${eventId}`, {
      cookie: ownerCookie,
      body: { imageUrl: 'https://example.test/bilderabend.jpg', imageAlt: 'Bühne im Hof' }
    });
    expect(withImage.status).toBe(200);
    expect(withImage.body).toMatchObject({
      image_url: 'https://example.test/bilderabend.jpg',
      image_alt: 'Bühne im Hof',
      image_source: 'manual'
    });

    const changed = await request('PATCH', `/admin/events/${eventId}`, {
      cookie: ownerCookie,
      body: { imageUrl: 'https://example.test/bilderabend-zwei.jpg' }
    });
    expect(changed.body).toMatchObject({
      image_url: 'https://example.test/bilderabend-zwei.jpg',
      image_alt: 'Bühne im Hof',
      image_source: 'manual'
    });

    // Editing other fields leaves the picture untouched.
    const renamed = await request('PATCH', `/admin/events/${eventId}`, {
      cookie: ownerCookie,
      body: { name: 'Bilderabend im Hof' }
    });
    expect(renamed.body).toMatchObject({
      name: 'Bilderabend im Hof',
      image_url: 'https://example.test/bilderabend-zwei.jpg',
      image_source: 'manual'
    });

    const removed = await request('PATCH', `/admin/events/${eventId}`, {
      cookie: ownerCookie,
      body: { imageUrl: '' }
    });
    expect(removed.status).toBe(200);
    expect(removed.body.image_url).toBeNull();
    expect(removed.body.image_alt).toBeNull();
    expect(removed.body.image_source).toBeNull();
  });

  it('offers German form templates and creates an event form from one', async () => {
    const profiles = await request('GET', '/admin/forms/profiles', { cookie: ownerCookie });
    expect(profiles.status).toBe(200);
    const byId = Object.fromEntries(profiles.body.builtIn.map((profile) => [profile.id, profile]));
    expect(byId['club-party'].name).toBe('Party & Club');
    expect(byId.festival.name).toBe('Festival');
    expect(byId['birthday-party'].questions[0]).toEqual({ label: 'Wie war die Stimmung?', questionType: 'rating' });

    const event = (await query("SELECT id FROM events WHERE name = 'Sommerfest' ORDER BY date_from LIMIT 1")).rows[0];
    const created = await request('POST', '/admin/forms/from-profile', {
      cookie: ownerCookie,
      body: { profileId: 'birthday-party', eventId: event.id, name: 'Feier von Alex' }
    });
    expect(created.status).toBe(201);
    const questions = await query(
      'SELECT internal_name, options FROM feedback_questions WHERE feedback_form_id = $1 ORDER BY sort_order',
      [created.body.id]
    );
    expect(questions.rows.map((row) => row.internal_name))
      .toEqual(['mood_rating', 'positive_tags', 'improvement_tags', 'danced', 'birthday_wishes']);
    expect(questions.rows[1].options).toContain('Überraschungen');
  });

  it('keeps one event per Pretix event across repeated syncs', async () => {
    const organizationId = (await query('SELECT id FROM organizations')).rows[0].id;
    const connection = (await query(
      `INSERT INTO pretix_connections (organization_id, base_url, pretix_organizer_slug, api_token_encrypted)
       VALUES ($1, 'https://pretix.example.test', 'demo', $2)
       RETURNING *`,
      [organizationId, encryptSecret('test-token')]
    )).rows[0];
    const service = new PretixService({ query });
    const pretixEvent = { slug: 'herbstfest', name: { de: 'Herbstfest' }, date_from: '2026-10-01T18:00:00Z' };

    await service.upsertPretixEvent(connection, pretixEvent);
    await service.upsertPretixEvent(connection, { ...pretixEvent, name: { de: 'Herbstfest 2026' } });

    const events = await query('SELECT name FROM events WHERE pretix_connection_id = $1', [connection.id]);
    expect(events.rows).toEqual([{ name: 'Herbstfest 2026' }]);
  });

  it('imports Pretix events that carry no picture', async () => {
    const organizationId = (await query('SELECT id FROM organizations')).rows[0].id;
    const connection = (await query(
      `INSERT INTO pretix_connections (organization_id, base_url, pretix_organizer_slug, api_token_encrypted, import_event_images)
       VALUES ($1, 'https://pretix.example.test', 'ohne-bild', $2, true)
       RETURNING *`,
      [organizationId, encryptSecret('test-token')]
    )).rows[0];
    const eventList = {
      count: 2,
      results: [
        { slug: 'sommernacht', name: { de: 'Sommernacht' }, date_from: '2026-08-01T18:00:00Z', live: true },
        { slug: 'winternacht', name: { de: 'Winternacht' }, date_from: '2026-12-01T18:00:00Z', live: true }
      ]
    };
    // Pretix answers the settings of both events without any image key.
    const fetchImpl = vi.fn(async (url) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes('/settings/') ? {} : eventList)
    }));

    const result = await new PretixService({ query }, fetchImpl).syncConnection(connection);

    expect(result).toEqual({ imported: 2, images: 0 });
    const events = await query(
      'SELECT slug, image_sync_error FROM events WHERE pretix_connection_id = $1 ORDER BY slug',
      [connection.id]
    );
    expect(events.rows.map((row) => row.slug)).toEqual(['sommernacht', 'winternacht']);
    expect(events.rows[0].image_sync_error).toBe('Kein Bild-Key in Pretix-Settings gefunden.');
    const status = await query('SELECT last_sync_status, last_sync_error FROM pretix_connections WHERE id = $1', [connection.id]);
    expect(status.rows[0]).toEqual({ last_sync_status: '2 Events synchronisiert, 0 Bilder erkannt', last_sync_error: null });
  });

  it('keeps a manually set picture when Pretix syncs the event again', async () => {
    const event = (await query("SELECT * FROM events WHERE slug = 'sommernacht'")).rows[0];
    const connection = (await query(
      "SELECT * FROM pretix_connections WHERE pretix_organizer_slug = 'ohne-bild'"
    )).rows[0];

    const patched = await request('PATCH', `/admin/events/${event.id}`, {
      cookie: ownerCookie,
      body: { imageUrl: 'https://example.test/eigenes-bild.jpg', imageAlt: 'Eigenes Bild' }
    });
    expect(patched.status).toBe(200);
    expect(patched.body.image_source).toBe('manual');

    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const result = await new PretixService({ query }, fetchImpl)
      .syncImageForEvent(connection, patched.body, 'sommernacht');

    expect(result).toMatchObject({ skipped: 'manual_image_preferred' });
    expect(fetchImpl).not.toHaveBeenCalled();
    const after = (await query('SELECT image_url, image_alt, image_source FROM events WHERE id = $1', [event.id])).rows[0];
    expect(after).toEqual({
      image_url: 'https://example.test/eigenes-bild.jpg',
      image_alt: 'Eigenes Bild',
      image_source: 'manual'
    });
  });

  it('removes demo forms that older releases duplicated on every start', async () => {
    const event = await demoEvent();
    const seededForm = (await query('SELECT id FROM feedback_forms WHERE event_id = $1', [event.id])).rows[0].id;
    const insertDuplicate = async (minutesLater) => (await query(
      `INSERT INTO feedback_forms (organization_id, event_id, name, description, active, created_at)
       VALUES ($1, $2, 'Schnellfeedback', 'Kurzes Standardformular', true, now() + $3 * interval '1 minute')
       RETURNING id`,
      [event.organization_id, event.id, minutesLater]
    )).rows[0].id;
    await insertDuplicate(1);
    const answeredCopy = await insertDuplicate(2);
    const question = (await query(
      `INSERT INTO feedback_questions (feedback_form_id, question_type, internal_name, label)
       VALUES ($1, 'text_long', 'moment', 'Was war dein Moment des Abends?')
       RETURNING id`,
      [answeredCopy]
    )).rows[0].id;
    const feedback = (await query(
      `INSERT INTO feedback_responses (organization_id, event_id, source_type, rating)
       VALUES ($1, $2, 'event_specific', 4)
       RETURNING id`,
      [event.organization_id, event.id]
    )).rows[0].id;
    await query(
      `INSERT INTO feedback_answers (feedback_response_id, feedback_question_id, answer_value)
       VALUES ($1, $2, '"Lichtshow"')`,
      [feedback, question]
    );

    const migration = await readFile(
      new URL('../../database/migrations/010_manual_events_and_demo_cleanup.sql', import.meta.url),
      'utf8'
    );
    await query(migration);

    const remaining = await query('SELECT id FROM feedback_forms WHERE event_id = $1 ORDER BY created_at', [event.id]);
    expect(remaining.rows.map((row) => row.id)).toEqual([seededForm, answeredCopy]);
  });

  it('keeps website texts and plans that were saved in the admin area when the refresh runs again', async () => {
    const saved = await request('PATCH', '/admin/site-content', {
      cookie: ownerCookie,
      body: { content: { headline: 'Ein QR-Code. Echtes Feedback nach jedem Event.', faqHeadline: 'Eure Fragen' } }
    });
    expect(saved.status).toBe(200);
    await query(
      `UPDATE billing_plans
       SET summary = 'Basics fuer den Einstieg.', updated_at = created_at + interval '1 minute'
       WHERE plan_key = 'free'`
    );

    const migration = await readFile(
      new URL('../../database/migrations/012_website_refresh.sql', import.meta.url),
      'utf8'
    );
    await query(migration);

    const site = await request('GET', '/public/site');
    expect(site.body.content.headline).toBe('Ein QR-Code. Echtes Feedback nach jedem Event.');
    expect(site.body.content.faqHeadline).toBe('Eure Fragen');
    expect(site.body.content.pricing[0].text).toBe('Basics fuer den Einstieg.');
  });

  it('replaces only the legal placeholders of earlier releases', async () => {
    const legacyImprint = 'Angaben gemaess Impressumspflicht\n\nqrating Betreiber\nMusterstrasse 1\n12345 Musterstadt\n\n'
      + 'E-Mail: kontakt@qrating.de\n\nBitte passe dieses Impressum vor dem produktiven Betrieb im Adminbereich an.';
    await query(
      `UPDATE site_content
       SET content = content || jsonb_build_object('imprint', $1::text, 'privacy', $2::text)
       WHERE scope = 'default' AND language = 'de'`,
      [legacyImprint, 'Datenschutz der Musterfirma, gemaess eigener Vorlage']
    );

    const migration = await readFile(
      new URL('../../database/migrations/013_legal_placeholder_umlauts.sql', import.meta.url),
      'utf8'
    );
    await query(migration);

    const site = await request('GET', '/public/site');
    expect(site.body.content.imprint).toContain('Angaben gemäß Impressumspflicht');
    expect(site.body.content.privacy).toBe('Datenschutz der Musterfirma, gemaess eigener Vorlage');
  });

  it('answers failed requests with messages people can act on', async () => {
    const wrongPassword = await request('POST', '/admin/login', {
      body: { email: 'owner@example.test', password: 'falsches-passwort' }
    });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error).toBe('E-Mail oder Passwort ist falsch. Prüfe beides oder setze dein Passwort zurück.');

    const event = await demoEvent();
    const noRating = await request('POST', `/public/events/${event.event_feedback_token}/feedback`, { body: { rating: 0 } });
    expect(noRating.status).toBe(400);
    expect(noRating.body.error).toBe('Bitte wähle eine Bewertung von 1 bis 5 Sternen.');

    const brokenBody = await fetch(`${baseUrl}/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"email":'
    });
    expect(brokenBody.status).toBe(400);
    expect((await brokenBody.json()).error).toBe('Die gesendeten Daten ließen sich nicht lesen. Lade die Seite neu und versuche es erneut.');

    const foreignOrigin = await fetch(`${baseUrl}/public/site`, { headers: { origin: 'https://fremde-seite.example' } });
    expect(foreignOrigin.status).toBe(403);
    expect((await foreignOrigin.json()).error).toContain('Die Adresse https://fremde-seite.example ist für qrating nicht freigegeben.');

    const browserLink = await fetch(`${baseUrl}/admin/events/${event.id}/export.csv`, { headers: { accept: 'text/html' } });
    expect(browserLink.status).toBe(401);
    expect(browserLink.headers.get('content-type')).toContain('text/html');
    expect(await browserLink.text()).toContain('Du bist nicht angemeldet. Bitte melde dich an.');

    const unknownRoute = await request('GET', '/public/gibt-es-nicht');
    expect(unknownRoute.status).toBe(404);
    expect(unknownRoute.body.error).toContain('Diese Funktion gibt es auf dem Server nicht.');
  });
});
