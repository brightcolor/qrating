// Where every page of the admin area lives, and the menus that lead there. The shells of all
// ten looks read the same groups, so a page is added in exactly one place.
//
// A route is a small object: { page: 'event', eventId, tab }, { page: 'settings', section,
// part }, and so on. pathForRoute() turns it into an address, routeFromLocation() reads one
// back. Addresses the admin area had before the reorganisation still lead to their page.

export const adminBase = '/admin';

// Addresses under /admin that carry a flow of their own and never name a page.
// An invite and a password reset arrive with a token and have to stay untouched.
export const reservedPaths = ['accept-invite', 'reset-password'];

export const eventTabs = [
  { id: 'auswertung', label: 'Auswertung', icon: 'chart' },
  { id: 'fragen', label: 'Fragen', icon: 'questions' },
  { id: 'qr', label: 'QR & Aushang', icon: 'qr' },
  { id: 'einstellungen', label: 'Einstellungen', icon: 'settings' }
];

export const guestSections = [
  { id: 'texte', label: 'Texte', icon: 'texts', hint: 'was Gäste lesen', keywords: 'Überschrift Dankeschön Sprache Englisch' },
  { id: 'aussehen', label: 'Aussehen', icon: 'palette', hint: 'Farbe, Logo, Zeichen', keywords: 'Farbe Logo Branding QR-Zeichen Fußzeile' }
];

export const settingsSections = [
  { id: 'organisation', label: 'Organisation', icon: 'organisation', hint: 'Name, Anschrift, Datenschutz', keywords: 'Impressum Datenschutz Anschrift Links Ticketshop Instagram Aufbewahrung Löschfristen Spam' },
  { id: 'team', label: 'Team', icon: 'team', hint: 'Personen, Rollen', keywords: 'Benutzer einladen Rolle Zuständigkeit Zuweisung' },
  { id: 'meldungen', label: 'Meldungen', icon: 'bell', hint: 'wer was erfährt', keywords: 'Benachrichtigung Kanal ntfy E-Mail Low-Rating Alarm' },
  { id: 'verbindungen', label: 'Verbindungen', icon: 'plug', hint: 'Pretix, Newsletter, E-Mail', keywords: 'Pretix MailWizz Newsletter SMTP E-Mail Webhooks Abgleich' },
  { id: 'sicherheit', label: 'Sicherheit', icon: 'shield', hint: '2FA, Protokoll, Betrieb', keywords: '2FA Passwort Audit Protokoll Jobs Betrieb Kontaktdaten' },
  { id: 'tarif', label: 'Tarif', icon: 'card', hint: 'dein Plan', keywords: 'Plan Preis Abrechnung Billing' },
  { id: 'darstellung', label: 'Darstellung', icon: 'design', hint: 'Design wählen', keywords: 'Design Theme Aussehen Adminbereich hell dunkel' }
];

export const platformSections = [
  { id: 'mandanten', label: 'Mandanten', icon: 'tenants', hint: 'alle Organisationen', keywords: 'Organisation betreten' },
  { id: 'website', label: 'Website', icon: 'globe', hint: 'qrating.de', keywords: 'Landingpage FAQ Impressum' },
  { id: 'tarife', label: 'Tarife', icon: 'layers', hint: 'Preise und Limits', keywords: 'Plan Override freischalten' }
];

// Parts of a settings page that an address can open directly.
export const settingsParts = {
  verbindungen: ['pretix', 'newsletter', 'email', 'webhooks'],
  sicherheit: ['sicherheit', 'betrieb']
};

const legacyPages = {
  dashboard: { page: 'overview' },
  uebersicht: { page: 'overview' },
  'low-rating': { page: 'callbacks' },
  texte: { page: 'guest', section: 'texte' },
  branding: { page: 'guest', section: 'aussehen' },
  website: { page: 'platform', section: 'website' },
  mandanten: { page: 'platform', section: 'mandanten' },
  plan: { page: 'settings', section: 'tarif' },
  benutzer: { page: 'settings', section: 'team' },
  benachrichtigungen: { page: 'settings', section: 'meldungen' },
  sicherheit: { page: 'settings', section: 'sicherheit' },
  betrieb: { page: 'settings', section: 'sicherheit', part: 'betrieb' },
  pretix: { page: 'settings', section: 'verbindungen', part: 'pretix' },
  newsletter: { page: 'settings', section: 'verbindungen', part: 'newsletter' },
  smtp: { page: 'settings', section: 'verbindungen', part: 'email' },
  webhooks: { page: 'settings', section: 'verbindungen', part: 'webhooks' }
};

