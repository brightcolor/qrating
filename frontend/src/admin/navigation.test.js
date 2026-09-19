import { describe, expect, it } from 'vitest';
import { adminPages, menuMounted, menuShown, navFor, nextMenuState, pageTitle } from './navigation.js';

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
