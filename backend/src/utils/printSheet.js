// The sheets that stand at the event: guests see the code, what it is for,
// and nothing they would have to type. Four designs, one of them for the organizer.
import { DateTime } from 'luxon';
import { escapeHtml } from './html.js';
import { plainText } from './localized.js';

const fallbackAccent = '#2563eb';

// The color comes from the organization settings and ends up inside a style block.
export function safeAccent(value) {
  const color = String(value ?? '').trim();
  return /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(color) ? color : fallbackAccent;
}

function eventDateTime(value, zone) {
  if (!value) return null;
  const parsed = DateTime.fromJSDate(value instanceof Date ? value : new Date(value), { zone: 'utc' });
  if (!parsed.isValid) return null;
  return parsed.setZone(zone).setLocale('de');
}

// Guests read a date, so the day stands in words and a run of days keeps one year at the end.
export function formatEventPeriod(event) {
  const zone = event?.event_timezone || 'Europe/Berlin';
  const start = eventDateTime(event?.date_from, zone);
  if (!start) return '';
  const end = eventDateTime(event?.date_to, zone);
  if (!end || end.hasSame(start, 'day')) return start.toFormat('cccc, d. LLLL yyyy');
  if (start.hasSame(end, 'month')) return `${start.toFormat('d.')} – ${end.toFormat('d. LLLL yyyy')}`;
  if (start.hasSame(end, 'year')) return `${start.toFormat('d. LLLL')} – ${end.toFormat('d. LLLL yyyy')}`;
  return `${start.toFormat('d. LLLL yyyy')} – ${end.toFormat('d. LLLL yyyy')}`;
}

const star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.1l2.7 5.8 6.3.8-4.7 4.3 1.3 6.3L12 17.2 6.4 20.3l1.3-6.3L3 9.7l6.3-.8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';

// Four ways to put the same thing on paper.
export const sheetDesigns = {
  klassik: {
    label: 'Klassik',
    hint: 'Sterne, Frage, Code und darunter das Event.'
  },
  pur: {
    label: 'Pur',
    hint: 'Nur die Frage und ein großer Code. Passt für den Veranstalter.'
  },
  tafel: {
    label: 'Tafel',
    hint: 'Farbiges Kopfband, sehr große Schrift, für die Wand.'
  },
  karte: {
    label: 'Tischkarte',
    hint: 'Kleine Karte zum Ausschneiden und Aufstellen.'
  }
};

export function isSheetDesign(value) {
  return Object.prototype.hasOwnProperty.call(sheetDesigns, String(value || ''));
}

const baseStyles = (accent) => `
@page { size: A4; margin: 14mm; }
:root { --accent: ${accent}; --ink: #14151a; --muted: #6b6f76; --line: #dcdfe4; }
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: #eceef1; color: var(--ink); font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; padding: 28px 16px 56px; display: flex; flex-direction: column; align-items: center; gap: 20px; }
.sheet { width: 182mm; min-height: 265mm; background: #fff; border-radius: 2mm; box-shadow: 0 18px 40px rgba(16,18,22,.18); padding: 16mm 16mm 15mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.host { margin: 0; font-size: 10pt; letter-spacing: .34em; text-transform: uppercase; color: var(--muted); }
.middle { display: flex; flex-direction: column; align-items: center; }
.stars { display: flex; gap: 2.5mm; color: var(--accent); }
.stars svg { width: 10mm; height: 10mm; }
.hook { margin: 5mm 0 0; font-family: Georgia, "Times New Roman", serif; font-size: 40pt; line-height: 1.04; letter-spacing: -.015em; font-weight: 400; }
.lead { margin: 4mm 0 0; max-width: 118mm; font-size: 12pt; line-height: 1.45; color: var(--muted); }
.code { margin: 8mm 0 0; padding: 4mm; border: 1px solid var(--line); border-radius: 3mm; }
.code svg { display: block; width: 112mm; height: 112mm; }
.steps { margin: 6mm 0 0; padding: 0; list-style: none; display: flex; gap: 7mm; font-size: 10pt; letter-spacing: .2em; text-transform: uppercase; }
.steps li { position: relative; }
.steps li + li::before { content: ""; position: absolute; left: -4.2mm; top: 50%; width: 1.4mm; height: 1.4mm; margin-top: -.7mm; border-radius: 50%; background: var(--accent); }
.what { position: relative; width: 100%; border-top: 1px solid var(--line); padding-top: 7mm; }
.rule { position: absolute; top: -.6mm; left: 50%; width: 16mm; height: 1.2mm; margin-left: -8mm; border-radius: 1mm; background: var(--accent); }
.event { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 23pt; line-height: 1.2; }
.when { margin: 3mm 0 0; font-size: 11.5pt; color: var(--muted); }
.credit { margin: 6mm 0 0; font-size: 8.5pt; color: var(--muted); }
.actions { margin: 0; }
.actions button { font: inherit; font-size: 15px; padding: 11px 24px; border: 0; border-radius: 9px; background: var(--ink); color: #fff; cursor: pointer; }
.actions button:hover { background: #2a2d35; }
@media print {
  body { background: #fff; padding: 0; display: block; }
  .sheet { width: auto; min-height: 265mm; box-shadow: none; border-radius: 0; padding: 0; }
  .actions { display: none; }
}`;

