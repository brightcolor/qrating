import { describe, expect, it } from 'vitest';
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
  it('quotes every value and doubles the quotes inside', () => {
    expect(toCsv([{ general_comment: 'Sie sagte "toll", dann ging sie', rating: 5 }]))
      .toBe('\u{feff}general_comment,rating\n"Sie sagte ""toll"", dann ging sie","5"');
  });
});
