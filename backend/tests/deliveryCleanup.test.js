import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

let organization;
let event;
let channel;

async function feedbackWithDelivery(rating) {
  const feedback = (await query(
    `INSERT INTO feedback_responses (organization_id, event_id, source_type, rating)
     VALUES ($1, $2, 'event_specific', $3) RETURNING id`,
    [organization.id, event.id, rating]
  )).rows[0];
  await query(
    `INSERT INTO notification_deliveries (
       organization_id, event_id, feedback_response_id, notification_channel_id, channel_type, status
     )
     VALUES ($1,$2,$3,$4,'ntfy','sent')`,
    [organization.id, event.id, feedback.id, channel.id]
  );
  return feedback;
}

describe('a delivery belongs to the rating it announced', () => {
  beforeAll(async () => {
    await runMigrations();
    await seedDefaultData();
    organization = (await query('SELECT * FROM organizations LIMIT 1')).rows[0];
    event = (await query('SELECT * FROM events LIMIT 1')).rows[0];
    const user = (await query(
      `INSERT INTO users (organization_id, name, email, password_hash, role, status)
       VALUES ($1, 'Owner', 'owner@example.com', 'x', 'owner', 'active') RETURNING id`,
      [organization.id]
    )).rows[0];
    channel = (await query(
      `INSERT INTO notification_channels (organization_id, user_id, channel_type, label, config)
       VALUES ($1, $2, 'ntfy', 'Probe', '{}'::jsonb) RETURNING id`,
      [organization.id, user.id]
    )).rows[0];
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it('goes away with the rating instead of staying behind without one', async () => {
    const feedback = await feedbackWithDelivery(1);

    await query('DELETE FROM feedback_responses WHERE id = $1', [feedback.id]);

    const left = await query('SELECT count(*)::int AS anzahl FROM notification_deliveries WHERE feedback_response_id IS NULL');
    expect(left.rows[0].anzahl).toBe(0);
  });

  it('goes away with the channel that carried it', async () => {
    const feedback = await feedbackWithDelivery(2);
    const second = (await query(
      `INSERT INTO notification_channels (organization_id, user_id, channel_type, label, config)
       VALUES ($1, (SELECT user_id FROM notification_channels WHERE id = $2), 'email', 'Zweite', '{}'::jsonb) RETURNING id`,
      [organization.id, channel.id]
    )).rows[0];
    await query(
      `INSERT INTO notification_deliveries (
         organization_id, event_id, feedback_response_id, notification_channel_id, channel_type, status
       )
       VALUES ($1,$2,$3,$4,'email','sent')`,
      [organization.id, event.id, feedback.id, second.id]
    );

    // Removing the owner takes both channels in one statement; without the cascade
    // their two deliveries would collide as empty rows in the unique index.
    await expect(query('DELETE FROM notification_channels WHERE id IN ($1, $2)', [channel.id, second.id])).resolves.toBeTruthy();

    const left = await query('SELECT count(*)::int AS anzahl FROM notification_deliveries');
    expect(left.rows[0].anzahl).toBe(0);
    channel = (await query(
      `INSERT INTO notification_channels (organization_id, user_id, channel_type, label, config)
       VALUES ($1, (SELECT id FROM users WHERE organization_id = $1 LIMIT 1), 'ntfy', 'Probe', '{}'::jsonb) RETURNING id`,
      [organization.id]
    )).rows[0];
  });

  it('lets an event go even after two low ratings on the same channel', async () => {
    await feedbackWithDelivery(1);
    await feedbackWithDelivery(2);

    // Without the cascade the two rows collide in the index as soon as they go empty.
    await expect(query('DELETE FROM events WHERE id = $1', [event.id])).resolves.toBeTruthy();

    const left = await query('SELECT count(*)::int AS anzahl FROM notification_deliveries');
    expect(left.rows[0].anzahl).toBe(0);
  });
});
