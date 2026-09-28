// Why the last session ended, for the sign-in that follows the reload. The browser keeps it for
// this tab only; without storage the sign-in simply shows no reason.
const storageKey = 'qrating.sessionEnded';

function tabStorage() {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberSessionEnd(message, storage = tabStorage()) {
  try {
    if (message) storage?.setItem(storageKey, String(message));
  } catch {
    // Storage switched off: the reload still leads to the sign-in.
  }
}

export function takeSessionEnd(storage = tabStorage()) {
  try {
    const message = storage?.getItem(storageKey) || '';
    storage?.removeItem(storageKey);
    return message;
  } catch {
    return '';
  }
}
