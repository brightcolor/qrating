// The line under every public page: who made this, with both marks and both links.
import React from 'react';
import './credit.css';

export const qratingUrl = 'https://qrating.de';
export const brightColorUrl = 'https://bright-color.de';

// The credit text stays with the backend, so the page reads the two names out of it
// and keeps whatever words stand between and around them.
export function creditParts(credit) {
  const text = String(credit ?? '');
  const match = /^([\s\S]*?)qrating([\s\S]*?)bright color([\s\S]*)$/.exec(text);
  if (!match) return null;
  return { before: match[1], middle: match[2], after: match[3] };
}

export function QratingSign({ className = 'brand-sign' }) {
  return <svg className={className} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <circle cx="20" cy="20" r="20" fill="#FFC933" />
    <path d="M20 8.5l3.4 6.9 7.6 1.1-5.5 5.4 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6-5.5-5.4 7.6-1.1z" fill="#25123A" />
  </svg>;
}

export function BrightColorSign({ className = 'brand-sign' }) {
  return <svg className={`${className} brand-sign--wide`} viewBox="0 0 240 198" aria-hidden="true" focusable="false">
    <path d="M12.606 12.634c24.299-24.299 75.523-12.478 114.27 26.269 38.747 38.747 50.568 89.971 26.269 114.27-23.642 24.299-74.867 12.478-113.614-26.926-39.404-38.747-51.225-89.971-26.926-113.614Z" fill="#bfd535" />
    <path d="M227.355 12.634c-24.299-24.299-75.523-12.478-114.27 26.269-38.747 38.747-51.225 89.971-26.926 114.27 24.299 24.299 75.523 12.478 114.27-26.926 38.747-38.747 50.568-89.971 26.926-113.614Z" fill="#fed329" />
    <path d="M227.355 185.353c-24.299 24.299-75.523 12.478-114.27-26.269-38.747-38.747-51.225-89.971-26.926-114.27 24.299-24.299 75.523-12.478 114.27 26.269 38.747 38.747 50.568 89.971 26.926 114.27Z" fill="#ee318a" />
    <path d="M12.606 185.353c24.299 24.299 75.523 12.478 114.27-26.269 38.747-38.747 50.568-89.971 26.269-114.27-23.642-24.299-74.867-12.478-113.614 26.269-39.404 38.747-51.225 89.971-26.926 114.27Z" fill="#1dc3f3" />
    <path d="M119.652 165.651c-1.97-1.97-4.597-4.597-6.567-6.567-38.747-38.747-51.225-89.971-26.926-114.27 8.537-8.537 19.702-12.478 32.836-12.478h1.313c13.135 0 24.956 3.94 32.836 12.478 24.299 24.299 12.478 75.523-26.269 114.27-1.97 1.97-4.597 4.597-7.224 6.567Z" fill="#aa4b88" />
  </svg>;
}

export function ProductCredit({ credit, className = 'guest-fine' }) {
  if (!credit) return null;
  const parts = creditParts(credit);
  const full = `${className} brand-credit`;
  if (!parts) return <p className={full}>{credit}</p>;
  return <p className={full}>
    {parts.before}
    <a className="brand-credit-link" href={qratingUrl} target="_blank" rel="noreferrer">
      <QratingSign />qrating
    </a>
    {parts.middle}
    <a className="brand-credit-link" href={brightColorUrl} target="_blank" rel="noreferrer">
      <BrightColorSign />bright color
    </a>
    {parts.after}
  </p>;
}
