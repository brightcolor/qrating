import { describe, expect, it } from 'vitest';
import { brightColorUrl, creditParts, qratingUrl } from './credit.jsx';

describe('the credit line under a public page', () => {
  it('finds both names in the line the backend sends', () => {
    expect(creditParts('qrating — ein Projekt von bright color')).toEqual({
      before: '',
      middle: ' — ein Projekt von ',
      after: ''
    });
  });

  it('keeps whatever stands around the two names', () => {
    expect(creditParts('Diese Seite läuft mit qrating, einem Projekt von bright color.')).toEqual({
      before: 'Diese Seite läuft mit ',
      middle: ', einem Projekt von ',
      after: '.'
    });
  });

  it('leaves a line without both names as plain text', () => {
    expect(creditParts('Ein Projekt von bright color')).toBeNull();
    expect(creditParts('qrating')).toBeNull();
    expect(creditParts(null)).toBeNull();
  });

  it('points at the two public addresses', () => {
    expect(qratingUrl).toBe('https://qrating.de');
    expect(brightColorUrl).toBe('https://bright-color.de');
  });
});