// Pages that used to pick their event from a list now live inside the event.
const legacyEventTabs = { auswertung: 'auswertung', fragen: 'fragen', formulare: 'fragen', qr: 'qr' };

const isKnown = (list, id) => list.some((item) => item.id === id);

function withPart(section, part) {
  return settingsParts[section]?.includes(part) ? part : null;
}

// Which page an address names, or null when it names none: a reserved flow, an unknown
// name, a path that goes deeper than any page. The caller falls back to the overview and
// straightens the address, so a wrong link never leaves the reader on a page it contradicts.
export function routeFromLocation(pathname = '', search = '') {
  const path = String(pathname).replace(/\/+$/, '') || adminBase;
  if (path !== adminBase && !path.startsWith(`${adminBase}/`)) return null;
  const parts = path.slice(adminBase.length).split('/').filter(Boolean).map(decodeURIComponent);
  const query = new URLSearchParams(String(search).replace(/^\?/, ''));
  if (parts.length === 0) {
    // The website links to the plan with a query of its own; both spellings exist.
    return query.has('plan') || query.has('billing') ? { page: 'settings', section: 'tarif', part: null } : { page: 'overview' };
  }
  const [first, second, third, ...rest] = parts;
  if (reservedPaths.includes(first) || rest.length) return null;

  if (first === 'events') {
    if (!second) return third ? null : { page: 'events' };
    if (third && !isKnown(eventTabs, third)) return null;
    return { page: 'event', eventId: second, tab: third || 'auswertung' };
  }
  if (third) return null;
  if (first === 'rueckrufe' && !second) return { page: 'callbacks' };
  if (first === 'wallboard' && !second) return { page: 'wallboard', eventId: query.get('event') || null };
  if (first === 'gaesteseite') {
    if (!second) return { page: 'guest', section: 'texte' };
    return isKnown(guestSections, second) ? { page: 'guest', section: second } : null;
  }
  if (first === 'einstellungen') {
    if (!second) return { page: 'settings', section: 'organisation', part: null };
    return isKnown(settingsSections, second) ? { page: 'settings', section: second, part: withPart(second, query.get('bereich')) } : null;
  }
  if (first === 'plattform') {
    if (!second) return { page: 'platform', section: 'mandanten' };
    return isKnown(platformSections, second) ? { page: 'platform', section: second } : null;
  }
  if (second) return null;
  if (legacyEventTabs[first]) return { page: 'event', eventId: query.get('event') || null, tab: legacyEventTabs[first] };
  if (legacyPages[first]) return { part: null, ...legacyPages[first] };
  return null;
}

// The address of a route, ready for the history.
export function pathForRoute(route = { page: 'overview' }) {
  switch (route.page) {
    case 'events':
      return `${adminBase}/events`;
    case 'event':
      // Without an event the page picks one and puts it into the address itself.
      return route.eventId
        ? `${adminBase}/events/${encodeURIComponent(route.eventId)}/${isKnown(eventTabs, route.tab) ? route.tab : 'auswertung'}`
        : `${adminBase}/events`;
    case 'callbacks':
      return `${adminBase}/rueckrufe`;
    case 'wallboard':
      return `${adminBase}/wallboard${route.eventId ? `?event=${encodeURIComponent(route.eventId)}` : ''}`;
    case 'guest':
      return `${adminBase}/gaesteseite/${isKnown(guestSections, route.section) ? route.section : 'texte'}`;
    case 'settings': {
      const section = isKnown(settingsSections, route.section) ? route.section : 'organisation';
      const part = withPart(section, route.part);
      return `${adminBase}/einstellungen/${section}${part ? `?bereich=${part}` : ''}`;
    }
    case 'platform':
      return `${adminBase}/plattform/${isKnown(platformSections, route.section) ? route.section : 'mandanten'}`;
    default:
      return adminBase;
  }
}

