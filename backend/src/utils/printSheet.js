// The sheet that stands at the event: guests see the code, the event name and the date,
// so there is nothing left to type.
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

export function renderQrPrintSheet({ event, organizationName, accentColor, qrSvg, nonce }) {
  const accent = safeAccent(accentColor);
  const name = escapeHtml(event?.name ?? 'Event');
  const period = formatEventPeriod(event);
  const place = plainText(event?.location);
  const details = [period, place].filter(Boolean).map((part) => escapeHtml(part)).join(' · ');
  const host = String(organizationName ?? '').trim();

  const styles = `
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
.hook { margin: 6mm 0 0; font-family: Georgia, "Times New Roman", serif; font-size: 46pt; line-height: 1.04; letter-spacing: -.015em; font-weight: 400; }
.lead { margin: 5mm 0 0; max-width: 118mm; font-size: 12.5pt; line-height: 1.5; color: var(--muted); }
.code { margin: 9mm 0 0; padding: 5mm; border: 1px solid var(--line); border-radius: 3mm; }
.code svg { display: block; width: 78mm; height: 78mm; }
.steps { margin: 7mm 0 0; padding: 0; list-style: none; display: flex; gap: 7mm; font-size: 10pt; letter-spacing: .2em; text-transform: uppercase; }
.steps li { position: relative; }
.steps li + li::before { content: ""; position: absolute; left: -4.2mm; top: 50%; width: 1.4mm; height: 1.4mm; margin-top: -.7mm; border-radius: 50%; background: var(--accent); }
.what { position: relative; width: 100%; border-top: 1px solid var(--line); padding-top: 9mm; }
.rule { position: absolute; top: -.6mm; left: 50%; width: 16mm; height: 1.2mm; margin-left: -8mm; border-radius: 1mm; background: var(--accent); }
.event { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 23pt; line-height: 1.2; }
.when { margin: 3mm 0 0; font-size: 11.5pt; color: var(--muted); }
.actions { margin: 0; }
.actions button { font: inherit; font-size: 15px; padding: 11px 24px; border: 0; border-radius: 9px; background: var(--ink); color: #fff; cursor: pointer; }
.actions button:hover { background: #2a2d35; }
@media print {
  body { background: #fff; padding: 0; display: block; }
  .sheet { width: auto; min-height: 265mm; box-shadow: none; border-radius: 0; padding: 0; }
  .actions { display: none; }
}`;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>QR-Aushang: ${name}</title><style>${styles}</style></head><body>`
    + `<article class="sheet">`
    + `<p class="host">${host ? escapeHtml(host) : 'Feedback'}</p>`
    + `<div class="middle">`
    + `<div class="stars">${star.repeat(5)}</div>`
    + `<h1 class="hook">Wie war&rsquo;s?</h1>`
    + `<p class="lead">Scanne den Code mit der Kamera und sag uns, was gut war und was besser sein darf.</p>`
    + `<figure class="code">${qrSvg}</figure>`
    + `<ol class="steps"><li>Scannen</li><li>Bewerten</li><li>Fertig</li></ol>`
    + `</div>`
    + `<footer class="what"><span class="rule"></span><p class="event">${name}</p>${details ? `<p class="when">${details}</p>` : ''}</footer>`
    + `</article>`
    + `<p class="actions"><button type="button" id="print">Drucken</button></p>`
    + `<script nonce="${nonce}">document.getElementById('print').addEventListener('click',function(){window.print();});window.addEventListener('load',function(){window.print();});</script>`
    + `</body></html>`;
}
