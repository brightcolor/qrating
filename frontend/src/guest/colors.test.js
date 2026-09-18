import { describe, expect, it } from 'vitest';
import { contrast, guestPalette, lightStageHex, parseHex, stageFor, stageHex } from './colors.js';

const brandColors = ['#2563eb', '#1e3a8a', '#facc15', '#ef4444', '#10b981', '#000000', '#ffffff', '#808080'];

describe('guest palette', () => {
  it('reads the brand color in every notation', () => {
    expect(parseHex('#2563eb')).toEqual([37, 99, 235]);
    expect(parseHex('2563eb')).toEqual([37, 99, 235]);
    expect(parseHex('#abc')).toEqual([170, 187, 204]);
    expect(parseHex('rebeccapurple')).toBeNull();
  });

  it('falls back to the qrating blue for missing colors', () => {
    expect(guestPalette(null)).toEqual(guestPalette('#2563eb'));
    expect(guestPalette('not a color').fill).toBe('#2563eb');
  });

  it('keeps every brand color readable on the stage and on the ticket', () => {
    for (const brand of brandColors) {
      const palette = guestPalette(brand);
      expect(contrast(parseHex(palette.fill), parseHex(stageHex)), `${brand}: buttons on the stage`).toBeGreaterThanOrEqual(3);
      expect(contrast(parseHex(palette.accent), parseHex(stageHex)), `${brand}: text on the stage`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(parseHex(palette.fillInk), parseHex(palette.fill)), `${brand}: label on a button`).toBeGreaterThanOrEqual(4.4);
      expect(contrast(parseHex(palette.stamp), parseHex(palette.paper)), `${brand}: stamp on the ticket`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('leaves bright brand colors as they are', () => {
    expect(guestPalette('#2563eb').fill).toBe('#2563eb');
    expect(guestPalette('#facc15').fillInk).not.toBe('#ffffff');
  });

  it('brightens dark brand colors for the dark stage', () => {
    const palette = guestPalette('#1e3a8a');
    expect(palette.fill).not.toBe('#1e3a8a');
    expect(palette.paper).not.toBe('#1e3a8a');
  });

  it('keeps every brand color readable on the light stage as well', () => {
    for (const brand of brandColors) {
      const palette = guestPalette(brand, 'light');
      expect(contrast(parseHex(palette.fill), parseHex(lightStageHex)), `${brand}: buttons by day`).toBeGreaterThanOrEqual(3);
      expect(contrast(parseHex(palette.accent), parseHex(lightStageHex)), `${brand}: text by day`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(parseHex(palette.fillInk), parseHex(palette.fill)), `${brand}: label on a button`).toBeGreaterThanOrEqual(4.4);
    }
  });

  it('darkens pale brand colors for the light stage', () => {
    expect(guestPalette('#facc15', 'light').accent).not.toBe(guestPalette('#facc15', 'dark').accent);
    expect(guestPalette('#ffffff', 'light').fill).not.toBe('#ffffff');
  });

  it('names the stage of each theme', () => {
    expect(stageFor('light')).toBe(lightStageHex);
    expect(stageFor('dark')).toBe(stageHex);
    expect(stageFor(undefined)).toBe(stageHex);
  });
});
