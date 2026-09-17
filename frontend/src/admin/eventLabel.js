export function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

// Events of a series share their name; the date tells them apart in lists.
export function eventLabel(event) {
  const date = formatDate(event?.date_from || event?.event_date_from);
  return [event?.name || event?.event_name || 'Unbenanntes Event', date].filter(Boolean).join(' · ');
}
