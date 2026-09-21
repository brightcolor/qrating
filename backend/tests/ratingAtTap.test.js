import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { JobWorker } from '../src/services/jobService.js';
import { lowRatingGraceMinutes, turnsLow } from '../src/services/ratingService.js';

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

const tap = (sessionKey, rating) => request('POST', `/public/events/${event.event_feedback_token}/rating`, {
  body: { sessionKey, rating, sourceType: 'dynamic' }
});

const send = (sessionKey, body) => request('POST', `/public/events/${event.event_feedback_token}/feedback`, {
  body: { sourceType: 'dynamic', sessionKey, startedAt: new Date(Date.now() - 60_000).toISOString(), ...body }
});

async function votesOf(sessionKey) {
  return (await query(
    `SELECT fr.* FROM feedback_responses fr
     JOIN guest_sessions gs ON gs.feedback_response_id = fr.id
     WHERE gs.session_key = $1`,
    [sessionKey]
  )).rows;
}

async function allVotes() {
  return (await query('SELECT count(*)::int AS n FROM feedback_responses WHERE event_id = $1', [event.id])).rows[0].n;
}

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

describe('a tap on a star is a vote', () => {
  it('counts the vote the moment the star is tapped', async () => {
    const before = await allVotes();

    const answer = await tap('tipp-1', 4);

    expect(answer.status).toBe(201);
    expect(await allVotes()).toBe(before + 1);
    const [vote] = await votesOf('tipp-1');
    expect(vote).toMatchObject({ rating: 4, completed_at: null });
  });

  it('changes the same vote on a second tap instead of adding one', async () => {
    const before = await allVotes();

    const answer = await tap('tipp-1', 5);

    expect(answer.status).toBe(200);
    expect(await allVotes()).toBe(before);
    expect((await votesOf('tipp-1'))[0].rating).toBe(5);
  });

  it('writes one vote even when two taps arrive at the same moment', async () => {
    const before = await allVotes();

    // A double tap sends two requests before either has been answered. PGlite runs one
    // query at a time, so this checks the outcome, not the lock behind it; the lock was
    // measured on a real Postgres 16 (see ratingService.js).
    await Promise.all([tap('doppel', 3), tap('doppel', 4), tap('doppel', 4)]);

    expect(await allVotes()).toBe(before + 1);
    expect(await votesOf('doppel')).toHaveLength(1);
  });

  it('completes that vote when the form is sent, rather than writing a second one', async () => {
    const before = await allVotes();

    const sent = await send('tipp-1', { rating: 5, commentPositive: 'Die Band war stark' });

    expect(sent.status).toBe(201);
    expect(await allVotes()).toBe(before);
    const [vote] = await votesOf('tipp-1');
    expect(vote.completed_at).not.toBe(null);
    expect(vote.comment_positive).toBe('Die Band war stark');
  });

  it('keeps a form that was sent as it was sent', async () => {
    await tap('tipp-1', 1);

    expect((await votesOf('tipp-1'))[0].rating).toBe(5);
  });

  it('still takes a form from a page that never reported a tap', async () => {
    const before = await allVotes();

    // An older page, or a tap whose request was lost on the way.
    const sent = await send('ohne-tipp', { rating: 3 });

    expect(sent.status).toBe(201);
    expect(await allVotes()).toBe(before + 1);
    expect((await votesOf('ohne-tipp'))[0].completed_at).not.toBe(null);
  });

  it('shows in the evaluation how many votes went no further than the stars', async () => {
    await tap('nur-sterne', 2);

    const analytics = await request('GET', `/admin/events/${event.id}/analytics`, { cookie: ownerCookie });

    expect(analytics.status).toBe(200);
    // tipp-1 and ohne-tipp were sent; doppel and nur-sterne stopped at the stars.
    expect(analytics.body.summary.only_stars).toBe(2);
  });

  it('counts a tap and its form once in the numbers of the QR source', async () => {
    const counted = (await query(
      `SELECT sum(feedback_count)::int AS votes FROM qr_source_daily_stats WHERE event_id = $1`,
      [event.id]
    )).rows[0].votes;

    // tipp-1, doppel, ohne-tipp, nur-sterne: four votes, however they arrived.
    expect(counted).toBe(4);
  });

  it('refuses a tap while no round is open', async () => {
    await query(
      `UPDATE events SET date_from = now() - interval '40 days', date_to = now() - interval '40 days', feedback_window_days = 1 WHERE id = $1`,
      [event.id]
    );

    const answer = await tap('zu-spaet', 3);

    expect(answer.status).toBe(410);
    expect(answer.body.error).toMatch(/geschlossen/);
    await query(
      `UPDATE events SET date_from = now() - interval '1 hour', date_to = now() + interval '3 hours', feedback_window_days = 3 WHERE id = $1`,
      [event.id]
    );
  });
});

