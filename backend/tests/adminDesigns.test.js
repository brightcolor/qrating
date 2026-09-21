import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { sparkBins } from '../src/services/voiceService.js';

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

const send = (sessionKey, body) => request('POST', `/public/events/${event.event_feedback_token}/feedback`, {
  body: { sourceType: 'dynamic', sessionKey, startedAt: new Date(Date.now() - 60_000).toISOString(), ...body }
});

beforeAll(async () => {
  await runMigrations();
  await seedDefaultData();
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const setup = await request('POST', '/admin/setup/first-admin', {
    body: { name: 'Owner', email: 'owner@example.test', password: 'test-password-123', organizationName: 'Beispiel Events' }
  });
  expect(setup.status).toBe(201);
  ownerCookie = setup.cookie;
  event = (await query("SELECT * FROM events WHERE slug = 'demo-nacht'")).rows[0];
}, 60_000);

afterAll(async () => {
  server?.close();
  await db.close();
});

describe('each person picks the look of the admin area', () => {
  it('starts with no choice, so the page shows the default look', async () => {
    const me = await request('GET', '/admin/me', { cookie: ownerCookie });

    expect(me.status).toBe(200);
    expect(me.body.adminTheme).toBe(null);
  });

  it('keeps the chosen design with the account', async () => {
    const saved = await request('PATCH', '/admin/me/preferences', { cookie: ownerCookie, body: { adminTheme: 'mischpult' } });
    const me = await request('GET', '/admin/me', { cookie: ownerCookie });

    expect(saved.status).toBe(200);
    expect(saved.body.adminTheme).toBe('mischpult');
    expect(me.body.adminTheme).toBe('mischpult');
  });

  it('refuses a name that cannot be a design, with a reason a person can read', async () => {
    const refused = await request('PATCH', '/admin/me/preferences', { cookie: ownerCookie, body: { adminTheme: '<script>' } });

    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/Design/);
    expect((await request('GET', '/admin/me', { cookie: ownerCookie })).body.adminTheme).toBe('mischpult');
  });

  it('goes back to the default look when the choice is cleared', async () => {
    await request('PATCH', '/admin/me/preferences', { cookie: ownerCookie, body: { adminTheme: null } });

    expect((await request('GET', '/admin/me', { cookie: ownerCookie })).body.adminTheme).toBe(null);
  });

  it('lets nobody without a session choose', async () => {
    const anonymous = await request('PATCH', '/admin/me/preferences', { body: { adminTheme: 'plakat' } });

    expect(anonymous.status).toBe(401);
  });
});

