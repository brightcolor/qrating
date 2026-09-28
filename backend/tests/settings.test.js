import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { numberSettings, readSettings, settingsFailure, textSettings } from '../src/config/env.js';

const exampleEnv = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

describe('the settings of an installation', () => {
  it('takes the defaults when nothing is set', () => {
    const { values, errors } = readSettings({});

    expect(errors).toEqual([]);
    expect(values).toMatchObject({ adminSessionHours: 12, inviteValidDays: 7, retentionMaxDays: 3650, adminCookieName: 'qrating_admin' });
  });

  it('reads other values than the defaults', () => {
    const { values, errors } = readSettings({ INVITE_VALID_DAYS: '3', ADMIN_COOKIE_NAME: 'andere_sitzung', RETENTION_MAX_DAYS: ' 400 ' });

    expect(errors).toEqual([]);
    expect(values).toMatchObject({ inviteValidDays: 3, adminCookieName: 'andere_sitzung', retentionMaxDays: 400 });
  });

  it('names every value outside its bounds, together with what the setting does', () => {
    const { values, errors } = readSettings({
      PORT: 'abc',
      PASSWORD_MIN_LENGTH: '4',
      WORKER_INTERVAL_MS: '1.5',
      ADMIN_COOKIE_NAME: 'mit leerzeichen'
    });

    expect(errors).toHaveLength(4);
    expect(errors[0]).toBe('PORT muss eine ganze Zahl von 1 bis 65535 sein, eingetragen ist „abc“. Port, auf dem die API lauscht.');
    expect(errors.join(' ')).toContain('PASSWORD_MIN_LENGTH muss eine ganze Zahl von 8 bis 128 sein, eingetragen ist „4“.');
    expect(errors.join(' ')).toContain('WORKER_INTERVAL_MS muss eine ganze Zahl');
    expect(errors.join(' ')).toContain('ADMIN_COOKIE_NAME muss aus Buchstaben, Ziffern, _ und - bestehen');
    // A wrong value never turns into NaN on the way.
    expect(values.port).toBe(4000);
  });

  it('checks the settings that belong together', () => {
    expect(readSettings({ RETENTION_MIN_DAYS: '100', RETENTION_MAX_DAYS: '50' }).errors[0])
      .toContain('RETENTION_MIN_DAYS (100) liegt über RETENTION_MAX_DAYS (50)');
    expect(readSettings({ RETENTION_MAX_DAYS: '60' }).errors[0])
      .toBe('RETENTION_PHONE_DEFAULT_DAYS (90) muss zwischen RETENTION_MIN_DAYS (1) und RETENTION_MAX_DAYS (60) liegen.');
    expect(readSettings({ WALLBOARD_REFRESH_DEFAULT_SECONDS: '2' }).errors[0])
      .toContain('WALLBOARD_REFRESH_DEFAULT_SECONDS (2) muss zwischen WALLBOARD_REFRESH_MIN_SECONDS (5)');
  });

  it('says in one message why the start stops', () => {
    expect(settingsFailure(['A', 'B'])).toBe('qrating startet nicht, weil 2 Einstellungen ungültig sind. Korrigiere die Werte in der .env-Datei und starte neu:\n- A\n- B');
    expect(settingsFailure(['A'])).toContain('weil eine Einstellung ungültig ist');
  });

  it('keeps every default inside its own bounds and says what the setting does', () => {
    for (const setting of numberSettings) {
      expect(setting.fallback, setting.name).toBeGreaterThanOrEqual(setting.min);
      expect(setting.fallback, setting.name).toBeLessThanOrEqual(setting.max);
      expect(setting.hint.length, setting.name).toBeGreaterThan(10);
    }
    for (const setting of textSettings) expect(setting.test(setting.fallback), setting.name).toBe(true);
  });

  it('documents every setting in the example environment and in the README', () => {
    for (const setting of [...numberSettings, ...textSettings]) {
      expect(exampleEnv, setting.name).toMatch(new RegExp(`^#?\\s?${setting.name}=`, 'm'));
      expect(readme, setting.name).toContain(`\`${setting.name}\``);
    }
  });
});
