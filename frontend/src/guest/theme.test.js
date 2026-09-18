import { describe, expect, it } from 'vitest';
import {
  isThemeChoice,
  nextThemeChoice,
  readThemeChoice,
  resolveTheme,
  storeThemeChoice,
  themeButtonLabel,
  themeStorageKey
} from './theme.js';

function fakeStore(start = {}) {
  const values = { ...start };
  return {
    values,
    getItem: (key) => (key in values ? values[key] : null),
    setItem: (key, value) => {
      values[key] = String(value);
    }
  };
}

function lockedStore() {
  return {
    getItem: () => {
      throw new Error('Speicher gesperrt');
    },
    setItem: () => {
      throw new Error('Speicher gesperrt');
    }
  };
}

describe('light or dark on the guest page', () => {
  it('follows the system setting as long as nobody decided', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
  });

  it('keeps the decision of a guest against the system setting', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('walks through the three settings and comes back', () => {
    expect(nextThemeChoice('auto')).toBe('light');
    expect(nextThemeChoice('light')).toBe('dark');
    expect(nextThemeChoice('dark')).toBe('auto');
  });

  it('accepts only the three settings it knows', () => {
    expect(isThemeChoice('auto')).toBe(true);
    expect(isThemeChoice('sepia')).toBe(false);
    expect(storeThemeChoice('sepia', fakeStore())).toBe(false);
  });

  it('remembers the setting on this device', () => {
    const store = fakeStore();

    expect(storeThemeChoice('dark', store)).toBe(true);
    expect(store.values[themeStorageKey]).toBe('dark');
    expect(readThemeChoice(store)).toBe('dark');
  });

  it('falls back to the system setting for unknown or missing values', () => {
    expect(readThemeChoice(fakeStore())).toBe('auto');
    expect(readThemeChoice(fakeStore({ [themeStorageKey]: 'sepia' }))).toBe('auto');
    expect(readThemeChoice(null)).toBe('auto');
  });

  it('works on when the browser refuses to store anything', () => {
    expect(readThemeChoice(lockedStore())).toBe('auto');
    expect(storeThemeChoice('light', lockedStore())).toBe(false);
  });

  it('tells on the button what a tap does next', () => {
    expect(themeButtonLabel('auto', 'de')).toBe('Ansicht: Automatisch. Auf Hell umschalten.');
    expect(themeButtonLabel('dark', 'en')).toBe('Appearance: Dark. Switch to System.');
  });
});
