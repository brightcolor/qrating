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
      .toEqual(['moment', 'positive_tags', 'improvement_tags']);
    expect(dynamic.body.texts.headline).toBe('Wie war dein Abend bei Demo Nacht?');
    expect(dynamic.body.texts.submit).toBe('Abschicken');
    expect(dynamic.body.texts.thank_headline).toBe('Merci für dein Feedback');
    expect(dynamic.body.texts.subtitle)
      .toBe('Dein Feedback hilft uns, kommende Events noch schöner, entspannter und besser zu machen.');

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
      { internal_name: 'moment', answer_value: 'Die Zugabe' },
      { internal_name: 'positive_tags', answer_value: ['Gute Musik'] }
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
});