export function sameRoute(a, b) {
  return pathForRoute(a) === pathForRoute(b);
}

// The menu of the admin area in groups. The inbox look puts the voices of the current event
// first; everything else is the same for every look.
export function navGroups({ platformAdmin = false, inbox = false, currentEventId = null } = {}) {
  const overview = { key: 'overview', label: 'Übersicht', icon: 'overview', route: { page: 'overview' } };
  const votes = { key: 'votes', label: 'Stimmen', icon: 'inbox', route: { page: 'event', eventId: currentEventId, tab: 'auswertung' } };
  const events = { key: 'events', label: 'Events', icon: 'events', route: { page: 'events' } };
  const callbacks = { key: 'callbacks', label: 'Rückrufe', icon: 'callbacks', route: { page: 'callbacks' }, badge: 'callbacks' };
  const wallboard = { key: 'wallboard', label: 'Wallboard', icon: 'wallboard', route: { page: 'wallboard' } };
  const main = inbox ? [overview, votes, callbacks, events, wallboard] : [overview, events, callbacks, wallboard];
  const groups = [
    { id: 'main', title: null, items: main },
    { id: 'guest', title: 'Gästeseite', items: guestSections.map((item) => ({ key: `guest:${item.id}`, label: item.label, hint: item.hint, icon: item.icon, route: { page: 'guest', section: item.id } })) },
    { id: 'settings', title: 'Einstellungen', items: settingsSections.map((item) => ({ key: `settings:${item.id}`, label: item.label, hint: item.hint, icon: item.icon, route: { page: 'settings', section: item.id } })) }
  ];
  if (platformAdmin) {
    groups.push({ id: 'platform', title: 'Plattform', items: platformSections.map((item) => ({ key: `platform:${item.id}`, label: item.label, hint: item.hint, icon: item.icon, route: { page: 'platform', section: item.id } })) });
  }
  return groups;
}

// Which entry of the menu stands for the page on screen.
export function navKeyFor(route = {}, { inbox = false } = {}) {
  switch (route.page) {
    case 'events':
      return 'events';
    case 'event':
      return inbox && route.tab === 'auswertung' ? 'votes' : 'events';
    case 'callbacks':
      return 'callbacks';
    case 'wallboard':
      return 'wallboard';
    case 'guest':
      return `guest:${route.section}`;
    case 'settings':
      return `settings:${route.section}`;
    case 'platform':
      return `platform:${route.section}`;
    default:
      return 'overview';
  }
}

// What the header of a phone and the browser tab call the page.
export function routeTitle(route = {}, { eventName = '' } = {}) {
  switch (route.page) {
    case 'events':
      return 'Events';
    case 'event':
      return eventName || eventTabs.find((tab) => tab.id === route.tab)?.label || 'Event';
    case 'callbacks':
      return 'Rückrufe';
    case 'wallboard':
      return 'Wallboard';
    case 'guest':
      return guestSections.find((item) => item.id === route.section)?.label || 'Gästeseite';
    case 'settings':
      return settingsSections.find((item) => item.id === route.section)?.label || 'Einstellungen';
    case 'platform':
      return platformSections.find((item) => item.id === route.section)?.label || 'Plattform';
    case 'overview':
      return 'Übersicht';
    default:
      return 'Adminbereich';
  }
}

// The drawer travels in both directions, so it stays mounted through the way out.
// It opens straight away and a CSS animation carries it in: should the animation never
// run -- a throttled tab, a browser that skips it -- the drawer is simply there. Pushing
// it in afterwards would leave it beside the screen instead, and the menu would look broken.
export function nextMenuState(current, action) {
  if (action === 'open') return 'open';
  if (action === 'close') return current === 'closed' ? 'closed' : 'closing';
  // A timer that arrives after the drawer was opened again must not close it.
  if (action === 'gone') return current === 'closing' ? 'closed' : current;
  return current;
}

export const menuMounted = (state) => state !== 'closed';
export const menuShown = (state) => state === 'open';
