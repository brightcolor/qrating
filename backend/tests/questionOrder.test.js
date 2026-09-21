import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let server;
let baseUrl;
let ownerCookie;
let formId;
let ids;

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

async function order() {
  const rows = await query('SELECT label, sort_order FROM feedback_questions WHERE feedback_form_id = $1 ORDER BY sort_order', [formId]);
  return rows.rows.map((row) => row.label);
}

describe('the order of the questions is the order of the guest flow', () => {
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
    const form = (await query('SELECT id FROM feedback_forms LIMIT 1')).rows[0];
    formId = form.id;
    await query('DELETE FROM feedback_questions WHERE feedback_form_id = $1', [formId]);
    const created = [];
    for (const [position, label] of ['Erste', 'Zweite', 'Dritte'].entries()) {
      created.push((await query(
        `INSERT INTO feedback_questions (feedback_form_id, question_type, internal_name, label, sort_order)
         VALUES ($1, 'text_long', $2, $3, $4) RETURNING id`,
        [formId, `frage_${position}`, label, (position + 1) * 10]
      )).rows[0].id);
    }
    ids = created;
  }, 60_000);

  afterAll(async () => {
    server?.close();
    await db.close();
  });

  it('rewrites the numbers of the whole list in one request', async () => {
    const sorted = await request('PUT', `/admin/forms/${formId}/question-order`, {
      cookie: ownerCookie,
      body: { order: [ids[2], ids[0], ids[1]] }
    });

    expect(sorted.status).toBe(200);
    expect(await order()).toEqual(['Dritte', 'Erste', 'Zweite']);
    expect(sorted.body.map((row) => row.label)).toEqual(['Dritte', 'Erste', 'Zweite']);
  });

  it('keeps room between the questions, so one can still be squeezed in', async () => {
    const rows = await query('SELECT sort_order FROM feedback_questions WHERE feedback_form_id = $1 ORDER BY sort_order', [formId]);

    expect(rows.rows.map((row) => row.sort_order)).toEqual([10, 20, 30]);
  });

  it('refuses a list that no longer matches the questions of the form', async () => {
    const vorher = await order();

    const short = await request('PUT', `/admin/forms/${formId}/question-order`, {
      cookie: ownerCookie,
      body: { order: [ids[0], ids[1]] }
    });

    // A list from a stale page would otherwise quietly drop a question out of the flow.
    expect(short.status).toBe(409);
    expect(short.body.message || short.body.error).toMatch(/Reihenfolge/);
    expect(await order()).toEqual(vorher);
  });

  it('refuses a question that belongs somewhere else', async () => {
    const other = (await query(
      `INSERT INTO organizations (name, slug, primary_color) VALUES ('Fremd', 'fremd', '#000000') RETURNING id`
    )).rows[0];
    const otherForm = (await query(
      `INSERT INTO feedback_forms (organization_id, name, active) VALUES ($1, 'Fremdes Formular', true) RETURNING id`,
      [other.id]
    )).rows[0];
    const otherQuestion = (await query(
      `INSERT INTO feedback_questions (feedback_form_id, question_type, internal_name, label, sort_order)
       VALUES ($1, 'text_long', 'fremd', 'Fremde Frage', 10) RETURNING id`,
      [otherForm.id]
    )).rows[0];
    const vorher = await order();

    const mixed = await request('PUT', `/admin/forms/${formId}/question-order`, {
      cookie: ownerCookie,
      body: { order: [ids[0], ids[1], otherQuestion.id] }
    });

    expect(mixed.status).toBe(409);
    expect(await order()).toEqual(vorher);
    const fremd = await query('SELECT sort_order FROM feedback_questions WHERE id = $1', [otherQuestion.id]);
    expect(fremd.rows[0].sort_order).toBe(10);
  });

  it('answers an empty list with a sentence people can act on', async () => {
    const leer = await request('PUT', `/admin/forms/${formId}/question-order`, { cookie: ownerCookie, body: { order: [] } });

    expect(leer.status).toBe(400);
    expect(leer.body.message || leer.body.error).toMatch(/Lade das Formular neu/);
  });

  it('refuses the form of another organization altogether', async () => {
    const other = (await query("SELECT id FROM feedback_forms WHERE name = 'Fremdes Formular'")).rows[0];

    const stranger = await request('PUT', `/admin/forms/${other.id}/question-order`, {
      cookie: ownerCookie,
      body: { order: [ids[0]] }
    });

    expect(stranger.status).toBe(409);
  });
});
