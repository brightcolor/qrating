import { describe, expect, it } from 'vitest';
import { rememberSessionEnd, takeSessionEnd } from './sessionEnd.js';

function memoryStorage() {
  const values = {};
  return {
    getItem: (key) => (key in values ? values[key] : null),
    setItem: (key, value) => { values[key] = String(value); },
    removeItem: (key) => { delete values[key]; },
    values
  };
}

describe('the reason a session ended', () => {
  it('reaches the sign-in once and is gone afterwards', () => {
    const storage = memoryStorage();

    rememberSessionEnd('Dein Konto ist deaktiviert.', storage);

    expect(takeSessionEnd(storage)).toBe('Dein Konto ist deaktiviert.');
    expect(takeSessionEnd(storage)).toBe('');
  });

  it('keeps the sign-in working when the browser keeps nothing', () => {
    const blocked = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); }
    };

    expect(() => rememberSessionEnd('Grund', blocked)).not.toThrow();
    expect(takeSessionEnd(blocked)).toBe('');
    expect(takeSessionEnd(null)).toBe('');
  });
});
