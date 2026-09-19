import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { abandonedEntries, formatDraftValue } from '../src/services/guestSessionService.js';

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

function report(sessionKey, { step = 'rating', index = 0, draft }) {
  return request('POST', `/public/events/${event.event_feedback_token}/progress`, {
    body: { sessionKey, step, stepKind: 'question', stepLabel: 'Frage', stepIndex: index, stepsTotal: 4, sourceType: 'dynamic', draft }
  });
}

async function storedDraft(sessionKey) {
  return (await query('SELECT draft FROM guest_sessions WHERE session_key = $1', [sessionKey])).rows[0]?.draft ?? null;
}

describe('what guests gave on the way', () => {
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
    event = (await query("SELECT * FROM events WHERE slug = 'demo-nacht'")).rows[0];
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await db.close();
  });

  it('keeps the answers of a visit that never sent anything off', async () => {
    const answer = await report('offen-1', {
      draft: { rating: 2, answers: { musik: 'zu laut' }, commentImprovement: 'Der Einlass war zäh', newsletter: false }
    });

    expect(answer.status).toBe(200);
    expect(await storedDraft('offen-1')).toMatchObject({
      rating: 2,
      answers: { musik: 'zu laut' },
      commentImprovement: 'Der Einlass war zäh',
      newsletter: false
    });
  });

  it('drops contact details even when a page sends them along', async () => {
    await report('offen-2', {
      draft: {
        rating: 1,
        contactPhone: '0151 1234567',
        contactNote: 'Bitte zurückrufen',
        newsletterEmail: 'gast@example.com',
        answers: { musik: 'laut' }
      }
    });

    // The server is the last word on this, not the page that happens to be loaded.
    const stored = JSON.stringify(await storedDraft('offen-2'));
    expect(stored).not.toContain('0151');
    expect(stored).not.toContain('gast@example.com');
    expect(stored).not.toContain('zurückrufen');
    expect(JSON.parse(stored)).toMatchObject({ rating: 1, answers: { musik: 'laut' } });
  });

  it('leaves what it has when a later step reports nothing', async () => {
    await report('offen-3', { draft: { rating: 5, answers: { musik: 'super' } } });

    await report('offen-3', { step: 'newsletter', index: 3 });

    expect(await storedDraft('offen-3')).toMatchObject({ rating: 5, answers: { musik: 'super' } });
  });

  it('lists the unfinished visits in the evaluation, with the labels of the form', async () => {
    const form = (await query('SELECT id FROM feedback_forms WHERE event_id = $1 LIMIT 1', [event.id])).rows[0];
    await query(
      `INSERT INTO feedback_questions (feedback_form_id, question_type, internal_name, label, sort_order)
       VALUES ($1, 'single_choice', 'musik', 'Wie war die Musik?', 1)`,
      [form.id]
    );

    const analytics = await request('GET', `/admin/events/${event.id}/analytics`, { cookie: ownerCookie });

    expect(analytics.status).toBe(200);
    const visit = analytics.body.abandoned.find((row) => row.rating === 2);
    expect(visit).toMatchObject({ step: 'rating', stepIndex: 0, stepsTotal: 4 });
    expect(visit.entries).toEqual([
      { label: 'Wie war die Musik?', value: 'zu laut' },
      { label: 'Was darf besser werden', value: 'Der Einlass war zäh' },
      { label: 'Newsletter', value: 'Nein' }
    ]);
  });

  it('leaves a visit out once its feedback arrived', async () => {
    await report('abgeschickt-1', { draft: { rating: 4, answers: { musik: 'gut' } } });
    const sent = await request('POST', `/public/events/${event.event_feedback_token}/feedback`, {
      body: { rating: 4, sourceType: 'dynamic', sessionKey: 'abgeschickt-1' }
    });
    expect(sent.status).toBe(201);

    const analytics = await request('GET', `/admin/events/${event.id}/analytics`, { cookie: ownerCookie });

    expect(analytics.body.abandoned.some((row) => row.entries.some((entry) => entry.value === 'gut'))).toBe(false);
  });

  it('reads a draft back in the words of the form', () => {
    const entries = abandonedEntries(
      {
        rating: 3,
        answers: { musik: ['Techno', 'House'], leer: '', zahl: 7 },
        commentPositive: 'Die Bar',
        newsletter: true
      },
      [{ internal_name: 'musik', label: 'Wie war die Musik?' }]
    );

    expect(entries).toEqual([
      { label: 'Wie war die Musik?', value: 'Techno, House' },
      { label: 'zahl', value: '7' },
      { label: 'Was war gut', value: 'Die Bar' },
      { label: 'Newsletter', value: 'Ja' }
    ]);
  });

  it('answers an empty draft with an empty list', () => {
    expect(abandonedEntries(null)).toEqual([]);
    expect(abandonedEntries({ answers: {}, commentPositive: '', commentImprovement: '', newsletter: null })).toEqual([]);
    expect(formatDraftValue(undefined)).toBe('');
    expect(formatDraftValue(true)).toBe('Ja');
  });
});
