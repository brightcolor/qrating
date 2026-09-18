// The event report as a PDF, written by hand: a coloured header, key figures,
// a rating chart, the course of the evening, own questions and sample comments.
import { DateTime } from 'luxon';
import { safeAccent } from './printSheet.js';
import { plainText } from './localized.js';

// Helvetica with WinAnsiEncoding covers umlauts, ß, € and typographic quotes.
const winAnsiExtras = new Map([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87], ['ˆ', 0x88],
  ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91], ['’', 0x92], ['“', 0x93],
  ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97], ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b],
  ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f]
]);

function winAnsiCodes(char) {
  const code = char.codePointAt(0);
  if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) return [code];
  if (winAnsiExtras.has(char)) return [winAnsiExtras.get(char)];
  if (/\s/.test(char)) return [0x20];
  // Characters outside the encoding fall back to their decomposed form, e.g. "č" becomes "c" and "ﬁ" becomes "fi".
  const decomposed = char.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  if (!decomposed) return [];
  if (decomposed !== char) return [...decomposed].flatMap(winAnsiCodes);
  return [0x3f];
}

function escapePdfText(value) {
  let text = '';
  for (const char of String(value ?? '').normalize('NFC')) {
    for (const code of winAnsiCodes(char)) {
      if (code === 0x28 || code === 0x29 || code === 0x5c) text += `\\${String.fromCharCode(code)}`;
      else if (code < 0x80) text += String.fromCharCode(code);
      else text += `\\${code.toString(8).padStart(3, '0')}`;
    }
  }
  return text;
}

// Character widths of the two standard fonts, in 1/1000 of the font size.
const helveticaWidths = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584,
  ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722,
  O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556,
  o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '{': 334, '|': 260, '}': 334, '~': 584
};

const helveticaBoldWidths = {
  ...helveticaWidths,
  '!': 333, '"': 474, "'": 238, '(': 333, ')': 333, ',': 278, '.': 278, ':': 333, ';': 333, '?': 611, '&': 722,
  A: 722, B: 722, D: 722, E: 667, J: 556, K: 722, L: 611, N: 722, T: 611, Z: 611,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611,
  o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500
};

// Umlauts and other accented letters are as wide as the letter they are built on.
function widthOf(char, bold) {
  const table = bold ? helveticaBoldWidths : helveticaWidths;
  if (table[char] !== undefined) return table[char];
  const plain = char.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  if (plain && plain !== char && table[plain[0]] !== undefined) return table[plain[0]];
  if (char === 'ß') return bold ? 611 : 500;
  if (char === '€' || char === '–') return 556;
  return bold ? 611 : 556;
}

export function textWidth(value, size, bold = false) {
  let width = 0;
  for (const char of String(value ?? '')) width += widthOf(char, bold);
  return (width / 1000) * size;
}

export function wrapText(value, size, maxWidth, bold = false) {
  const words = String(value ?? '').replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!word) continue;
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, size, bold) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

const pageWidth = 595;
const pageHeight = 842;
const margin = 46;
const contentWidth = pageWidth - 2 * margin;
const ink = [0.09, 0.09, 0.11];
const muted = [0.42, 0.44, 0.47];
const hairline = [0.85, 0.86, 0.88];
const surface = [0.965, 0.968, 0.973];

function hexToRgb(hex) {
  const value = String(hex).replace('#', '');
  const full = value.length === 3 ? [...value].map((char) => char + char).join('') : value;
  return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16) / 255);
}

class ReportDocument {
  constructor(accent) {
    this.accent = accent;
    this.pages = [];
    this.startPage();
  }

  startPage() {
    this.operations = [];
    this.pages.push(this.operations);
    this.y = pageHeight - margin;
  }

  // Keeps a block together: it starts on a new page when the rest of this one is too short.
  space(height) {
    if (this.y - height < margin + 34) this.startPage();
  }

  color(value) {
    return value.map((part) => part.toFixed(3)).join(' ');
  }

