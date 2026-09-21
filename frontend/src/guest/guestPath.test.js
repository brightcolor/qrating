import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { guestApiPath } from './guestPath.js';

// index.html carries a copy of guestApiPath in its inline script, because it has to run
// before any bundle. If the two ever disagree, the page asks for one address early and
// another one late: two requests, two counted scans for one guest.
function inlineCopy() {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('// qrating:guest-path:start');
  const end = html.indexOf('// qrating:guest-path:end');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const source = html.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function(`${source}; return guestApiPath;`)();
}

const addresses = [
  ['/e/abc123', ''],
  ['/e/abc123', '?source=bar'],
  ['/e/abc123', '?lang=en'],
  ['/e/abc123', '?preview=1700000000.xyz&lang=de'],
  ['/f/hsp-events', ''],
  ['/f/hsp-events', '?source=bar'],
  ['/f/hsp-events/ausgang', ''],
  ['/f/hsp-events/ausgang', '?source=bar'],
  ['/f/hsp-events/', '?lang=en&preview=abc'],
  ['/datenschutz/hsp-events', ''],
  ['/', '']
];

describe('the address the guest page asks the server for', () => {
  it('is built the same way in index.html and in the bundle', () => {
    const copy = inlineCopy();
    for (const [pathname, search] of addresses) {
      expect(copy(pathname, search)).toBe(guestApiPath(pathname, search));
    }
  });

  it('moves a source of the tenant code into the path, and leaves it out for an event code', () => {
    expect(guestApiPath('/f/hsp-events', '?source=bar')).toBe('/public/f/hsp-events/bar');
    expect(guestApiPath('/e/abc123', '?source=bar')).toBe('/public/e/abc123');
  });

  it('keeps the language and the preview, and nothing else', () => {
    expect(guestApiPath('/e/abc123', '?utm_source=insta&lang=en&preview=p1')).toBe('/public/e/abc123?lang=en&preview=p1');
  });

  it('asks for nothing on pages that are not a guest page', () => {
    expect(guestApiPath('/datenschutz/hsp-events', '')).toBe(null);
    expect(guestApiPath('/admin/fragen', '')).toBe(null);
  });
});
