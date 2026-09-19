import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { controllerOf, privacySections } from '../src/services/privacyService.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let ownerCookie;
let slug;

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

function textOf(page) {
  return page.sections
    .map((section) => [...(section.paragraphs || []), ...(section.items || [])].join(' '))
    .join(' ');
}

describe('the page that says what happens with the data', () => {
  beforeAll(async () => {
    await runMigrations();
    await seedDefaultData();
    server = app.listen(0);
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const setup = await request('POST', '/admin/setup/first-admin', {
      body: { name: 'Owner', email: 'owner@example.test', password: 'test-password-123', organizationName: 'HSP-Events' }
    });
    expect(setup.status).toBe(201);
    ownerCookie = setup.cookie;
    slug = (await query('SELECT slug FROM organizations LIMIT 1')).rows[0].slug;
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await db.close();
  });

  it('marks itself as incomplete while the responsible party is missing', async () => {
    const page = await request('GET', `/public/privacy/${slug}`);

    expect(page.status).toBe(200);
    expect(page.body.controller.complete).toBe(false);
    expect(page.body.sections.find((section) => section.id === 'verantwortlich').paragraphs[0]).toContain('stehen noch aus');
  });

  it('names the responsible party once it is filled in', async () => {
    const saved = await request('PATCH', '/admin/branding', {
      cookie: ownerCookie,
      body: { legalName: 'HSP-Events GmbH', legalAddress: 'Dankwartstr. 43, 23966 Wismar', legalEmail: 'datenschutz@example.com' }
    });
    expect(saved.status).toBe(200);

    const page = await request('GET', `/public/privacy/${slug}`);

    expect(page.body.controller).toMatchObject({ name: 'HSP-Events GmbH', complete: true });
    expect(textOf(page.body)).toContain('Dankwartstr. 43');
    expect(textOf(page.body)).toContain('datenschutz@example.com');
  });

  it('answers a wrong address with a sentence people can act on', async () => {
    const page = await request('GET', '/public/privacy/gibt-es-nicht');

    expect(page.status).toBe(404);
    expect(page.body.message).toMatch(/Datenschutzseite/);
    expect(page.body.message).toMatch(/Link|QR-Code/);
  });

  it('names the newsletter system only while one is connected', async () => {
    const without = await request('GET', `/public/privacy/${slug}`);
    expect(textOf(without.body)).not.toContain('news.example.com');

    const saved = await request('PUT', '/admin/newsletter', {
      cookie: ownerCookie,
      body: { apiUrl: 'https://news.example.com/api', apiKey: 'schluessel', listUid: 'liste-1' }
    });
    expect(saved.status).toBe(200);

    const withOne = await request('GET', `/public/privacy/${slug}`);
    expect(textOf(withOne.body)).toContain('news.example.com');
  });

  it('says that an abandoned rating is kept, and what is left out of it', async () => {
    const page = await request('GET', `/public/privacy/${slug}`);
    const collected = page.body.sections.find((section) => section.id === 'erhoben').items.join(' ');

    // The software stores answers of people who never pressed send, so the page says so.
    expect(collected).toMatch(/auch dann, wenn du die Bewertung abbrichst/i);
    expect(collected).toMatch(/Rufnummer, Anliegen und E-Mail-Adresse sind davon ausgenommen/i);
  });

  it('claims no confirmation mail it never sends', async () => {
    const page = await request('GET', `/public/privacy/${slug}`);

    expect(textOf(page.body)).not.toMatch(/bestätigst sie über eine E-Mail/i);
  });

  it('names the mail server once one is set up, because the callback number travels that way', async () => {
    const organization = (await query('SELECT id FROM organizations LIMIT 1')).rows[0];
    const without = await request('GET', `/public/privacy/${slug}`);
    expect(textOf(without.body)).not.toContain('mail.example.com');

    await query(
      `INSERT INTO smtp_settings (organization_id, host, port, from_email, enabled)
       VALUES ($1, 'mail.example.com', 587, 'feedback@example.com', true)
       ON CONFLICT (organization_id) DO UPDATE SET host = EXCLUDED.host, enabled = true`,
      [organization.id]
    );

    const withOne = await request('GET', `/public/privacy/${slug}`);
    expect(textOf(withOne.body)).toContain('mail.example.com');
    expect(textOf(withOne.body)).toContain('Rückrufnummer');
  });

  it('promises in the same breath that nothing goes further', async () => {
    const page = await request('GET', `/public/privacy/${slug}`);
    const receivers = page.body.sections.find((section) => section.id === 'empfaenger');

    expect(receivers.items.join(' ')).toContain('geben wir deine Daten an niemanden weiter');
  });

  it('reads the deletion periods out of the settings', () => {
    const sections = privacySections({
      name: 'Test',
      retention_feedback_days: 400,
      retention_newsletter_days: null,
      retention_low_rating_phone_days: 90
    });
    const periods = sections.find((section) => section.id === 'dauer').items;

    expect(periods[0]).toContain('400 Tage');
    expect(periods[1]).toContain('bis die Veranstalterin sie löscht');
    expect(periods[2]).toContain('90 Tage');
  });

  it('falls back to the name of the organization for the responsible party', () => {
    expect(controllerOf({ name: 'HSP-Events' })).toMatchObject({ name: 'HSP-Events', complete: false });
    expect(controllerOf({ name: 'HSP-Events', legal_name: '  ' }).name).toBe('HSP-Events');
  });
});
