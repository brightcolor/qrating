import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

// bcrypt reads the first 72 bytes of a password and drops the rest without a word. A longer
// password would only look stronger, so qrating turns it away and says why. The 72 comes with
// the method itself.
export const passwordMaxBytes = 72;

// Why a new password cannot be used, or null.
export function passwordProblem(password) {
  const text = String(password || '');
  if (text.length < env.passwordMinLength) return `Das Passwort muss mindestens ${env.passwordMinLength} Zeichen lang sein.`;
  if (Buffer.byteLength(text, 'utf8') > passwordMaxBytes) {
    return `Das Passwort ist zu lang: qrating wertet höchstens ${passwordMaxBytes} Byte aus, und Umlaute oder Sonderzeichen belegen je zwei bis vier davon. Kürze es bitte.`;
  }
  return null;
}

export function hashPassword(password) {
  return bcrypt.hash(String(password), env.passwordHashCost);
}
