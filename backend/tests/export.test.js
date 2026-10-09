import { describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { columnName, toCsv, toXlsx } from '../src/utils/export.js';

// The workbook is a zip whose files are stored without compression, so each one can be read
// straight from its local header.
function zipEntries(buffer) {
  const entries = new Map();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    entries.set(buffer.toString('utf8', offset + 30, offset + 30 + nameLength), buffer.toString('utf8', start, start + size));
    offset = start + size;
  }
  return entries;
}

function cellTexts(workbook) {
  const sheet = zipEntries(workbook).get('xl/worksheets/sheet1.xml');
  return [...sheet.matchAll(/<t>([^<]*)<\/t>/g)].map((match) => match[1]);
}

function cellReferences(workbook) {
  const sheet = zipEntries(workbook).get('xl/worksheets/sheet1.xml');
  return [...sheet.matchAll(/<c r="([A-Z]+[0-9]+)"/g)].map((match) => match[1]);
}

// The data rows of a csv export, one string per row.
function csvRows(csv) {
  return csv.split('\n').slice(1);
}

const outsideXml = /[^\t\n\r\u{20}-\u{D7FF}\u{E000}-\u{FFFD}\u{10000}-\u{10FFFF}]/u;

describe('the xlsx export', () => {
  it('writes the five XML special characters of a cell as entities', () => {
    const workbook = toXlsx([{ general_comment: `<b>"Tom" & 'Jerry'</b>` }]);

    expect(cellTexts(workbook)).toEqual([
      'general_comment',
      '&lt;b&gt;&quot;Tom&quot; &amp; &apos;Jerry&apos;&lt;/b&gt;'
    ]);
  });

  it('keeps only characters that XML 1.0 allows in a cell', () => {
    const comment = 'a\tb\nc\rd\u{0}\u{1}e\u{7}f\u{b}g\u{c}h\u{1f}i\u{fffe}j\u{ffff}k\u{d800}l \u{e4} \u{1f600}';

    const workbook = toXlsx([{ general_comment: comment }]);
    const sheet = zipEntries(workbook).get('xl/worksheets/sheet1.xml');

    expect(cellTexts(workbook)[1]).toBe('a\tb\nc\rdefghijkl \u{e4} \u{1f600}');
    expect(sheet).not.toMatch(outsideXml);
  });

  it('writes dates, numbers and empty values as text', () => {
    const workbook = toXlsx([{ submitted_at: new Date('2026-09-19T20:15:00.000Z'), rating: 4, general_comment: null }]);

    expect(cellTexts(workbook)).toEqual(['submitted_at', 'rating', 'general_comment', '2026-09-19T20:15:00.000Z', '4', '']);
  });

  it('writes a cell that starts like a formula as a text cell with its content', () => {
    const workbook = toXlsx([{ general_comment: '=VERKETTEN("Bar";" 2")' }]);
    const sheet = zipEntries(workbook).get('xl/worksheets/sheet1.xml');

    expect(cellTexts(workbook)[1]).toBe('=VERKETTEN(&quot;Bar&quot;;&quot; 2&quot;)');
    expect(sheet).toContain('<c r="A2" t="inlineStr">');
    expect(sheet).not.toContain('<f>');
  });
});

describe('the columns of the xlsx export', () => {
  it('counts the columns A to Z, then AA to ZZ, then AAA onwards', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702, 16383].map(columnName))
      .toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA', 'XFD']);
  });

  it('names each cell of a sheet with 30 columns once', () => {
    const row = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`frage_${index + 1}`, index + 1]));

    const references = cellReferences(toXlsx([row]));

    expect(references).toHaveLength(60);
    expect(new Set(references).size).toBe(60);
    expect(references.slice(24, 31)).toEqual(['Y1', 'Z1', 'AA1', 'AB1', 'AC1', 'AD1', 'A2']);
    expect(references.at(-1)).toBe('AD2');
  });
});

describe('the csv export', () => {
  it('quotes every cell and doubles the quotes inside, the header row included', () => {
    expect(toCsv([{ general_comment: 'Sie sagte "toll", dann ging sie', rating: 5 }]))
      .toBe('\u{feff}"general_comment","rating"\n"Sie sagte ""toll"", dann ging sie","5"');
  });

  it('puts an apostrophe in front of a cell that starts with =, +, -, @, a tab or a carriage return', () => {
    const comments = ['=1+1', '+49 30 1234', '-2+3', '@SUMME(A1)', '\t=1+1', '\r=1+1', '=VERKETTEN("Bar";" 2")'];

    const csv = toCsv(comments.map((comment) => ({ general_comment: comment })));

    expect(csvRows(csv)).toEqual([
      `"'=1+1"`,
      `"'+49 30 1234"`,
      `"'-2+3"`,
      `"'@SUMME(A1)"`,
      `"'\t=1+1"`,
      `"'\r=1+1"`,
      `"'=VERKETTEN(""Bar"";"" 2"")"`
    ]);
  });

  it('writes every other cell as it came', () => {
    const csv = toCsv([{
      submitted_at: new Date('2026-09-19T20:15:00.000Z'),
      rating: 5,
      general_comment: 'Gute Musik, mehr davon',
      comment_positive: "'zitiert",
      comment_improvement: 'Bar 2 = zu voll',
      newsletter_optin: false,
      nps_score: null
    }]);

    expect(csvRows(csv)).toEqual([`"2026-09-19T20:15:00.000Z","5","Gute Musik, mehr davon","'zitiert","Bar 2 = zu voll","false",""`]);
  });

  it('puts the apostrophe in front of a header cell as well', () => {
    expect(toCsv([{ '=frage': 'Antwort', rating: 4 }])).toBe(`\u{feff}"'=frage","rating"\n"Antwort","4"`);
  });

  it('reads the start characters from CSV_FORMULA_START_CHARACTERS', () => {
    expect(env.csvFormulaStartCharacters).toEqual(['=', '+', '-', '@', '\t', '\r']);
  });

  it('works with other start characters than the default', () => {
    const rows = [{ general_comment: '|Teil 2' }, { general_comment: '%1' }, { general_comment: '=1+1' }, { general_comment: '-2' }];

    const csv = toCsv(rows, { formulaStartCharacters: ['|', '%'] });

    expect(csvRows(csv)).toEqual([`"'|Teil 2"`, `"'%1"`, '"=1+1"', '"-2"']);
  });
});
