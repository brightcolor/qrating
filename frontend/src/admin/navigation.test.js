import { describe, expect, it } from 'vitest';
import {
  eventTabs,
  guestSections,
  menuMounted,
  menuShown,
  navGroups,
  navKeyFor,
  nextMenuState,
  pathForRoute,
  platformSections,
  reservedPaths,
  routeFromLocation,
  routeTitle,
  sameRoute,
  settingsSections
} from './navigation.js';

const every = () => [
  { page: 'overview' },
  { page: 'events' },
  ...eventTabs.map((tab) => ({ page: 'event', eventId: 'e-1', tab: tab.id })),
  { page: 'callbacks' },
  { page: 'wallboard', eventId: null },
  ...guestSections.map((item) => ({ page: 'guest', section: item.id })),
  ...settingsSections.map((item) => ({ page: 'settings', section: item.id, part: null })),
  ...platformSections.map((item) => ({ page: 'platform', section: item.id }))
];

describe('the address of an admin page', () => {
  it('builds and reads back the address of every page', () => {
    for (const route of every()) {
      const address = pathForRoute(route);
      const [pathname, search = ''] = address.split('?');
      expect(address.startsWith('/admin')).toBe(true);
      expect(routeFromLocation(pathname, search)).toEqual(route);
    }
  });

  it('gives every page its own address', () => {
    const addresses = every().map(pathForRoute);

    expect(new Set(addresses).size).toBe(addresses.length);
    // A page must never take the address of the invite or the password flow.
    for (const address of addresses) {
      expect(reservedPaths.some((path) => address.startsWith(`/admin/${path}`))).toBe(false);
    }
  });

  it('opens a part of a settings page from the address', () => {
    expect(pathForRoute({ page: 'settings', section: 'verbindungen', part: 'pretix' })).toBe('/admin/einstellungen/verbindungen?bereich=pretix');
    expect(routeFromLocation('/admin/einstellungen/verbindungen', '?bereich=newsletter')).toEqual({ page: 'settings', section: 'verbindungen', part: 'newsletter' });
    // A part the page does not have is dropped, the page itself still opens.
    expect(routeFromLocation('/admin/einstellungen/team', '?bereich=pretix')).toEqual({ page: 'settings', section: 'team', part: null });
  });

  it('reads the bare area as the overview', () => {
    expect(routeFromLocation('/admin')).toEqual({ page: 'overview' });
    expect(routeFromLocation('/admin/')).toEqual({ page: 'overview' });
    expect(routeFromLocation('')).toEqual({ page: 'overview' });
  });

  it('opens the analysis of an event when the address names no tab', () => {
    expect(routeFromLocation('/admin/events/abc')).toEqual({ page: 'event', eventId: 'abc', tab: 'auswertung' });
  });
});

describe('addresses from before the reorganisation', () => {
  it('leads an evaluation, the questions and the QR page into their event', () => {
    expect(routeFromLocation('/admin/auswertung', '?event=abc-123')).toEqual({ page: 'event', eventId: 'abc-123', tab: 'auswertung' });
    expect(routeFromLocation('/admin/fragen')).toEqual({ page: 'event', eventId: null, tab: 'fragen' });
    expect(routeFromLocation('/admin/formulare')).toEqual({ page: 'event', eventId: null, tab: 'fragen' });
    expect(routeFromLocation('/admin/qr', '?event=x')).toEqual({ page: 'event', eventId: 'x', tab: 'qr' });
  });

  it('sends the old names to the page that took over their content', () => {
    expect(routeFromLocation('/admin/dashboard')).toEqual({ page: 'overview', part: null });
    expect(routeFromLocation('/admin/low-rating')).toMatchObject({ page: 'callbacks' });
    expect(routeFromLocation('/admin/benutzer')).toMatchObject({ page: 'settings', section: 'team' });
    expect(routeFromLocation('/admin/benachrichtigungen')).toMatchObject({ page: 'settings', section: 'meldungen' });
    expect(routeFromLocation('/admin/smtp')).toMatchObject({ page: 'settings', section: 'verbindungen', part: 'email' });
    expect(routeFromLocation('/admin/betrieb')).toMatchObject({ page: 'settings', section: 'sicherheit', part: 'betrieb' });
    expect(routeFromLocation('/admin/branding')).toMatchObject({ page: 'guest', section: 'aussehen' });
    expect(routeFromLocation('/admin/mandanten')).toMatchObject({ page: 'platform', section: 'mandanten' });
  });

  it('keeps the links the website already sends', () => {
    // The site points at the plan with a query, from before the pages had addresses.
    expect(routeFromLocation('/admin', '?plan')).toMatchObject({ page: 'settings', section: 'tarif' });
    expect(routeFromLocation('/admin', '?billing=1')).toMatchObject({ page: 'settings', section: 'tarif' });
    expect(routeFromLocation('/admin/plan')).toMatchObject({ page: 'settings', section: 'tarif' });
  });
});

