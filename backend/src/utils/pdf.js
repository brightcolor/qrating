// Helvetica with WinAnsiEncoding covers umlauts, \u00df, \u20ac and typographic quotes.
const winAnsiExtras = new Map([
  ['\u20ac', 0x80], ['\u201a', 0x82], ['\u0192', 0x83], ['\u201e', 0x84], ['\u2026', 0x85], ['\u2020', 0x86], ['\u2021', 0x87], ['\u02c6', 0x88],
  ['\u2030', 0x89], ['\u0160', 0x8a], ['\u2039', 0x8b], ['\u0152', 0x8c], ['\u017d', 0x8e], ['\u2018', 0x91], ['\u2019', 0x92], ['\u201c', 0x93],
  ['\u201d', 0x94], ['\u2022', 0x95], ['\u2013', 0x96], ['\u2014', 0x97], ['\u02dc', 0x98], ['\u2122', 0x99], ['\u0161', 0x9a], ['\u203a', 0x9b],
  ['\u0153', 0x9c], ['\u017e', 0x9e], ['\u0178', 0x9f]
]);

function winAnsiCodes(char) {
  const code = char.codePointAt(0);
  if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) return [code];
  if (winAnsiExtras.has(char)) return [winAnsiExtras.get(char)];
  if (/\s/.test(char)) return [0x20];
  // Characters outside the encoding fall back to their decomposed form, e.g. "\u010d" becomes "c" and "\ufb01" becomes "fi".
  const decomposed = char.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
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

function wrapLine(line, max = 92) {
  const words = String(line ?? '').split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!word) continue;
    if (`${current} ${word}`.trim().length > max) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function paginate(title, sections) {
  const pages = [];
  let current = [];
  const maxLines = 31;
  const pushLine = (line = '', style = 'body') => {
    if (current.length >= maxLines) {
      pages.push(current);
      current = [];
    }
    current.push({ text: line, style });
  };
  pushLine(title, 'title');
  pushLine(`Erstellt: ${new Date().toISOString()}`, 'muted');
  pushLine('');
  for (const section of sections) {
    if (current.length > maxLines - 5) {
      pages.push(current);
      current = [];
    }
    pushLine(section.title, 'heading');
    for (const line of section.lines) {
      for (const wrapped of wrapLine(line)) pushLine(wrapped);
    }
    pushLine('');
  }
  if (current.length) pages.push(current);
  return pages;
}

function pageStream(lines, pageNumber, totalPages) {
  const commands = ['BT'];
  lines.forEach((line, index) => {
    const y = 780 - index * 22;
    const fontSize = line.style === 'title' ? 20 : line.style === 'heading' ? 14 : 10;
    commands.push(`/F1 ${fontSize} Tf`);
    commands.push(`1 0 0 1 72 ${y} Tm`);
    commands.push(`(${escapePdfText(line.text)}) Tj`);
  });
  commands.push('/F1 9 Tf');
  commands.push('1 0 0 1 72 38 Tm');
  commands.push(`(qrating Report - Seite ${pageNumber} von ${totalPages}) Tj`);
  commands.push('ET');
  return commands.join('\n');
}

function createPdfDocument(title, sections) {
  const pages = paginate(title, sections);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  ];
  const pageRefs = [];
  pages.forEach((lines, index) => {
    const pageObjNumber = objects.length + 1;
    const contentObjNumber = pageObjNumber + 1;
    pageRefs.push(`${pageObjNumber} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjNumber} 0 R >>`);
    const stream = pageStream(lines, index + 1, pages.length);
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
  return Buffer.from(pdf);
}

function ratingDistributionLines(distribution = []) {
  const byRating = new Map(distribution.map((row) => [Number(row.rating), Number(row.count)]));
  const max = Math.max(1, ...[...byRating.values()]);
  return [1, 2, 3, 4, 5].map((rating) => {
    const count = byRating.get(rating) || 0;
    const bar = '#'.repeat(Math.round((count / max) * 24));
    return `${rating} Sterne: ${String(count).padStart(3, ' ')} ${bar}`;
  });
}

function compactAnswer(value) {
  if (value == null) return '-';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function buildEventReportPdf({ event, summary, distribution, timeline, questionStats, comments }) {
  const sections = [
    {
      title: 'Zusammenfassung',
      lines: [
        `Event: ${event.name}`,
        `Datum: ${event.date_from ? new Date(event.date_from).toLocaleString('de-DE') : '-'}`,
        `Location: ${event.location || '-'}`,
        `Feedbacks gesamt: ${summary.total || 0}`,
        `Durchschnittliche Bewertung: ${summary.average_rating || '-'}`,
        `Niedrige Bewertungen (<= 2): ${summary.low_ratings || 0}`,
        `Newsletter Opt-ins: ${summary.newsletter_optins || 0}`,
        `NPS Durchschnitt: ${summary.average_nps || '-'}`
      ]
    },
    {
      title: 'Bewertungsverteilung',
      lines: ratingDistributionLines(distribution)
    },
    {
      title: 'Verlauf',
      lines: timeline.length
        ? timeline.slice(0, 18).map((row) => `${new Date(row.bucket).toLocaleString('de-DE')}: ${row.count} Feedbacks, Ø ${row.average_rating || '-'}`)
        : ['Noch keine Verlaufdaten.']
    },
    {
      title: 'Eigene Fragen',
      lines: questionStats.length
        ? questionStats.slice(0, 24).map((row) => `${row.label}: ${compactAnswer(row.answer_value)} (${row.count})`)
        : ['Noch keine Antworten auf eigene Fragen.']
    },
    {
      title: 'Beispielkommentare',
      lines: comments.length
        ? comments.slice(0, 12).map((row) => `${row.rating || '-'} Sterne: ${row.comment_positive || row.comment_improvement || row.general_comment || 'Kein Text'}`)
        : ['Noch keine Kommentare.']
    }
  ];
  return createPdfDocument(`qrating Report: ${event.name}`, sections);
}

export function simplePdf(title, lines) {
  return createPdfDocument(title, [{ title: 'Report', lines }]);
}
