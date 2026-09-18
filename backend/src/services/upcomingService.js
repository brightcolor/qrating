// The events an organization still has ahead. They stand on the guest page when no
// round is open, and after a submitted rating as a pointer to the next evening.
import { plainText } from '../utils/localized.js';
import { isPublishedInSource, sourcePayload } from '../utils/sourcePayload.js';
import { upcomingEvents } from './eventResolver.js';

const defaultCount = 3;

// Pretix says when a sale runs. A link that leads to a closed shop helps nobody,
// so it only appears while tickets can really be bought.
export function ticketsAvailable(event, now = new Date()) {
  if (!event || event.ticket_link_enabled === false) return false;
  const raw = sourcePayload(event);
  if (raw && raw.live === false) return false;
  const start = raw?.presale_start ? new Date(raw.presale_start) : null;
  const end = raw?.presale_end ? new Date(raw.presale_end) : null;
  if (start && !Number.isNaN(start.getTime()) && now < start) return false;
  if (end && !Number.isNaN(end.getTime()) && now > end) return false;
  return true;
}

// One entry as the guest page needs it: name, date, place and where tickets live.
export function publicUpcoming(event, organization = {}, now = new Date()) {
  const shopUrl = event.pretix_public_url || organization.ticketshop_url || null;
  const sale = Boolean(shopUrl) && ticketsAvailable(event, now);
  return {
    id: event.id,
    name: event.name,
    dateFrom: event.date_from,
    dateTo: event.date_to,
    location: plainText(event.location) || null,
    imageUrl: event.image_url || event.cached_image_url || null,
    ticketsAvailable: sale,
    shopUrl: sale ? shopUrl : null
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
  // A hand-picked event that the organizer has not published in Pretix stays out too.
  const picked = chosen.length
    ? chosen.map((id) => byId.get(id)).filter(Boolean).filter(isPublishedInSource)
    : upcomingEvents(rows.filter((row) => row.id !== event.id), undefined, limit);
  const now = new Date();
  return picked.filter((row) => row.id !== event.id).slice(0, limit).map((row) => publicUpcoming(row, organization, now));
}

// The page of an organization without an open round: everything that is still to come.
export async function upcomingForOrganization(db, organization, { limit = 5 } = {}) {
  const rows = await organizationEvents(db, organization.id);
  const now = new Date();
  return upcomingEvents(rows, undefined, limit).map((row) => publicUpcoming(row, organization, now));
}