describe('addresses that name no page', () => {
  it('leaves an invite and a password reset alone', () => {
    // Those two render their own screen; treating them as a page would swallow the token.
    expect(routeFromLocation('/admin/accept-invite', '?token=xyz')).toBe(null);
    expect(routeFromLocation('/admin/reset-password', '?token=xyz')).toBe(null);
  });

  it('names no page for an address nobody knows', () => {
    expect(routeFromLocation('/admin/gibt-es-nicht')).toBe(null);
    expect(routeFromLocation('/admin/auswertung/noch-was')).toBe(null);
    expect(routeFromLocation('/admin/events/abc/unbekannt')).toBe(null);
    expect(routeFromLocation('/admin/events/abc/fragen/mehr')).toBe(null);
    expect(routeFromLocation('/admin/einstellungen/gibt-es-nicht')).toBe(null);
    expect(routeFromLocation('/f/hsp-events')).toBe(null);
    expect(routeFromLocation('/administration')).toBe(null);
  });

  it('names no page for a broken percent sign, where decoding would stop the whole page', () => {
    expect(routeFromLocation('/admin/r%FCckrufe')).toBe(null);
    expect(routeFromLocation('/admin/events/%C3/fragen')).toBe(null);
    expect(routeFromLocation('/admin/r%C3%BCckrufe')).toBe(null);
  });

  it('finds no event page without an event and sends the list instead', () => {
    expect(pathForRoute({ page: 'event', eventId: null, tab: 'fragen' })).toBe('/admin/events');
  });
});

describe('the menu', () => {
  it('keeps the platform group for the platform role', () => {
    const forEveryone = navGroups().map((group) => group.id);
    const forPlatform = navGroups({ platformAdmin: true }).map((group) => group.id);

    expect(forEveryone).toEqual(['main', 'guest', 'settings']);
    expect(forPlatform).toEqual(['main', 'guest', 'settings', 'platform']);
  });

  it('lists every entry once and leads each to a page', () => {
    const items = navGroups({ platformAdmin: true }).flatMap((group) => group.items);
    const keys = items.map((item) => item.key);

    expect(new Set(keys).size).toBe(keys.length);
    for (const item of items) {
      expect(item.label.trim()).not.toBe('');
      expect(navKeyFor(item.route)).toBe(item.key);
    }
  });

  it('puts the voices of the current event first in the inbox look', () => {
    const main = navGroups({ inbox: true, currentEventId: 'e-7' })[0].items;

    expect(main.map((item) => item.key)).toEqual(['overview', 'votes', 'callbacks', 'events', 'wallboard']);
    expect(pathForRoute(main[1].route)).toBe('/admin/events/e-7/auswertung');
    expect(navKeyFor({ page: 'event', eventId: 'e-7', tab: 'auswertung' }, { inbox: true })).toBe('votes');
    expect(navKeyFor({ page: 'event', eventId: 'e-7', tab: 'fragen' }, { inbox: true })).toBe('events');
  });

  it('marks the event list while an event is open', () => {
    expect(navKeyFor({ page: 'event', eventId: 'x', tab: 'qr' })).toBe('events');
  });

  it('names every page for the header of a phone', () => {
    for (const route of every()) {
      expect(routeTitle(route)).not.toBe('Adminbereich');
    }
    expect(routeTitle({ page: 'event', eventId: 'x', tab: 'fragen' }, { eventName: 'Wismar tanzt' })).toBe('Wismar tanzt');
    expect(routeTitle({ page: 'nirgends' })).toBe('Adminbereich');
  });

  it('treats two routes to the same address as the same page', () => {
    expect(sameRoute({ page: 'settings', section: 'team' }, { page: 'settings', section: 'team', part: null })).toBe(true);
    expect(sameRoute({ page: 'event', eventId: 'a', tab: 'qr' }, { page: 'event', eventId: 'a', tab: 'fragen' })).toBe(false);
  });
});

describe('the drawer on a phone', () => {
  it('is there as soon as it opens, so a skipped animation cannot hide it', () => {
    const open = nextMenuState('closed', 'open');

    // The animation carries it in. Whether it runs decides how it arrives, never whether.
    expect(open).toBe('open');
    expect(menuMounted(open)).toBe(true);
    expect(menuShown(open)).toBe(true);
  });

  it('opens again out of every state', () => {
    for (const state of ['closed', 'closing', 'open']) {
      expect(menuShown(nextMenuState(state, 'open'))).toBe(true);
    }
  });

  it('stays mounted while it slides back out', () => {
    const closing = nextMenuState('open', 'close');

    expect(closing).toBe('closing');
    expect(menuMounted(closing)).toBe(true);
    expect(menuShown(closing)).toBe(false);
    expect(nextMenuState(closing, 'gone')).toBe('closed');
    expect(menuMounted('closed')).toBe(false);
  });

  it('ignores a timer that arrives after the drawer was opened again', () => {
    // Close, open again, and only then the timer of the first close fires.
    const reopened = nextMenuState(nextMenuState('open', 'close'), 'open');

    expect(nextMenuState(reopened, 'gone')).toBe('open');
  });

  it('leaves a closed drawer closed', () => {
    expect(nextMenuState('closed', 'close')).toBe('closed');
    expect(nextMenuState('closed', 'gone')).toBe('closed');
  });
});
