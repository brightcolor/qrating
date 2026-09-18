// What the sync wrote down about an event. Pretix hands it over as an object,
// the database may hand it back as text, so both are read the same way here.

export function sourcePayload(event) {
  const raw = event?.raw_source_payload;
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Pretix marks an event as public with `live`. What an organizer has not published
// there has no business on a guest page either. An event of our own carries no
// such flag and counts as published.
export function isPublishedInSource(event) {
  const raw = sourcePayload(event);
  return !(raw && raw.live === false);
}
