// One button walks through system setting, light and dark. Pages with their own
// top bar place it there; every other page gets it in the corner.
import React, { createContext, useContext } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { themeButtonLabel } from './theme.js';

export const ThemeContext = createContext(null);

export function ThemeSwitch({ className = 'guest-theme' }) {
  const setting = useContext(ThemeContext);
  if (!setting) return null;
  const { choice, cycle, lang } = setting;
  const Icon = choice === 'light' ? Sun : choice === 'dark' ? Moon : Monitor;
  const label = themeButtonLabel(choice, lang);
  return <button type="button" className={className} onClick={cycle} aria-label={label} title={label}>
    <Icon aria-hidden="true" />
  </button>;
}
