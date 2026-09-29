import { describe, expect, it } from 'vitest';
import { placeAddress, placeDeleteNotice, placeLabelProblem, placeSlugProblem } from './qrPlaces.js';
import { hasRole } from '../roles.js';

describe('the name of a QR place', () => {
  it('asks for a name when there is none', () => {
    expect(placeLabelProblem('   ', 60)).toMatch(/Namen/);
    expect(placeLabelProblem(null, 60)).toMatch(/Namen/);
  });

  it('holds the length the server allows', () => {
    expect(placeLabelProblem('Garderobe Nord', 10)).toMatch(/höchstens 10 Zeichen/);
    expect(placeLabelProblem('Garderobe Nord', 14)).toBe(null);
    expect(placeLabelProblem('  Bar  ', 3)).toBe(null);
  });
});

describe('deleting a QR place', () => {
  const source = { label: 'Bar', source_slug: 'bar' };

  it('names the address of the printed code', () => {
    expect(placeAddress('https://qrat.ing/f/beispiel', source)).toBe('https://qrat.ing/f/beispiel/bar');
    expect(placeAddress('', source)).toBe('…/bar');
  });

  it('hangs a place for a single event on the link of that event', () => {
    const single = { label: 'Bühne', source_slug: 'buehne', type: 'event_specific', event_id: 'abend' };
    const event = { id: 'abend', url: 'https://qrat.ing/e/token-des-abends' };

    expect(placeAddress('https://qrat.ing/f/beispiel', single, event)).toBe('https://qrat.ing/e/token-des-abends?source=buehne');
    expect(placeAddress('https://qrat.ing/f/beispiel', single, { id: 'anderer-abend', url: 'https://qrat.ing/e/anders' })).toBe(null);
    expect(placeAddress('https://qrat.ing/f/beispiel', single)).toBe(null);
  });

  it('speaks of the printed codes without an address where the page knows none', () => {
    expect(placeDeleteNotice(source, null)).toMatch(/Gedruckte Codes des Platzes führen weiter zur Gästeseite/);
  });

  it('says what stays, where printed codes lead and who takes them up', () => {
    const notice = placeDeleteNotice(source, 'https://qrat.ing/f/beispiel/bar');

    expect(notice).toMatch(/„Bar“ löschen\?/);
    expect(notice).toMatch(/behalten den Namen „Bar“/);
    expect(notice).toMatch(/https:\/\/qrat\.ing\/f\/beispiel\/bar führen weiter zur Gästeseite/);
    expect(notice).toMatch(/steht unter dem Kurznamen „bar“/);
    expect(notice).toMatch(/Ein neuer Platz mit dem Kurznamen „bar“ zählt diese Codes wieder für sich/);
  });
});

describe('the short name of a QR place', () => {
  it('asks for one', () => {
    expect(placeSlugProblem('', 40)).toMatch(/Kurznamen/);
    expect(placeSlugProblem('---', 40)).toMatch(/Kurznamen/);
  });

  it('takes what fits into an address, up to the length of the setting', () => {
    expect(placeSlugProblem('bar-nord', 40)).toBe(null);
    expect(placeSlugProblem('Bar Nord', 40)).toMatch(/Kleinbuchstaben/);
    expect(placeSlugProblem('eingang-nord', 5)).toMatch(/höchstens 5 Zeichen/);
  });

  it('keeps the names of the ways into the guest page free', () => {
    expect(placeSlugProblem('event', 40)).toMatch(/„event“ benennt schon einen Weg zur Gästeseite/);
    expect(placeSlugProblem('preview', 40)).toMatch(/Weg zur Gästeseite/);
  });
});

describe('the roles', () => {
  it('lets event managers and above manage what event managers may', () => {
    expect(hasRole('event_manager', 'event_manager')).toBe(true);
    expect(hasRole('owner', 'event_manager')).toBe(true);
    expect(hasRole('analyst', 'event_manager')).toBe(false);
    expect(hasRole(undefined, 'event_manager')).toBe(false);
  });
});
