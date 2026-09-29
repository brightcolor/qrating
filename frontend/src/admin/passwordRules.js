// What a new password needs, as the settings of the server say: a least length in characters, and
// at most the bytes bcrypt reads. The server checks the same again when the password is saved.
export function passwordProblem(password, { minLength = null, maxBytes = null } = {}) {
  const text = String(password || '');
  if (minLength && text.length < minLength) return `Das Passwort muss mindestens ${minLength} Zeichen lang sein.`;
  if (maxBytes && new TextEncoder().encode(text).length > maxBytes) {
    return `Das Passwort ist zu lang: qrating wertet höchstens ${maxBytes} Byte aus, und Umlaute oder Sonderzeichen belegen je zwei bis vier davon. Kürze es bitte.`;
  }
  return null;
}

// The line under a password field. Without the rules of the server the form still works; the
// server then checks the password when it is saved.
export function passwordHint({ minLength = null, failed = false } = {}) {
  if (failed) return 'Die Passwortregeln ließen sich gerade nicht laden; der Server prüft das Passwort beim Speichern.';
  return minLength ? `Mindestens ${minLength} Zeichen.` : null;
}
