// Light or dark on the guest page: the system decides, and a guest who wants the
// other one keeps their choice on this device.
import { useEffect, useState } from 'react';

export const themeStorageKey = 'qrating.theme';
export const themeChoices = ['auto', 'light', 'dark'];

export function isThemeChoice(value) {
  return themeChoices.includes(String(value ?? ''));
}

// 'auto' follows the system, the other two are the guest's own decision.
export function resolveTheme(choice, prefersDark) {
  if (choice === 'light' || choice === 'dark') return choice;
  return prefersDark ? 'dark' : 'light';
}

// One button walks through the three settings.
export function nextThemeChoice(choice) {
  const index = themeChoices.indexOf(choice);
  return themeChoices[(index + 1) % themeChoices.length];
}

export const themeLabels = {
  de: { auto: 'Automatisch', light: 'Hell', dark: 'Dunkel' },
  en: { auto: 'System', light: 'Light', dark: 'Dark' }
};

export function themeLabel(choice, lang = 'de') {
  const set = themeLabels[lang] || themeLabels.de;
  return set[choice] || set.auto;
}

// The button says what a tap does, so nobody has to guess the order.
export function themeButtonLabel(choice, lang = 'de') {
  const target = nextThemeChoice(choice);
  const now = themeLabel(choice, lang);
  return lang === 'en'
    ? `Appearance: ${now}. Switch to ${themeLabel(target, 'en')}.`
    : `Ansicht: ${now}. Auf ${themeLabel(target, 'de')} umschalten.`;
}

// Private windows can refuse storage; the page then simply follows the system.
export function readThemeChoice(store = safeStorage()) {
  try {
    const value = store?.getItem(themeStorageKey);
    return isThemeChoice(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function storeThemeChoice(choice, store = safeStorage()) {
  if (!isThemeChoice(choice)) return false;
  try {
    store?.setItem(themeStorageKey, choice);
    return true;
  } catch {
    return false;
  }
}

function safeStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function systemPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useGuestTheme() {
  const [choice, setChoice] = useState(() => readThemeChoice());
  const [prefersDark, setPrefersDark] = useState(() => systemPrefersDark());

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const listen = (event) => setPrefersDark(event.matches);
    // Safari learned addEventListener on a media query in version 14; before that
    // only addListener exists, and a throw here would leave the page blank.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', listen);
      return () => query.removeEventListener('change', listen);
    }
    if (typeof query.addListener === 'function') {
      query.addListener(listen);
      return () => query.removeListener(listen);
    }
    return undefined;
  }, []);

  return {
    choice,
    theme: resolveTheme(choice, prefersDark),
    cycle: () => setChoice((old) => {
      const next = nextThemeChoice(old);
      storeThemeChoice(next);
      return next;
    })
  };
}
