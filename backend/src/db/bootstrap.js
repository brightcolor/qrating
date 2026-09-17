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

// Seeds the demo organization on the first start only; the first-admin setup renames it later.
export async function seedDefaultData() {
  await withTransaction(async (client) => {
    const existing = await client.query('SELECT 1 FROM organizations LIMIT 1');
    if (existing.rows.length) return;

    const organization = (await client.query(
      `INSERT INTO organizations (name, slug, primary_color, privacy_text, ticketshop_url, website_url, instagram_url)
       VALUES ($1, $2, '#2563eb', 'Feedback ist anonym möglich. E-Mail-Adressen werden nur für den gewählten Zweck gespeichert.', 'https://tickets.example.com', 'https://example.com', 'https://instagram.com/example')
       ON CONFLICT (slug) DO NOTHING
       RETURNING *`,
      [env.organizationName, env.organizationSlug]
    )).rows[0];
    // A second backend instance seeded concurrently.
    if (!organization) return;

    const event = (await client.query(
      `INSERT INTO events (
        organization_id, source, name, slug, event_feedback_token, date_from, date_to, event_timezone,
        location, status, feedback_enabled, feedback_window_days, resolver_priority
      )
      VALUES ($1, 'manual', 'Demo Nacht', 'demo-nacht', $2, now() - interval '2 hours', now() + interval '2 hours',
        'Europe/Berlin', 'Hauptsaal', 'active', true, 3, 10)
      RETURNING *`,
      [organization.id, randomToken()]
    )).rows[0];

    const form = (await client.query(
      `INSERT INTO feedback_forms (organization_id, event_id, name, description, active)
       VALUES ($1, $2, 'Schnellfeedback', 'Kurzes Standardformular', true)
       RETURNING *`,
      [organization.id, event.id]
    )).rows[0];

    await client.query(
      `INSERT INTO feedback_questions (feedback_form_id, question_type, internal_name, label, placeholder, sort_order, active, options)
       VALUES
       ($1, 'checkboxes', 'positive_tags', 'Was hat für dich gepasst?', null, 10, true, $2::jsonb),
       ($1, 'checkboxes', 'improvement_tags', 'Wo dürfen wir besser werden?', null, 20, true, $3::jsonb),
       ($1, 'text_long', 'moment', 'Was war dein Moment des Abends?', 'Ein kurzer Gedanke reicht …', 30, true, null)`,
      [
        form.id,
        JSON.stringify(['Tolle Stimmung', 'Gute Musik', 'Schöne Location', 'Nettes Team', 'Guter Sound', 'Gerne wieder']),
        JSON.stringify(['Einlass', 'Wartezeiten', 'Sound', 'Getränke', 'Preise', 'Toiletten', 'Zu voll'])
      ]
    );

    await client.query(
      `INSERT INTO qr_sources (organization_id, event_id, source_slug, label, type)
       VALUES ($1, null, 'bar', 'Bar', 'dynamic_organization')`,
      [organization.id]
    );
  });
}

export function eventToPublic(event, organization, questions = []) {
  return {
    token: event.event_feedback_token,
    name: event.name,
    dateFrom: event.date_from,
    dateTo: event.date_to,
    location: event.location,
    imageUrl: event.image_url || event.cached_image_url || organization?.logo_url || null,
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

// PATCH only touches the picture when the request carries imageUrl or imageAlt.
// An empty imageUrl drops the picture, a filled one marks it as set by hand so the Pretix sync keeps its hands off.
export function normalizeEventImageUpdate(body) {
  const rawUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : body.imageUrl;
  const rawAlt = typeof body.imageAlt === 'string' ? body.imageAlt.trim() : body.imageAlt;
  return {
    mode: body.imageUrl === undefined ? 'keep' : (rawUrl ? 'set' : 'clear'),
    url: rawUrl || null,
    altProvided: body.imageAlt !== undefined,
    alt: rawAlt || null
  };
}
