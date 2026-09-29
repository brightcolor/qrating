import { describe, expect, it } from 'vitest';
import { createSessionEndHandler, rememberSessionEnd, takeSessionEnd } from './sessionEnd.js';

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

describe('a session that ends in the middle of work', () => {
  function handler(storage = memoryStorage()) {
    const calls = { reloads: 0, notices: [] };
    const watch = createSessionEndHandler({
      storage,
      reload: () => { calls.reloads += 1; },
      notify: (text) => calls.notices.push(text)
    });
    return { watch, calls, storage };
  }

  it('keeps the reason and loads the sign-in once per page life', () => {
    const { watch, calls, storage } = handler();

    watch.handle('Dein Konto ist deaktiviert.');
    watch.handle('Dein Konto ist deaktiviert.');

    expect(calls.reloads).toBe(1);
    expect(takeSessionEnd(storage)).toBe('Dein Konto ist deaktiviert.');
  });

  it('stays and says why when the last load found the session valid', () => {
    const storage = memoryStorage();
    rememberSessionEnd('Du bist nicht angemeldet.', storage);
    const { watch, calls } = handler(storage);

    watch.handle('Du bist nicht angemeldet.');
    watch.handle('Du bist nicht angemeldet.');

    expect(calls.reloads).toBe(0);
    expect(calls.notices).toHaveLength(1);
    expect(calls.notices[0]).toMatch(/obwohl deine Sitzung gilt\. Du bist nicht angemeldet\. Lade die Seite neu/);
    expect(takeSessionEnd(storage)).toBe('');
  });

  it('stays quiet during a sign-out on purpose, and watches again when it fails', () => {
    const { watch, calls } = handler();

    watch.leave();
    watch.handle('Du bist nicht angemeldet.');
    expect(calls.reloads).toBe(0);

    watch.stay();
    watch.handle('Du bist nicht angemeldet.');
    expect(calls.reloads).toBe(1);
  });
});
