import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { MailwizzClient, NewsletterService, pretixEventName } from '../src/services/newsletterService.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let ownerCookie;
let event;
const pretixName = 'Wismar tanzt - Gestört aber GeiL';

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

// Collects what would go to MailWizz.
function recordingClient(calls, { fail = null } = {}) {
  return {
    subscribe: async (fields) => {
      calls.push(fields);
      if (fail) throw new Error(fail);
      return { status: 'created' };
    },
    test: async () => ({ status: 'ok', list: 'Gäste' })
  };
}

async function submitFeedback(email) {
  const answer = await request('POST', `/public/events/${event.event_feedback_token}/feedback`, {
    body: { rating: 5, newsletterOptin: true, newsletterEmail: email, sourceType: 'event_specific' }
  });
  return answer;
}

describe('newsletter connection to MailWizz', () => {
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

    const created = await request('POST', '/admin/events', {
      cookie: ownerCookie,
      body: { name: 'Wismar tanzt', dateFrom: new Date(Date.now() - 86_400_000).toISOString(), eventTimezone: 'Europe/Berlin' }
    });
    expect(created.status).toBe(201);
    // The event stands for one that came from Pretix, with the payload of the sync.
    event = (await query(
      `UPDATE events SET source = 'pretix', raw_source_payload = $2 WHERE id = $1 RETURNING *`,
      [created.body.id, JSON.stringify({ slug: 'wismar-tanzt', name: { de: pretixName, en: 'Wismar dances' } })]
    )).rows[0];
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await db.close();
  });

  it('reads the event name the way Pretix wrote it', () => {
    expect(pretixEventName(event)).toBe(pretixName);
    expect(pretixEventName({ name: 'Handgemachtes Event' })).toBe('Handgemachtes Event');
    expect(pretixEventName({ name: 'Eigener Name', raw_source_payload: { name: { de: 'Name aus Pretix' } } })).toBe('Name aus Pretix');
    expect(pretixEventName({ name: '', raw_source_payload: null })).toBe(null);
    expect(pretixEventName(null)).toBe(null);
  });

  it('speaks the MailWizz API and repeats itself for a known address', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1
        ? { status: 409, ok: false, text: async () => JSON.stringify({ status: 'error', error: 'Subscriber exists' }) }
        : { status: 200, ok: true, text: async () => JSON.stringify({ status: 'success' }) };
    };
    const client = new MailwizzClient({ apiUrl: 'https://news.example.test/api/', apiKey: 'geheim', listUid: 'list123', fetchImpl });

    const result = await client.subscribe({ EMAIL: 'gast@example.com', VERANSTALTUNG: pretixName });

    expect(result).toEqual({ status: 'updated' });
    expect(calls[0].url).toBe('https://news.example.test/api/lists/list123/subscribers');
    expect(calls[0].options.headers['X-API-KEY']).toBe('geheim');
    expect(calls[0].options.body).toContain('EMAIL=gast%40example.com');
    expect(calls[0].options.body).toContain('VERANSTALTUNG=Wismar');
    expect(calls[1].url).toBe('https://news.example.test/api/lists/list123/subscribers/search-by-email-and-update');
    expect(calls[1].options.method).toBe('PUT');
  });

  it('says in plain words what MailWizz refused', async () => {
    const fetchImpl = async () => ({ status: 401, ok: false, text: async () => JSON.stringify({ status: 'error', error: 'Invalid key' }) });
    const client = new MailwizzClient({ apiUrl: 'https://news.example.test/api', apiKey: 'falsch', listUid: 'list123', fetchImpl });

    await expect(client.subscribe({ EMAIL: 'gast@example.com' })).rejects.toThrow(/API-Schlüssel abgelehnt \(HTTP 401\)/);
  });

  it('keeps the key to itself when the connection is saved', async () => {
    const saved = await request('PUT', '/admin/newsletter', {
      cookie: ownerCookie,
      body: { apiUrl: 'https://news.example.test/api/', apiKey: 'geheimer-schluessel', listUid: 'list123', eventFieldTag: 'veranstaltung', enabled: true }
    });

    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ api_url: 'https://news.example.test/api', list_uid: 'list123', event_field_tag: 'VERANSTALTUNG', has_api_key: true });
    expect(JSON.stringify(saved.body)).not.toContain('geheimer-schluessel');

    const stored = (await query('SELECT api_key_encrypted FROM newsletter_connections')).rows[0];
    expect(stored.api_key_encrypted).not.toContain('geheimer-schluessel');

    const view = await request('GET', '/admin/newsletter', { cookie: ownerCookie });
    expect(view.body.connection).toMatchObject({ has_api_key: true, enabled: true });
    expect(view.body.connection.api_key_encrypted).toBeUndefined();
  });

  it('refuses an address and a field tag that MailWizz cannot use', async () => {
    const badUrl = await request('PUT', '/admin/newsletter', {
      cookie: ownerCookie,
      body: { apiUrl: 'news.example.test', apiKey: 'x', listUid: 'list123' }
    });
    expect(badUrl.status).toBe(400);
    expect(badUrl.body.error).toContain('API-Adresse');

    const badTag = await request('PUT', '/admin/newsletter', {
      cookie: ownerCookie,
      body: { apiUrl: 'https://news.example.test/api', apiKey: 'x', listUid: 'list123', eventFieldTag: 'Feld mit Leerzeichen' }
    });
    expect(badTag.status).toBe(400);
    expect(badTag.body.error).toContain('Feldkürzel');
  });

  it('hands a new entry over with the event of the entry', async () => {
    const feedback = await submitFeedback('gast@example.com');
    expect(feedback.status).toBe(201);

    const job = (await query("SELECT * FROM background_jobs WHERE job_type = 'newsletter.sync'")).rows[0];
    expect(job).toBeTruthy();

    const calls = [];
    const newsletter = new NewsletterService({ query }, { createClient: () => recordingClient(calls) });
    const result = await newsletter.syncOptin(job.payload.optinId);

    expect(result).toEqual({ status: 'created' });
    expect(calls).toEqual([{ EMAIL: 'gast@example.com', VERANSTALTUNG: pretixName }]);

    const optin = (await query('SELECT * FROM newsletter_optins WHERE id = $1', [job.payload.optinId])).rows[0];
    expect(optin.sync_status).toBe('created');
    expect(optin.synced_at).toBeTruthy();
    const connection = (await query('SELECT * FROM newsletter_connections')).rows[0];
    expect(connection.last_sync_status).toBe('created');
  });

  it('keeps the reason at the entry when MailWizz says no', async () => {
    const feedback = await submitFeedback('zweiter@example.com');
    expect(feedback.status).toBe(201);
    const job = (await query("SELECT * FROM background_jobs WHERE job_type = 'newsletter.sync' ORDER BY created_at DESC")).rows[0];

    const newsletter = new NewsletterService({ query }, { createClient: () => recordingClient([], { fail: 'MailWizz hat mit HTTP 500 geantwortet.' }) });

    await expect(newsletter.syncOptin(job.payload.optinId)).rejects.toThrow('HTTP 500');
    const optin = (await query('SELECT * FROM newsletter_optins WHERE id = $1', [job.payload.optinId])).rows[0];
    expect(optin.sync_status).toBe('failed');
    expect(optin.sync_error).toContain('HTTP 500');
    expect(optin.synced_at).toBe(null);
  });

  it('queues nothing while the handover is switched off', async () => {
    await query('UPDATE newsletter_connections SET enabled = false');
    const before = (await query("SELECT count(*)::int AS total FROM background_jobs WHERE job_type = 'newsletter.sync'")).rows[0].total;

    const feedback = await submitFeedback('dritter@example.com');
    expect(feedback.status).toBe(201);

    const after = (await query("SELECT count(*)::int AS total FROM background_jobs WHERE job_type = 'newsletter.sync'")).rows[0].total;
    expect(after).toBe(before);
    await query('UPDATE newsletter_connections SET enabled = true');
  });

  it('collects the entries that are still open', async () => {
    const queued = await request('POST', '/admin/newsletter/sync-pending', { cookie: ownerCookie });

    expect(queued.status).toBe(200);
    expect(queued.body.queued).toBeGreaterThan(0);
  });
});
