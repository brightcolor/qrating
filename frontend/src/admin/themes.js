// The ten looks of the admin area. Each person picks one for themselves; the choice travels
// with the account, and the browser remembers it so the next visit starts in the right look.
// `shell` names the frame around the pages: where the menu sits and how it is built.
export const themes = [
  {
    id: 'baendchen',
    number: 1,
    name: 'Bändchen',
    blurb: 'Die Farben und Schrift der Website. Das Event liegt als Band oben, das Menü ist nach Aufgaben gruppiert.',
    shell: 'sidebar',
    dark: false
  },
  {
    id: 'einlassliste',
    number: 2,
    name: 'Einlassliste',
    blurb: 'Hell wie ein Klemmbrett, Menü oben statt Seitenleiste. Was du erledigen musst, ist wie mit Textmarker markiert.',
    shell: 'topbar',
    dark: false
  },
  {
    id: 'mischpult',
    number: 3,
    name: 'Mischpult',
    blurb: 'Dunkel für die Nacht im Club. Schmale Symbolleiste, Zahlen als Pegel und Regler, alles auf einen Blick.',
    shell: 'rail',
    dark: true
  },
  {
    id: 'ablaufplan',
    number: 4,
    name: 'Ablaufplan',
    blurb: 'Die Eventliste ist das Menü. Oben die Runde als Zeitleiste mit Stimmen je Stunde und dem Jetzt-Strich.',
    shell: 'eventlist',
    dark: false
  },
  {
    id: 'eintrittskarte',
    number: 5,
    name: 'Eintrittskarte',
    blurb: 'Das Event als Ticket mit Abriss und Stempel, wie die Karte auf der Gästeseite. Helles Menü mit Gruppen.',
    shell: 'sidebar',
    dark: false
  },
  {
    id: 'kommandozeile',
    number: 6,
    name: 'Kommandozeile',
    blurb: 'Keine Seitenleiste. Jede Seite und jedes Event per Suchfeld mit Strg K erreichbar, Reiter darunter.',
    shell: 'command',
    dark: false
  },
  {
    id: 'posteingang',
    number: 7,
    name: 'Posteingang',
    blurb: 'Die Stimmen der Gäste stehen im Mittelpunkt wie Mails im Postfach. Rechts die Zahlen und der ausgewählte Rückruf.',
    shell: 'sidebar',
    dark: false
  },
  {
    id: 'plakat',
    number: 8,
    name: 'Plakat',
    blurb: 'Das Event groß wie ein Flyer, darunter ruhig und dicht. Menü als schwarze Leiste oben.',
    shell: 'topbar',
    dark: false
  },
  {
    id: 'schwarzlicht',
    number: 9,
    name: 'Schwarzlicht',
    blurb: 'Dunkel mit UV-Leuchten für den Blick aufs Handy im Club. Oben ein Live-Band mit den letzten Stimmen.',
    shell: 'sidebar',
    dark: true
  },
  {
    id: 'tabellenwerk',
    number: 10,
    name: 'Tabellenwerk',
    blurb: 'So dicht wie eine Tabelle: alle Events in einer Liste, das gewählte klappt darunter auf. Menü als Leiste mit Klappmenüs.',
    shell: 'menubar',
    dark: false
  }
];

export const defaultThemeId = 'baendchen';
export const themeStorageKey = 'qrating.adminTheme';

// Any name the list does not know, an old one or an empty one, shows the default look.
export function themeFor(id) {
  return themes.find((theme) => theme.id === id) || themes.find((theme) => theme.id === defaultThemeId);
}

// Which shells list the sections of the settings and of the guest page in their own menu.
// The others need a row of tabs on the page itself, or the sections could not be reached.
export function shellListsSections(theme) {
  return ['sidebar', 'topbar', 'menubar'].includes(themeFor(theme?.id || theme).shell);
}

function storage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

// The browser only remembers the last look for the first paint. Private windows and blocked
// storage throw or come back empty; the page then starts in the default look.
export function readCachedTheme(store = storage()) {
  try {
    const value = store?.getItem(themeStorageKey);
    return themes.some((theme) => theme.id === value) ? value : null;
  } catch {
    return null;
  }
}

export function writeCachedTheme(id, store = storage()) {
  try {
    if (id) store?.setItem(themeStorageKey, id);
    else store?.removeItem(themeStorageKey);
  } catch {
    // A browser that keeps nothing starts in the default look next time. Nothing is lost.
  }
}
