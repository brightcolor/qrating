import { describe, expect, it } from 'vitest';
import {
  adminPages,
  menuMounted,
  menuShown,
  navFor,
  nextMenuState,
  pageFromPath,
  pageTitle,
  pathFor,
  reservedPaths
} from './navigation.js';

describe('the admin navigation', () => {
  it('keeps the tenant list for the platform role', () => {
    const forEveryone = navFor().map((page) => page.id);
    const forPlatform = navFor({ platformAdmin: true }).map((page) => page.id);

    expect(forEveryone).not.toContain('tenants');
    expect(forPlatform[0]).toBe('tenants');
    expect(forPlatform.length).toBe(forEveryone.length + 1);
  });

  it('names every page it lists', () => {
    for (const page of adminPages) {
      expect(pageTitle(page.id)).toBe(page.label);
      expect(page.label.trim()).not.toBe('');
    }
  });

  it('answers an unknown page with the name of the area', () => {
    expect(pageTitle('gibt-es-nicht')).toBe('Adminbereich');
    expect(pageTitle(undefined)).toBe('Adminbereich');
  });

  it('lists every page exactly once', () => {
    const ids = adminPages.map((page) => page.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the address of an admin page', () => {
  it('builds and reads back the address of every page', () => {
    for (const page of adminPages) {
      const address = pathFor(page.id);
      expect(address.startsWith('/admin/')).toBe(true);
      expect(pageFromPath(address)).toBe(page.id);
    }
  });

  it('gives every page its own name', () => {
    const slugs = adminPages.map((page) => page.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    // A page must never take the address of the invite or the password flow.
    expect(slugs.filter((slug) => reservedPaths.includes(slug))).toEqual([]);
  });

  it('carries what a page shows beside its name', () => {
    expect(pathFor('analytics', { event: 'abc-123' })).toBe('/admin/auswertung?event=abc-123');
    expect(pageFromPath('/admin/auswertung', '?event=abc-123')).toBe('analytics');
    // An empty value belongs in no address.
    expect(pathFor('qr', { event: '' })).toBe('/admin/qr');
    expect(pathFor('qr', { event: null })).toBe('/admin/qr');
  });

  it('reads the bare area as the dashboard', () => {
    expect(pageFromPath('/admin')).toBe('dashboard');
    expect(pageFromPath('/admin/')).toBe('dashboard');
  });

  it('keeps the links the website already sends', () => {
    // The site points at the plan with a query, from before the pages had addresses.
    expect(pageFromPath('/admin', '?plan')).toBe('billing');
    expect(pageFromPath('/admin', '?billing=1')).toBe('billing');
  });

  it('names no page for an invite or a password reset', () => {
    // Those two render their own screen; treating them as a page would swallow the token.
    expect(pageFromPath('/admin/accept-invite', '?token=xyz')).toBe(null);
    expect(pageFromPath('/admin/reset-password', '?token=xyz')).toBe(null);
  });

  it('names no page for an address nobody knows', () => {
    expect(pageFromPath('/admin/gibt-es-nicht')).toBe(null);
    expect(pageFromPath('/admin/auswertung/noch-was')).toBe(null);
    expect(pageFromPath('/f/hsp-events')).toBe(null);
    expect(pageFromPath('/administration')).toBe(null);
    expect(pageFromPath('')).toBe('dashboard');
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
