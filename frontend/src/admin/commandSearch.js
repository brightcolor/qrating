import { eventTabs, guestSections, platformSections, settingsSections } from './navigation.js';

// Everything the search bar of the command look can reach: every page, every section of the
// settings, every event, and the tabs of every event. Words beside the names find a page by
// what it contains, so "Pretix" leads to the connections and "Impressum" to the organisation.

export const commandGroups = ['Events', 'Direkt zu', 'Seiten', 'Gästeseite', 'Einstellungen', 'Plattform'];

const pages = [
  { key: 'overview', label: 'Übersicht', icon: 'overview', route: { page: 'overview' }, keywords: 'Start Dashboard heute' },
  { key: 'events', label: 'Events', icon: 'events', route: { page: 'events' }, keywords: 'Liste anlegen neu' },
  { key: 'callbacks', label: 'Rückrufe', icon: 'callbacks', route: { page: 'callbacks' }, keywords: 'Low-Rating schlechte Bewertung anrufen Telefon' },
  { key: 'wallboard', label: 'Wallboard', icon: 'wallboard', route: { page: 'wallboard' }, keywords: 'Bildschirm Live Anzeige' }
];

export function commandEntries({ events = [], platformAdmin = false, eventDate = () => '' } = {}) {
  const entries = [];
  for (const event of events) {
    entries.push({ id: `event:${event.id}`, group: 'Events', label: event.name, note: eventDate(event), icon: 'events', route: { page: 'event', eventId: event.id, tab: 'auswertung' }, keywords: event.location || '' });
    for (const tab of eventTabs) {
      entries.push({
        id: `event:${event.id}:${tab.id}`,
        group: 'Direkt zu',
        label: `${tab.label} von ${event.name}`,
        note: 'Event',
        icon: tab.icon,
        route: { page: 'event', eventId: event.id, tab: tab.id },
        keywords: '',
        searchOnly: true
      });
    }
  }
  for (const page of pages) entries.push({ id: `page:${page.key}`, group: 'Seiten', ...page });
  for (const item of guestSections) entries.push({ id: `guest:${item.id}`, group: 'Gästeseite', label: item.label, note: item.hint, icon: item.icon, route: { page: 'guest', section: item.id }, keywords: item.keywords });
  for (const item of settingsSections) entries.push({ id: `settings:${item.id}`, group: 'Einstellungen', label: item.label, note: item.hint, icon: item.icon, route: { page: 'settings', section: item.id }, keywords: item.keywords });
  if (platformAdmin) {
    for (const item of platformSections) entries.push({ id: `platform:${item.id}`, group: 'Plattform', label: item.label, note: item.hint, icon: item.icon, route: { page: 'platform', section: item.id }, keywords: item.keywords });
  }
  return entries;
}

// Lower case without accents, so "ruckruf" finds "Rückrufe".
export function normalize(text = '') {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function score(entry, query) {
  const label = normalize(entry.label);
  if (label.startsWith(query)) return 4;
  if (label.split(/[\s–-]+/).some((word) => word.startsWith(query))) return 3;
  if (label.includes(query)) return 2;
  if (normalize(`${entry.keywords || ''} ${entry.note || ''}`).includes(query)) return 1;
  return 0;
}

// The hits for a query, best first within the order of the groups. Without a query the bar
// offers the events and the pages, the tabs of each event only once someone types.
export function searchCommands(entries, query, limit = 14) {
  const needle = normalize(query);
  const hits = needle
    ? entries.map((entry) => ({ entry, score: score(entry, needle) })).filter((hit) => hit.score > 0)
    : entries.filter((entry) => !entry.searchOnly).map((entry) => ({ entry, score: 1 }));
  hits.sort((a, b) => commandGroups.indexOf(a.entry.group) - commandGroups.indexOf(b.entry.group) || b.score - a.score);
  return hits.slice(0, limit).map((hit) => hit.entry);
}