describe('a low tap reaches the organizer, but waits for the rest of the form', () => {
  let channelId;

  beforeAll(async () => {
    const organization = (await query('SELECT id FROM organizations LIMIT 1')).rows[0];
    // A channel of the organization reaches every one of its events.
    channelId = (await query(
      `INSERT INTO notification_channels (organization_id, channel_type, label, config, enabled, min_rating)
       VALUES ($1, 'email', 'Probe', '{"to":"team@example.test"}'::jsonb, true, 2) RETURNING id`,
      [organization.id]
    )).rows[0].id;
  });

  const alertsFor = async (feedbackId) => (await query(
    `SELECT job_type, run_after FROM background_jobs
     WHERE job_type = 'notification.low_rating' AND payload->>'feedbackId' = $1`,
    [feedbackId]
  )).rows;

  it('plans the alert for later, so a callback number can still come along', async () => {
    const started = Date.now();
    await tap('tief-1', 1);
    const [vote] = await votesOf('tief-1');

    const alerts = await alertsFor(vote.id);

    expect(alerts).toHaveLength(1);
    const wait = new Date(alerts[0].run_after).getTime() - started;
    expect(wait).toBeGreaterThan((lowRatingGraceMinutes - 1) * 60_000);
  });

  it('plans no second alert for a second low tap', async () => {
    await tap('tief-1', 2);
    const [vote] = await votesOf('tief-1');

    expect(await alertsFor(vote.id)).toHaveLength(1);
  });

  it('sends nothing when the guest has meanwhile raised the stars', async () => {
    await tap('tief-2', 1);
    await tap('tief-2', 4);
    const [vote] = await votesOf('tief-2');

    // The planned alert runs now, as if its half hour were over.
    await new JobWorker({ query }).handleLowRating({ eventId: event.id, feedbackId: vote.id });

    const deliveries = await query('SELECT count(*)::int AS n FROM notification_deliveries WHERE feedback_response_id = $1', [vote.id]);
    expect(deliveries.rows[0].n).toBe(0);
  });

  it('sends one alert, not two, when the form follows with its own', async () => {
    await tap('tief-3', 1);
    const [vote] = await votesOf('tief-3');
    await send('tief-3', { rating: 1, contactPhone: '0151 2345678', contactRequested: true });

    const service = new JobWorker({ query });
    await service.handleLowRating({ eventId: event.id, feedbackId: vote.id });
    await service.handleLowRating({ eventId: event.id, feedbackId: vote.id });

    const deliveries = await query(
      'SELECT count(*)::int AS n FROM notification_deliveries WHERE feedback_response_id = $1 AND notification_channel_id = $2',
      [vote.id, channelId]
    );
    expect(deliveries.rows[0].n).toBe(1);
  });

  it('only steps into the low range count as a reason to alert', () => {
    expect(turnsLow(null, 1)).toBe(true);
    expect(turnsLow(4, 2)).toBe(true);
    expect(turnsLow(1, 2)).toBe(false);
    expect(turnsLow(2, 4)).toBe(false);
    expect(turnsLow(null, 3)).toBe(false);
  });
});
