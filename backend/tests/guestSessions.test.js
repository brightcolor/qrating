import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { buildFunnel } from '../src/services/guestSessionService.js';

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

function progress(sessionKey, { step, kind, label, index, total = 5 }) {
  return request('POST', `/public/events/${event.event_feedback_token}/progress`, {
    body: { sessionKey, step, stepKind: kind, stepLabel: label, stepIndex: index, stepsTotal: total, sourceType: 'event_specific' }
  });
}

describe('how far guests get', () => {
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

  it('counts a visit and keeps the furthest step', async () => {
    expect((await progress('besuch-1', { step: 'rating', kind: 'rating', label: 'Bewertung', index: 0 })).status).toBe(200);
    expect((await progress('besuch-1', { step: 'question:musik', kind: 'question', label: 'Wie war die Musik?', index: 2 })).status).toBe(200);
    // Going back must not shorten the path.
    await progress('besuch-1', { step: 'rating', kind: 'rating', label: 'Bewertung', index: 0 });

    const session = (await query('SELECT * FROM guest_sessions WHERE session_key = $1', ['besuch-1'])).rows[0];

    expect(session).toMatchObject({
      event_id: event.id,
      last_step: 'question:musik',
      last_step_kind: 'question',
      last_step_label: 'Wie war die Musik?',
      last_step_index: 2,
      steps_total: 5,
      completed_at: null
    });
    expect((await query('SELECT count(*)::int AS total FROM guest_sessions')).rows[0].total).toBe(1);
  });

  it('keeps the address of the guest out of the session', async () => {
    const session = (await query('SELECT * FROM guest_sessions WHERE session_key = $1', ['besuch-1'])).rows[0];

    expect(session.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(session.user_agent_hash === null || /^[0-9a-f]{64}$/.test(session.user_agent_hash)).toBe(true);
    expect(JSON.stringify(session)).not.toContain('127.0.0.1');
  });

  it('closes the session when the feedback arrives', async () => {
    await progress('besuch-2', { step: 'rating', kind: 'rating', label: 'Bewertung', index: 0 });
    const feedback = await request('POST', `/public/events/${event.event_feedback_token}/feedback`, {
      body: { rating: 5, sourceType: 'event_specific', sessionKey: 'besuch-2' }
    });
    expect(feedback.status).toBe(201);

    const session = (await query('SELECT * FROM guest_sessions WHERE session_key = $1', ['besuch-2'])).rows[0];
    expect(session.completed_at).toBeTruthy();
    expect(session.feedback_response_id).toBeTruthy();
    expect(session.last_step).toBe('submitted');
  });

  it('shows in the analytics how far the guests came', async () => {
    await progress('besuch-3', { step: 'newsletter', kind: 'newsletter', label: 'Newsletter', index: 3 });

    const analytics = await request('GET', `/admin/events/${event.id}/analytics`, { cookie: ownerCookie });

    expect(analytics.status).toBe(200);
    expect(analytics.body.funnel).toMatchObject({ sessions: 3, completed: 1, dropped: 2, completionRate: 33 });
    const steps = analytics.body.funnel.steps;
    expect(steps[0]).toMatchObject({ position: 2, step: 'question:musik', reached: 3, dropped: 1 });
    expect(steps.at(-1)).toMatchObject({ step: 'submitted', completed: 1 });
  });

  it('counts nothing for an event whose round is over', async () => {
    const closed = (await query(
      `UPDATE events SET date_from = now() - interval '40 days', date_to = now() - interval '40 days', feedback_window_days = 1
       WHERE id = $1 RETURNING *`,
      [event.id]
    )).rows[0];

    const answer = await request('POST', `/public/events/${closed.event_feedback_token}/progress`, {
      body: { sessionKey: 'besuch-4', step: 'rating', stepIndex: 0, stepsTotal: 5 }
    });

    expect(answer.status).toBe(200);
    expect((await query('SELECT count(*)::int AS total FROM guest_sessions WHERE session_key = $1', ['besuch-4'])).rows[0].total).toBe(0);
  });

  it('turns the grouped rows into a funnel', () => {
    const funnel = buildFunnel([
      { position: 0, step: 'rating', kind: 'rating', label: 'Bewertung', stopped: 4, completed: 0 },
      { position: 2, step: 'newsletter', kind: 'newsletter', label: 'Newsletter', stopped: 2, completed: 0 },
      { position: 4, step: 'submitted', kind: 'submitted', label: null, stopped: 4, completed: 4 }
    ]);

    expect(funnel).toMatchObject({ sessions: 10, completed: 4, dropped: 6, completionRate: 40 });
    expect(funnel.steps.map((step) => [step.step, step.reached, step.dropped, step.share])).toEqual([
      ['rating', 10, 4, 100],
      ['newsletter', 6, 2, 60],
      ['submitted', 4, 0, 40]
    ]);
  });
});
