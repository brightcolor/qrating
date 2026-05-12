import fs from 'fs/promises';
import path from 'path';
import { query, withTransaction } from './pool.js';
import { env } from '../config/env.js';
import { randomToken, slugify } from '../utils/crypto.js';

export async function runMigrations() {
  const migrationsDir = path.join(process.cwd(), '..', 'database', 'migrations');
  const files = await fs.readdir(migrationsDir).catch(() => []);
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  for (const file of files.filter((name) => name.endsWith('.sql')).sort()) {
    const applied = await query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
    if (applied.rows.length) continue;
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
    });
  }
}

export async function seedDefaultData() {
  const orgResult = await query(
    `INSERT INTO organizations (name, slug, primary_color, privacy_text, ticketshop_url, website_url, instagram_url)
     VALUES ($1, $2, '#2563eb', 'Feedback ist anonym möglich. E-Mail-Adressen werden nur für den gewählten Zweck gespeichert.', 'https://tickets.example.com', 'https://example.com', 'https://instagram.com/example')
     ON CONFLICT (slug) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [env.organizationName, env.organizationSlug]
  );
  const organization = orgResult.rows[0];

  const eventResult = await query(
    `INSERT INTO events (
      organization_id, source, name, slug, event_feedback_token, date_from, date_to, event_timezone,
      location, status, feedback_enabled, feedback_window_days, resolver_priority
    )
    VALUES ($1, 'manual', 'Demo Nacht', 'demo-nacht', $2, now() - interval '2 hours', now() + interval '2 hours',
      'Europe/Berlin', 'Hauptsaal', 'active', true, 3, 10)
    ON CONFLICT (organization_id, slug) DO UPDATE SET updated_at = now()
    RETURNING *`,
    [organization.id, randomToken()]
  );
  const event = eventResult.rows[0];

  const formResult = await query(
    `INSERT INTO feedback_forms (organization_id, event_id, name, description, active)
     VALUES ($1, $2, 'Schnellfeedback', 'Kurzes Standardformular', true)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [organization.id, event.id]
  );
  const existingForm = formResult.rows[0] || (await query('SELECT * FROM feedback_forms WHERE event_id = $1 LIMIT 1', [event.id])).rows[0];
  if (existingForm) {
    const count = await query('SELECT count(*)::int AS count FROM feedback_questions WHERE feedback_form_id = $1', [existingForm.id]);
    if (count.rows[0].count === 0) {
      await query(
        `INSERT INTO feedback_questions (feedback_form_id, question_type, internal_name, label, placeholder, sort_order, active, options)
         VALUES
         ($1, 'text_long', 'moment', 'Was war dein Moment des Abends?', 'Ein kurzer Gedanke reicht ...', 10, true, null),
         ($1, 'checkboxes', 'positive_tags', 'Was hat für dich gepasst?', null, 20, true, $2::jsonb),
         ($1, 'checkboxes', 'improvement_tags', 'Wo dürfen wir besser werden?', null, 30, true, $3::jsonb)`,
        [
          existingForm.id,
          JSON.stringify(['Tolle Stimmung', 'Gute Musik', 'Schöne Location', 'Nettes Team', 'Guter Sound', 'Gerne wieder']),
          JSON.stringify(['Einlass', 'Wartezeiten', 'Sound', 'Getränke', 'Preise', 'Toiletten', 'Zu voll'])
        ]
      );
    }
  }

  await query(
    `INSERT INTO qr_sources (organization_id, event_id, source_slug, label, type)
     VALUES ($1, null, 'bar', 'Bar', 'dynamic_organization')
     ON CONFLICT DO NOTHING`,
    [organization.id]
  );

  await query(
    `INSERT INTO user_event_assignments (organization_id, user_id, event_id, notify_low_rating)
     SELECT $1, users.id, $2, true
     FROM users
     WHERE users.organization_id = $1 AND users.role IN ('owner', 'admin')
     ON CONFLICT (user_id, event_id) DO NOTHING`,
    [organization.id, event.id]
  ).catch(() => {});
}

export function eventToPublic(event, organization, questions = []) {
  return {
    token: event.event_feedback_token,
    name: event.name,
    dateFrom: event.date_from,
    dateTo: event.date_to,
    location: event.location,
    imageUrl: event.image_url || organization?.logo_url || null,
    imageAlt: event.image_alt || `Bild zu ${event.name}`,
    organization: {
      name: organization.name || event.organization_name,
      slug: organization.slug || event.organization_slug,
      primaryColor: organization.primary_color,
      logoUrl: organization.logo_url,
      privacyText: organization.privacy_text,
      footerText: organization.footer_text,
      branding: organization.branding || {}
    },
    questions
  };
}

export function normalizeEventInput(body, organization) {
  const name = body.name?.trim();
  return {
    name,
    slug: slugify(body.slug || name),
    date_from: body.dateFrom || body.date_from,
    date_to: body.dateTo || body.date_to || null,
    location: body.location || null,
    event_timezone: body.eventTimezone || body.event_timezone || 'Europe/Berlin',
    feedback_window_days: Number(body.feedbackWindowDays ?? organization.default_feedback_window_days ?? 3),
    feedback_window_hours: body.feedbackWindowHours ? Number(body.feedbackWindowHours) : null,
    feedback_starts_mode: body.feedbackStartsMode || organization.default_feedback_start_mode || 'event_start',
    image_url: body.imageUrl || null,
    image_alt: body.imageAlt || null
  };
}