  rect(x, y, width, height, fill) {
    this.operations.push(`${this.color(fill)} rg`, `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
  }

  line(x1, y1, x2, y2, stroke = hairline, width = 0.6) {
    this.operations.push(
      `${this.color(stroke)} RG`,
      `${width} w`,
      `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`
    );
  }

  text(value, x, y, { size = 10, bold = false, fill = ink, align = 'left', width = contentWidth } = {}) {
    let start = x;
    if (align === 'right') start = x + width - textWidth(value, size, bold);
    if (align === 'center') start = x + (width - textWidth(value, size, bold)) / 2;
    this.operations.push(
      'BT',
      `${this.color(fill)} rg`,
      `/${bold ? 'F2' : 'F1'} ${size} Tf`,
      `1 0 0 1 ${start.toFixed(2)} ${y.toFixed(2)} Tm`,
      `(${escapePdfText(value)}) Tj`,
      'ET'
    );
  }

  paragraph(value, { size = 10, bold = false, fill = ink, leading = 1.45, x = margin, width = contentWidth } = {}) {
    for (const line of wrapText(value, size, width, bold)) {
      this.space(size * leading);
      this.y -= size * leading;
      this.text(line, x, this.y, { size, bold, fill, width });
    }
  }

  heading(value) {
    this.space(46);
    this.y -= 30;
    this.text(value, margin, this.y, { size: 13, bold: true });
    this.y -= 8;
    this.line(margin, this.y, margin + contentWidth, this.y);
    this.y -= 6;
  }
}

function formatDateTime(value, zone, format) {
  if (!value) return '';
  const parsed = DateTime.fromJSDate(value instanceof Date ? value : new Date(value), { zone: 'utc' }).setZone(zone).setLocale('de');
  return parsed.isValid ? parsed.toFormat(format) : '';
}

function eventPeriod(event, zone) {
  const start = formatDateTime(event?.date_from, zone, "cccc, d. LLLL yyyy 'um' HH:mm 'Uhr'");
  return start || 'Ohne Datum';
}

function header(doc, event, organization, zone) {
  const height = 108;
  const top = pageHeight - height;
  doc.rect(0, top, pageWidth, height, hexToRgb(doc.accent));
  const light = [1, 1, 1];
  doc.text('FEEDBACK-BERICHT', margin, top + height - 34, { size: 8, bold: true, fill: light });
  const title = wrapText(event?.name || 'Event', 21, contentWidth, true)[0];
  doc.text(title, margin, top + height - 62, { size: 21, bold: true, fill: light });
  const place = plainText(event?.location);
  doc.text([eventPeriod(event, zone), place].filter(Boolean).join('  •  '), margin, top + height - 82, { size: 9.5, fill: light });
  if (organization?.name) {
    doc.text(organization.name, margin, top + height - 82, { size: 9.5, fill: light, align: 'right', width: contentWidth });
  }
  doc.y = top - 26;
}

function figures(doc, summary) {
  const cards = [
    ['Feedbacks', String(summary?.total ?? 0)],
    ['Schnitt', summary?.average_rating ? String(summary.average_rating).replace('.', ',') : '–'],
    ['Niedrige Bewertungen', String(summary?.low_ratings ?? 0)],
    ['NPS', summary?.average_nps ? String(summary.average_nps).replace('.', ',') : '–'],
    ['Newsletter', String(summary?.newsletter_optins ?? 0)]
  ];
  const gap = 8;
  const width = (contentWidth - gap * (cards.length - 1)) / cards.length;
  const height = 58;
  doc.space(height + 10);
  const top = doc.y - height;
  cards.forEach(([label, value], index) => {
    const x = margin + index * (width + gap);
    doc.rect(x, top, width, height, surface);
    doc.text(value, x + 10, top + height - 28, { size: 20, bold: true, width: width - 20 });
    for (const [line, offset] of wrapText(label, 7.5, width - 20).map((line, position) => [line, position])) {
      doc.text(line, x + 10, top + 16 - offset * 10, { size: 7.5, fill: muted, width: width - 20 });
    }
  });
  doc.y = top - 4;
}

function ratingChart(doc, distribution, total) {
  doc.heading('Bewertungen');
  const byRating = new Map((distribution || []).map((row) => [Number(row.rating), Number(row.count)]));
  const max = Math.max(1, ...byRating.values());
  const labelWidth = 60;
  const valueWidth = 66;
  const barWidth = contentWidth - labelWidth - valueWidth;
  for (const rating of [5, 4, 3, 2, 1]) {
    const count = byRating.get(rating) || 0;
    doc.space(22);
    doc.y -= 20;
    doc.text(`${rating} Sterne`, margin, doc.y + 4, { size: 9.5, fill: muted, width: labelWidth });
    doc.rect(margin + labelWidth, doc.y, barWidth, 12, surface);
    if (count) doc.rect(margin + labelWidth, doc.y, Math.max(2, (count / max) * barWidth), 12, hexToRgb(doc.accent));
    const share = total ? ` (${Math.round((count / total) * 100)} %)` : '';
    doc.text(`${count}${share}`, margin + labelWidth + barWidth + 8, doc.y + 4, { size: 9.5, width: valueWidth - 8 });
  }
  doc.y -= 6;
}

function timelineSection(doc, timeline, zone) {
  doc.heading('Verlauf');
  if (!timeline?.length) {
    doc.paragraph('Noch keine Bewertungen im Verlauf.', { size: 10, fill: muted });
    return;
  }
  const rows = timeline.slice(0, 20);
  const maxCount = Math.max(1, ...rows.map((row) => Number(row.count) || 0));
  for (const row of rows) {
    const count = Number(row.count) || 0;
    doc.space(18);
    doc.y -= 16;
    doc.text(formatDateTime(row.bucket, zone, 'dd.LL. HH:mm'), margin, doc.y, { size: 9.5, width: 90 });
    doc.rect(margin + 96, doc.y - 2, (count / maxCount) * (contentWidth - 250), 9, hexToRgb(doc.accent));
    doc.text(`${count} Feedbacks`, margin + contentWidth - 150, doc.y, { size: 9.5, fill: muted, width: 80 });
    doc.text(
      row.average_rating ? `Schnitt ${String(row.average_rating).replace('.', ',')}` : 'Schnitt –',
      margin + contentWidth - 66,
      doc.y,
      { size: 9.5, width: 66, align: 'right' }
    );
  }
  doc.y -= 6;
}

function compactAnswer(value) {
  if (value == null) return '–';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return Object.values(value).join(', ');
  return String(value);
}

function questionSection(doc, questionStats) {
  doc.heading('Eigene Fragen');
  if (!questionStats?.length) {
    doc.paragraph('Zu den eigenen Fragen gibt es noch keine Antworten.', { size: 10, fill: muted });
    return;
  }
  for (const row of questionStats.slice(0, 26)) {
    doc.space(18);
    doc.y -= 16;
    doc.text(wrapText(row.label || 'Frage', 9.5, 170, true)[0], margin, doc.y, { size: 9.5, bold: true, width: 170 });
    doc.text(wrapText(compactAnswer(row.answer_value), 9.5, contentWidth - 230)[0], margin + 176, doc.y, { size: 9.5, width: contentWidth - 230 });
    doc.text(`${row.count}×`, margin + contentWidth - 46, doc.y, { size: 9.5, fill: muted, width: 46, align: 'right' });
  }
  doc.y -= 6;
}

function commentSection(doc, comments) {
  doc.heading('Stimmen der Gäste');
  const rows = (comments || [])
    .map((row) => ({
      rating: row.rating,
      text: [row.comment_positive, row.comment_improvement, row.general_comment].filter(Boolean).join(' – ')
    }))
    .filter((row) => row.text)
    .slice(0, 12);
  if (!rows.length) {
    doc.paragraph('Noch keine Kommentare.', { size: 10, fill: muted });
    return;
  }
  for (const row of rows) {
    const lines = wrapText(row.text, 10, contentWidth - 34);
    const height = 20 + lines.length * 14;
    doc.space(height + 8);
    const top = doc.y - height;
    doc.rect(margin, top, 3, height, hexToRgb(doc.accent));
    doc.text(row.rating ? `${row.rating} von 5 Sternen` : 'Ohne Bewertung', margin + 14, top + height - 14, { size: 8, bold: true, fill: muted });
    lines.forEach((line, index) => {
      doc.text(line, margin + 14, top + height - 30 - index * 14, { size: 10 });
    });
    doc.y = top - 10;
  }
}

function footers(doc, event, createdAt, zone) {
  const total = doc.pages.length;
  doc.pages.forEach((operations, index) => {
    const saved = doc.operations;
    doc.operations = operations;
    doc.line(margin, margin + 22, margin + contentWidth, margin + 22);
    doc.text(`qrating • ${event?.name || 'Event'}`, margin, margin + 10, { size: 8, fill: muted, width: contentWidth - 120 });
    doc.text(
      `Erstellt am ${formatDateTime(createdAt, zone, "d. LLLL yyyy 'um' HH:mm 'Uhr'")}`,
      margin,
      margin + 10,
      { size: 8, fill: muted, width: contentWidth - 60, align: 'right' }
    );
    doc.text(`${index + 1}/${total}`, margin + contentWidth - 40, margin + 10, { size: 8, fill: muted, width: 40, align: 'right' });
    doc.operations = saved;
  });
}

function assemble(pages) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  ];
  const pageRefs = [];
  pages.forEach((operations) => {
    const pageObjNumber = objects.length + 1;
    const contentObjNumber = pageObjNumber + 1;
    pageRefs.push(`${pageObjNumber} 0 R`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] `
      + '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> '
      + `/Contents ${contentObjNumber} 0 R >>`
    );
    const stream = operations.join('\n');
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

export function buildEventReportPdf({ event, organization, summary, distribution, timeline, questionStats, comments, now = new Date() }) {
  const zone = event?.event_timezone || 'Europe/Berlin';
  const doc = new ReportDocument(safeAccent(organization?.primary_color));
  header(doc, event, organization, zone);
  figures(doc, summary);
  ratingChart(doc, distribution, Number(summary?.total) || 0);
  timelineSection(doc, timeline, zone);
  questionSection(doc, questionStats);
  commentSection(doc, comments);
  footers(doc, event, now, zone);
  return assemble(doc.pages);
}

// Short reports without an event, for example from scripts.
export function simplePdf(title, lines) {
  const doc = new ReportDocument(safeAccent(null));
  doc.y -= 10;
  doc.text(title, margin, doc.y, { size: 18, bold: true });
  doc.y -= 10;
  for (const line of lines || []) doc.paragraph(String(line), { size: 10 });
  footers(doc, { name: title }, new Date(), 'Europe/Berlin');
  return assemble(doc.pages);
}
