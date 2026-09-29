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

// What the admin area does when a request answers that nobody is signed in. Once per page life it
// keeps the reason and loads the sign-in. A reason still waiting from the last load means that
// load found the session valid: a layer in front of qrating refuses single requests, and loading
// again would go round in circles, so the page says what happened and stays.
export function createSessionEndHandler({ reload, notify, storage = tabStorage() }) {
  let settled = false;
  return {
    handle(message) {
      if (settled) return;
      settled = true;
      if (takeSessionEnd(storage)) {
        notify(`Eine Anfrage kam als „nicht angemeldet“ zurück, obwohl deine Sitzung gilt. ${message} Lade die Seite neu; bleibt es dabei, melde dich ab und wieder an, oder frag die Person, die qrating betreibt.`.replace(/\s+/g, ' ').trim());
        return;
      }
      rememberSessionEnd(message, storage);
      reload();
    },
    // A sign-out on purpose ends the session as well; the sign-in after it needs no reason.
    leave() {
      settled = true;
    },
    // The sign-out did not go through: the session goes on and is watched again.
    stay() {
      settled = false;
    }
  };
}
