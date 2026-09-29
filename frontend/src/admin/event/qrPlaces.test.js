import { describe, expect, it } from 'vitest';
import { placeAddress, placeDeleteNotice, placeLabelProblem } from './qrPlaces.js';
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

  it('says what stays and where printed codes lead', () => {
    const notice = placeDeleteNotice(source, 'https://qrat.ing/f/beispiel/bar');

    expect(notice).toMatch(/„Bar“ löschen\?/);
    expect(notice).toMatch(/behalten den Namen „Bar“/);
    expect(notice).toMatch(/https:\/\/qrat\.ing\/f\/beispiel\/bar führen weiter zur Gästeseite/);
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
