import { DateTime } from 'luxon';
import { isPublishedInSource } from '../utils/sourcePayload.js';

// Only an active event collects feedback. A draft is not out yet, a finished or
// archived one is done.
export const ratingStatus = 'active';

export function asDateTime(value, zone = 'UTC') {
  if (!value) return null;
  const parsed = DateTime.fromJSDate(value instanceof Date ? value : new Date(value), { zone: 'utc' });
  return parsed.setZone(zone || 'UTC');
}

export function calculateFeedbackWindow(event) {
  const zone = event.event_timezone || 'UTC';
  const eventStart = asDateTime(event.date_from, zone);
  const eventEnd = asDateTime(event.date_to || event.date_from, zone);
  let feedbackStart = eventStart;

  if (event.feedback_starts_mode === 'event_end') feedbackStart = eventEnd;
  if (event.feedback_starts_mode === 'custom' && event.feedback_starts_at) {
    feedbackStart = asDateTime(event.feedback_starts_at, zone);
  }

  const days = Number(event.feedback_window_days ?? 0);
  const hours = Number(event.feedback_window_hours ?? 0);
  const feedbackEnd = event.feedback_ends_at
    ? asDateTime(event.feedback_ends_at, zone)
    : eventEnd.plus({ days, hours });

  return {
    eventStart,
    eventEnd,
    feedbackStart,
    feedbackEnd
  };
}

export function isEventFeedbackOpen(event, now = DateTime.utc()) {
  if (!event.feedback_enabled || event.status !== ratingStatus || event.not_found_in_source) return false;
  const zone = event.event_timezone || 'UTC';
  const current = DateTime.isDateTime(now) ? now.setZone(zone) : asDateTime(now, zone);
  const { feedbackStart, feedbackEnd } = calculateFeedbackWindow(event);
  return current >= feedbackStart && current <= feedbackEnd;
}

// Events whose feedback round has not started yet, the closest one first.
export function upcomingEvents(events, now = DateTime.utc(), limit = 5) {
  return events
    .filter((event) => event.feedback_enabled && event.status === 'active' && !event.not_found_in_source)
    .filter(isPublishedInSource)
    .map((event) => ({ event, start: calculateFeedbackWindow(event).feedbackStart }))
    .filter((item) => {
      const zone = item.event.event_timezone || 'UTC';
      const current = DateTime.isDateTime(now) ? now.setZone(zone) : asDateTime(now, zone);
      return item.start > current;
    })
    .sort((a, b) => a.start.toMillis() - b.start.toMillis())
    .slice(0, limit)
    .map((item) => item.event);
}

export function rankCandidateEvents(events, now = DateTime.utc()) {
  const enriched = events
    .filter((event) => isEventFeedbackOpen(event, now))
    .map((event) => {
      const zone = event.event_timezone || 'UTC';
      const current = DateTime.isDateTime(now) ? now.setZone(zone) : asDateTime(now, zone);
      const { eventStart, eventEnd } = calculateFeedbackWindow(event);
      const running = current >= eventStart && current <= eventEnd;
      const distance = Math.abs(current.diff(eventEnd, 'minutes').minutes);
      return { event, running, distance };
    });

  return enriched
    .sort((a, b) => {
      if (a.running !== b.running) return a.running ? -1 : 1;
      if ((b.event.resolver_priority || 0) !== (a.event.resolver_priority || 0)) {
        return (b.event.resolver_priority || 0) - (a.event.resolver_priority || 0);
      }
      const aStart = new Date(a.event.date_from).getTime();
      const bStart = new Date(b.event.date_from).getTime();
      if (bStart !== aStart) return bStart - aStart;
      return a.distance - b.distance;
    })
    .map((item) => item.event);
}

export class EventResolver {
  constructor(db) {
    this.db = db;
  }

  async resolveCurrentEvent(organizationSlug, sourceSlug, now = DateTime.utc()) {
    const orgResult = await this.db.query('SELECT * FROM organizations WHERE slug = $1', [organizationSlug]);
    const organization = orgResult.rows[0];
    if (!organization) return { status: 'organization_not_found', organization: null, event: null };

    let qrSource = null;
    if (sourceSlug) {
      const sourceResult = await this.db.query(
        'SELECT * FROM qr_sources WHERE organization_id = $1 AND source_slug = $2 AND active = true',
        [organization.id, sourceSlug]
      );
      qrSource = sourceResult.rows[0] || null;
    }

    const eventResult = await this.db.query(
      `SELECT * FROM events
       WHERE organization_id = $1
         AND feedback_enabled = true
         AND status = 'active'
       ORDER BY date_from DESC`,
      [organization.id]
    );
    const ranked = rankCandidateEvents(eventResult.rows, now);
    const upcoming = upcomingEvents(eventResult.rows, now);
    return {
      status: ranked[0] ? 'ok' : (upcoming.length ? 'not_yet' : 'no_event'),
      organization,
      event: ranked[0] || null,
      candidates: ranked,
      upcoming,
      qrSource
    };
  }

  async resolveEventByToken(eventToken, now = DateTime.utc()) {
    const result = await this.db.query(
      `SELECT e.*, o.slug AS organization_slug, o.name AS organization_name, o.primary_color, o.logo_url,
              o.privacy_text, o.footer_text, o.branding, o.anti_spam_settings, o.default_language,
              o.product_credit_enabled, o.ticketshop_url
       FROM events e
       JOIN organizations o ON o.id = e.organization_id
       WHERE e.event_feedback_token = $1`,
      [eventToken]
    );
    const event = result.rows[0];
    if (!event) return { status: 'event_not_found', event: null };
    const zone = event.event_timezone || 'UTC';
    const current = DateTime.isDateTime(now) ? now.setZone(zone) : asDateTime(now, zone);
    // Before its round an event shows itself; afterwards the page stays closed.
    const notYet = event.feedback_enabled
      && event.status === 'active'
      && !event.not_found_in_source
      && calculateFeedbackWindow(event).feedbackStart > current;
    return {
      status: isEventFeedbackOpen(event, now) ? 'ok' : (notYet ? 'not_yet' : 'closed'),
      event
    };
  }
}
