// File names of downloads carry the event, its date and the moment of the download,
// so several exports of one event stay apart in the download folder.
import { DateTime } from 'luxon';

const germanLetters = new Map([['ä', 'ae'], ['ö', 'oe'], ['ü', 'ue'], ['Ä', 'Ae'], ['Ö', 'Oe'], ['Ü', 'Ue'], ['ß', 'ss']]);

// Event names come from admins and from the Pretix sync: only letters and digits survive,
// everything else becomes the separator that holds the name together.
function readablePart(value, max = 60) {
  const text = String(value ?? '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return text.slice(0, max).replace(/-+$/g, '');
}

export function asciiName(value) {
  return String(value ?? '')
    .replace(/[äöüÄÖÜß]/g, (char) => germanLetters.get(char))
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function zoneOf(event) {
  return event?.event_timezone || 'Europe/Berlin';
}

function stamp(value, zone, format) {
  if (!value) return '';
  const parsed = DateTime.fromJSDate(value instanceof Date ? value : new Date(value), { zone: 'utc' }).setZone(zone);
  return parsed.isValid ? parsed.toFormat(format) : '';
}

// "Wismar-tanzt_2026-09-19_Feedback_geladen-2026-09-18-1030.csv"
export function buildDownloadName({ event, kind, extension, now = new Date() }) {
  const zone = zoneOf(event);
  const parts = [
    readablePart(event?.name) || 'Event',
    stamp(event?.date_from, zone, 'yyyy-LL-dd'),
    readablePart(kind, 24),
    `geladen-${stamp(now, zone, 'yyyy-LL-dd-HHmm')}`
  ].filter(Boolean);
  const name = `${parts.join('_')}.${extension}`;
  return { name, ascii: asciiName(name) };
}

// Browsers read the plain name, and everyone who understands RFC 5987 gets the umlauts.
export function attachmentHeader(options) {
  const { name, ascii } = buildDownloadName(options);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