describe('the evaluation lists what guests said', () => {
  it('shows every text a guest left, the answers to questions included', async () => {
    const sent = await send('stimme-1', {
      rating: 5,
      answers: { moment: 'Als das Licht ausging' },
      commentImprovement: 'Mehr Wasser an der Bar'
    });
    expect(sent.status).toBe(201);
    const bar = (await query("SELECT id FROM qr_sources WHERE source_slug = 'bar'")).rows[0];
    await query(
      `UPDATE feedback_responses SET qr_source_id = $2
       WHERE id = (SELECT feedback_response_id FROM guest_sessions WHERE session_key = 'stimme-1' AND event_id = $1)`,
      [event.id, bar.id]
    );

    const analytics = await request('GET', `/admin/events/${event.id}/analytics`, { cookie: ownerCookie });

    expect(analytics.status).toBe(200);
    const voice = analytics.body.voices.find((item) => item.texts.some((text) => text.value === 'Als das Licht ausging'));
    expect(voice).toMatchObject({ rating: 5, completed: true, source: 'Bar', caseOpen: false });
    expect(voice.texts).toEqual([
      { label: 'Was war dein Moment des Abends?', value: 'Als das Licht ausging' },
      { label: 'Was besser werden soll', value: 'Mehr Wasser an der Bar' }
    ]);
  });

  it('marks a low vote that still waits for a call', async () => {
    const sent = await send('stimme-2', { rating: 1, contactRequested: true, contactPhone: '0151 2345678', commentImprovement: 'Zu voll auf der Treppe' });
    expect(sent.status).toBe(201);

    const analytics = await request('GET', `/admin/events/${event.id}/analytics`, { cookie: ownerCookie });

    const voice = analytics.body.voices.find((item) => item.rating === 1);
    expect(voice).toMatchObject({ caseOpen: true, caseHasPhone: true, caseStatus: 'open' });
    expect(voice.caseId).toBeTruthy();
    expect(analytics.body.cases).toMatchObject({ open: 1, open_with_phone: 1 });
  });

  it('shows in the list of calls what the guest wrote to the questions of the form', async () => {
    const sent = await send('stimme-4', { rating: 2, contactRequested: true, contactPhone: '0151 7654321', answers: { moment: 'Die Schlange am Einlass' } });
    expect(sent.status).toBe(201);

    const cases = await request('GET', '/admin/low-rating-cases', { cookie: ownerCookie });

    const found = cases.body.find((item) => item.answer_texts.some((text) => text.value === 'Die Schlange am Einlass'));
    expect(found.answer_texts).toEqual([{ label: 'Was war dein Moment des Abends?', value: 'Die Schlange am Einlass' }]);
    await query("UPDATE low_rating_cases SET status = 'resolved' WHERE id = $1", [found.id]);
  });

  it('counts a case as done once someone reached the guest', async () => {
    const [low] = (await query("SELECT id FROM low_rating_cases WHERE event_id = $1 AND status = 'open'", [event.id])).rows;
    await request('PATCH', `/admin/low-rating-cases/${low.id}`, { cookie: ownerCookie, body: { status: 'resolved' } });

    const analytics = await request('GET', `/admin/events/${event.id}/analytics`, { cookie: ownerCookie });

    expect(analytics.body.cases.open).toBe(0);
    expect(analytics.body.voices.find((item) => item.rating === 1).caseOpen).toBe(false);
  });
});

describe('the event list carries its numbers when asked', () => {
  it('adds the numbers of every event, and only when asked', async () => {
    const plain = await request('GET', '/admin/events', { cookie: ownerCookie });
    const withStats = await request('GET', '/admin/events?stats=1', { cookie: ownerCookie });

    expect(plain.body[0].stats).toBe(undefined);
    const demo = withStats.body.find((item) => item.id === event.id);
    expect(demo.stats).toMatchObject({ votes: 3, averageRating: 2.7, onlyStars: 0, openCases: 0, questionCount: 3 });
    expect(demo.stats.spark.reduce((sum, count) => sum + count, 0)).toBe(3);
  });
});

describe('saving the look of the guest page alone', () => {
  it('leaves the deletion periods as they were', async () => {
    await request('PATCH', '/admin/branding', { cookie: ownerCookie, body: { retentionFeedbackDays: 365, retentionNewsletterDays: 730 } });

    const saved = await request('PATCH', '/admin/branding', { cookie: ownerCookie, body: { primaryColor: '#c42a66' } });

    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ primary_color: '#c42a66', retention_feedback_days: 365, retention_newsletter_days: 730 });
  });

  it('still clears a period when the form sends it empty', async () => {
    const saved = await request('PATCH', '/admin/branding', { cookie: ownerCookie, body: { retentionFeedbackDays: '' } });

    expect(saved.body.retention_feedback_days).toBe(null);
    expect(saved.body.retention_newsletter_days).toBe(730);
  });
});

describe('the small curve beside an event', () => {
  const at = (hour, count) => ({ bucket: new Date(Date.UTC(2026, 8, 19, hour)).toISOString(), count });

  it('fills the quiet hours with zero', () => {
    expect(sparkBins([at(21, 2), at(23, 5)])).toEqual([2, 0, 5]);
  });

  it('squeezes a long round into the given width without losing a vote', () => {
    const rows = Array.from({ length: 72 }, (_, hour) => at(hour, 1));

    const bins = sparkBins(rows, 24);

    expect(bins).toHaveLength(24);
    expect(bins.reduce((sum, count) => sum + count, 0)).toBe(72);
  });

  it('draws nothing for an event without votes', () => {
    expect(sparkBins([])).toEqual([]);
  });
});
