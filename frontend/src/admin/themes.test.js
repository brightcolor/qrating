import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultThemeId, readCachedTheme, shellListsSections, themeFor, themeStorageKey, themes, writeCachedTheme } from './themes.js';

const css = readFileSync(new URL('./admin.css', import.meta.url), 'utf8');
const fonts = readFileSync(new URL('./themeFonts.js', import.meta.url), 'utf8');

function memoryStorage(initial = {}) {
  const values = { ...initial };
  return {
    getItem: (key) => (key in values ? values[key] : null),
    setItem: (key, value) => { values[key] = String(value); },
    removeItem: (key) => { delete values[key]; },
    values
  };
}

describe('the ten looks of the admin area', () => {
  it('numbers the looks one to ten, as in the drafts', () => {
    expect(themes.map((theme) => theme.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(themes.map((theme) => theme.id)).size).toBe(10);
  });

  it('gives every look its colours and its fonts', () => {
    // A look without its block in the style sheet would show the colours of another.
    for (const theme of themes) {
      // The block of the look itself, with its colours; a rule that merely mentions the look is not enough.
      expect(css).toMatch(new RegExp(`:root\\[data-admin-theme='${theme.id}'\\] \\{[^}]*--q-bg:[^}]*--q-font:`));
      expect(fonts).toContain(`${theme.id}:`);
    }
  });

  it('says in a sentence what makes each look different', () => {
    for (const theme of themes) {
      expect(theme.name.trim()).not.toBe('');
      expect(theme.blurb.length).toBeGreaterThan(40);
    }
  });

  it('shows the default look for a name it does not know', () => {
    expect(themeFor('gibt-es-nicht').id).toBe(defaultThemeId);
    expect(themeFor(null).id).toBe(defaultThemeId);
    expect(themeFor('plakat').name).toBe('Plakat');
  });

  it('knows which frames carry the sections of the settings in their own menu', () => {
    expect(shellListsSections('baendchen')).toBe(true);
    expect(shellListsSections('tabellenwerk')).toBe(true);
    expect(shellListsSections('mischpult')).toBe(false);
    expect(shellListsSections('ablaufplan')).toBe(false);
    expect(shellListsSections('kommandozeile')).toBe(false);
  });
});

describe('the look the browser remembers', () => {
  it('starts the next visit in the chosen look', () => {
    const store = memoryStorage();

    writeCachedTheme('schwarzlicht', store);

    expect(store.values[themeStorageKey]).toBe('schwarzlicht');
    expect(readCachedTheme(store)).toBe('schwarzlicht');
  });

  it('ignores a remembered name that is no look', () => {
    expect(readCachedTheme(memoryStorage({ [themeStorageKey]: 'alt' }))).toBe(null);
  });

  it('keeps working when the browser keeps nothing', () => {
    const blocked = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); }
    };

    expect(readCachedTheme(blocked)).toBe(null);
    expect(() => writeCachedTheme('plakat', blocked)).not.toThrow();
    expect(readCachedTheme(null)).toBe(null);
  });

  it('forgets the look when the choice goes back to the default', () => {
    const store = memoryStorage({ [themeStorageKey]: 'plakat' });

    writeCachedTheme(null, store);

    expect(readCachedTheme(store)).toBe(null);
  });
});
