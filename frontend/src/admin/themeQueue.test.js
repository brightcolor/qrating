import { describe, expect, it } from 'vitest';
import { createThemeQueue } from './themeQueue.js';

// A save the test answers by hand, in the order it wants.
function manualSave() {
  const calls = [];
  const save = (id) => new Promise((resolve, reject) => calls.push({ id, resolve, reject }));
  return { save, calls };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the choices of a look', () => {
  it('go to the server one after the other, so the last click is what the account keeps', async () => {
    const { save, calls } = manualSave();
    const queue = createThemeQueue(save, 'baendchen');

    const first = queue.choose('plakat');
    const second = queue.choose('mischpult');
    await settle();
    expect(calls.map((call) => call.id)).toEqual(['plakat']);

    calls[0].resolve({ adminTheme: 'plakat' });
    await settle();
    expect(calls.map((call) => call.id)).toEqual(['plakat', 'mischpult']);
    calls[1].resolve({ adminTheme: 'mischpult' });

    expect(await first).toEqual({ saved: 'plakat', newest: false });
    expect(await second).toEqual({ saved: 'mischpult', newest: true });
    expect(queue.saved).toBe('mischpult');
  });

  it('let a reading of the account count only when no choice came after it', async () => {
    const { save, calls } = manualSave();
    const queue = createThemeQueue(save, 'baendchen');

    const quiet = queue.mark();
    expect(queue.accepts(quiet)).toBe(true);

    const before = queue.mark();
    const choice = queue.choose('plakat');
    expect(queue.accepts(before)).toBe(false);
    await settle();
    calls[0].resolve({ adminTheme: 'plakat' });
    await choice;
    // Settled, and still the reading from before the click must not bring the old look back.
    expect(queue.accepts(before)).toBe(false);
    expect(queue.accepts(queue.mark())).toBe(true);
  });

  it('let a reading that started during a choice count never, even once the choice has settled', async () => {
    const { save, calls } = manualSave();
    const queue = createThemeQueue(save, 'baendchen');

    const choice = queue.choose('plakat');
    const during = queue.mark();
    await settle();
    expect(queue.accepts(during)).toBe(false);
    calls[0].resolve({ adminTheme: 'plakat' });
    await choice;

    expect(queue.accepts(during)).toBe(false);
    expect(queue.accepts(queue.mark())).toBe(true);
  });

  it('let a reading that started during a failed choice count never as well', async () => {
    const { save, calls } = manualSave();
    const queue = createThemeQueue(save, 'baendchen');

    const choice = queue.choose('plakat');
    const during = queue.mark();
    await settle();
    calls[0].reject(new Error('Der Server ist gerade nicht erreichbar.'));
    await expect(choice).rejects.toMatchObject({ newest: true });

    expect(queue.accepts(during)).toBe(false);
  });

  it('name the look the account keeps when the newest choice fails', async () => {
    const { save, calls } = manualSave();
    const queue = createThemeQueue(save, 'baendchen');

    const choice = queue.choose('plakat');
    await settle();
    calls[0].reject(new Error('Der Server ist gerade nicht erreichbar.'));

    await expect(choice).rejects.toMatchObject({ newest: true, keptTheme: 'baendchen' });
  });

  it('keep an earlier failure quiet while a newer choice is on its way', async () => {
    const { save, calls } = manualSave();
    const queue = createThemeQueue(save, 'baendchen');

    const first = queue.choose('plakat');
    const second = queue.choose('mischpult');
    await settle();
    calls[0].reject(new Error('Zeitüberschreitung.'));
    await expect(first).rejects.toMatchObject({ newest: false });

    await settle();
    calls[1].resolve({ adminTheme: 'mischpult' });
    expect(await second).toEqual({ saved: 'mischpult', newest: true });
  });

  it('take a confirmed reading as the look the account keeps', () => {
    const queue = createThemeQueue(() => Promise.resolve({}), 'baendchen');

    queue.confirm('schwarzlicht');

    expect(queue.saved).toBe('schwarzlicht');
  });
});
