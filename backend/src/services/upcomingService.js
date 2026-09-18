// The events an organization still has ahead. They stand on the guest page when no
// round is open, and after a submitted rating as a pointer to the next evening.
import { plainText } from '../utils/localized.js';
import { upcomingEvents } from './eventResolver.js';

const defaultCount = 3;

// One entry as the guest page needs it: name, date, place and where tickets live.
export function publicUpcoming(event, organization = {}) {
  return {
    id: event.id,
    name: event.name,
    dateFrom: event.date_from,
    dateTo: event.date_to,
    location: plainText(event.location) || null,
    imageUrl: event.image_url || event.cached_image_url || null,
    shopUrl: event.pretix_public_url || organization.ticketshop_url || null
  };
}

async function organizationEvents(db, organizationId) {
  const result = await db.query(
    `SELECT * FROM events
     WHERE organization_id = $1 AND feedback_enabled = true AND status = 'active'
     ORDER BY date_from`,
    [organizationId]
  );
  return result.rows;
}

// The chosen events of an event win; without a choice the next ones by date follow.
export async function upcomingFor(db, event, organization = {}, { limit = defaultCount } = {}) {
  if (!event || event.upcoming_enabled === false) return [];
  const rows = await organizationEvents(db, event.organization_id);
  const chosen = Array.isArray(event.upcoming_event_ids) ? event.upcoming_event_ids : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const picked = chosen.length
    ? chosen.map((id) => byId.get(id)).filter(Boolean)
    : upcomingEvents(rows.filter((row) => row.id !== event.id), undefined, limit);
  return picked.filter((row) => row.id !== event.id).slice(0, limit).map((row) => publicUpcoming(row, organization));
}

// The page of an organization without an open round: everything that is still to come.
export async function upcomingForOrganization(db, organization, { limit = 5 } = {}) {
  const rows = await organizationEvents(db, organization.id);
  return upcomingEvents(rows, undefined, limit).map((row) => publicUpcoming(row, organization));
}
