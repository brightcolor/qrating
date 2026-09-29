import { describe, expect, it } from 'vitest';
import { passwordHint, passwordProblem } from './passwordRules.js';

describe('a new password', () => {
  it('needs the least length of the server', () => {
    expect(passwordProblem('kurz', { minLength: 10 })).toBe('Das Passwort muss mindestens 10 Zeichen lang sein.');
    expect(passwordProblem('lang genug', { minLength: 10 })).toBe(null);
  });

  it('stays within the bytes bcrypt reads, umlauts counted twice', () => {
    expect(passwordProblem('ä'.repeat(36), { maxBytes: 72 })).toBe(null);
    expect(passwordProblem('ä'.repeat(37), { maxBytes: 72 })).toMatch(/höchstens 72 Byte/);
    expect(passwordProblem('a'.repeat(72), { maxBytes: 72 })).toBe(null);
  });

  it('leaves the check to the server while the rules are unknown', () => {
    expect(passwordProblem('x', {})).toBe(null);
    expect(passwordHint({ failed: true })).toMatch(/ließen sich gerade nicht laden; der Server prüft/);
    expect(passwordHint({ minLength: 12 })).toBe('Mindestens 12 Zeichen.');
    expect(passwordHint({})).toBe(null);
  });
});