const designStyles = {
  klassik: '',
  pur: `
.sheet { justify-content: center; gap: 0; }
.hook { font-size: 54pt; }
.code { margin-top: 12mm; padding: 0; border-width: 0; }
.code svg { width: 140mm; height: 140mm; }
.steps { margin-top: 9mm; }
.event { font-size: 17pt; margin-top: 12mm; }
.when { font-size: 10.5pt; }
.what { border-top: 0; padding-top: 0; }
.rule { display: none; }`,
  tafel: `
.sheet { padding: 0 0 12mm; justify-content: flex-start; overflow: hidden; }
.band { width: 100%; background: var(--accent); color: #fff; padding: 13mm 14mm 11mm; text-align: left; }
.band .host { color: rgba(255,255,255,.82); }
.band .hook { color: #fff; font-family: "Segoe UI", Arial, sans-serif; font-weight: 700; font-size: 44pt; letter-spacing: -.02em; margin-top: 4mm; }
.band .lead { color: rgba(255,255,255,.88); max-width: none; margin-top: 4mm; }
.middle { padding: 0 14mm; }
.stars { display: none; }
.code { margin-top: 9mm; border: 0; padding: 0; }
.code svg { width: 120mm; height: 120mm; }
.what { border-top: 0; padding: 10mm 14mm 0; }
.rule { display: none; }
.event { font-family: "Segoe UI", Arial, sans-serif; font-weight: 700; font-size: 20pt; }`,
  karte: `
body { padding-top: 40px; }
.sheet { min-height: 0; width: 112mm; padding: 11mm; border: 1.5px dashed var(--line); border-radius: 4mm; justify-content: flex-start; }
.stars { gap: 2mm; }
.stars svg { width: 7mm; height: 7mm; }
.hook { font-size: 24pt; margin-top: 4mm; }
.lead { font-size: 10pt; margin-top: 3mm; max-width: none; }
.steps { font-size: 8.5pt; gap: 5mm; margin-top: 5mm; }
.code { margin-top: 6mm; padding: 0; border: 0; }
.code svg { width: 88mm; height: 88mm; }
.what { border-top: 0; padding-top: 6mm; }
.rule { display: none; }
.event { font-size: 13pt; }
.when { font-size: 9.5pt; margin-top: 1mm; }
.credit { margin-top: 3mm; font-size: 7.5pt; }
.cut { margin: 0 0 8px; font-size: 12px; color: #6b6f76; }
@media print { .sheet { min-height: 0; width: 112mm; padding: 11mm; } .cut { display: none; } }`
};

// Guests scan the code, so nothing here asks anyone to type an address.
function sheetBody({ design, hostLine, hook, lead, qrSvg, event, details, credit }) {
  const stars = `<div class="stars">${star.repeat(5)}</div>`;
  const steps = '<ol class="steps"><li>Scannen</li><li>Bewerten</li><li>Fertig</li></ol>';
  const bottom = `<footer class="what"><span class="rule"></span>`
    + `${event ? `<p class="event">${event}</p>` : ''}`
    + `${details ? `<p class="when">${details}</p>` : ''}`
    + `${credit ? `<p class="credit">${credit}</p>` : ''}</footer>`;

  if (design === 'tafel') {
    return `<article class="sheet">`
      + `<div class="band"><p class="host">${hostLine}</p><h1 class="hook">${hook}</h1><p class="lead">${lead}</p></div>`
      + `<div class="middle"><figure class="code">${qrSvg}</figure>${steps}</div>`
      + `${bottom}</article>`;
  }

  // The card stands upright on a table, so the code sits under the question, at full width.
  const cut = design === 'karte' ? '<p class="cut">Ausschneiden und aufstellen.</p>' : '';

  if (design === 'pur') {
    return `<article class="sheet">`
      + `<div class="middle"><p class="host">${hostLine}</p><h1 class="hook">${hook}</h1>`
      + `<figure class="code">${qrSvg}</figure>${steps}</div>`
      + `${bottom}</article>`;
  }

  return `${cut}<article class="sheet">`
    + `<p class="host">${hostLine}</p>`
    + `<div class="middle">${stars}<h1 class="hook">${hook}</h1><p class="lead">${lead}</p>`
    + `<figure class="code">${qrSvg}</figure>${steps}</div>`
    + `${bottom}</article>`;
}

export function renderQrPrintSheet({
  event = null,
  organizationName,
  accentColor,
  qrSvg,
  nonce,
  credit = null,
  design = 'klassik',
  hook: ownHook = null,
  lead: ownLead = null
}) {
  const chosen = isSheetDesign(design) ? design : 'klassik';
  const accent = safeAccent(accentColor);
  const host = String(organizationName ?? '').trim();
  const name = event ? escapeHtml(event.name ?? 'Event') : '';
  const period = event ? formatEventPeriod(event) : '';
  const place = event ? plainText(event.location) : '';
  const details = [period, place].filter(Boolean).map((part) => escapeHtml(part)).join(' · ');
  // An organizer sheet stands for every evening, so it names no single one.
  const hook = escapeHtml(ownHook || (event ? 'Wie war’s?' : 'Wie war’s?'));
  const lead = escapeHtml(ownLead || (event
    ? 'Scanne den Code mit der Kamera und sag uns, was gut war und was besser sein darf.'
    : 'Scanne den Code mit der Kamera und sag uns, wie dein Abend war.'));
  const title = event ? `QR-Aushang: ${name}` : `QR-Aushang: ${escapeHtml(host || 'Veranstalter')}`;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>${title}</title><style>${baseStyles(accent)}${designStyles[chosen]}</style></head><body>`
    + sheetBody({
      design: chosen,
      hostLine: host ? escapeHtml(host) : 'Feedback',
      hook,
      lead,
      qrSvg,
      event: name,
      details,
      credit: credit ? escapeHtml(credit) : null
    })
    + `<p class="actions"><button type="button" id="print">Drucken</button></p>`
    + `<script nonce="${nonce}">document.getElementById('print').addEventListener('click',function(){window.print();});window.addEventListener('load',function(){window.print();});</script>`
    + '</body></html>';
}
