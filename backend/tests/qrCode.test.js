import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { markLayer, renderQrSvg } from '../src/utils/qrCode.js';

const url = 'https://qrat.ing/e/8kZq2R7tLpWv3nXa';
const scale = 8;
const margin = 1;
const markShare = 0.22;

// Draws the code the way the SVG does: modules, one module of quiet zone, and the
// white plate of the mark in the middle. A scanner sees exactly this.
function pixels(matrix, { withMark }) {
  const size = matrix.size + margin * 2;
  const width = size * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  const paint = (x, y) => {
    const index = (y * width + x) * 4;
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
  };
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (!matrix.data[row * matrix.size + column]) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          paint((column + margin) * scale + x, (row + margin) * scale + y);
        }
      }
    }
  }
  if (withMark) {
    const plate = Math.round(size * markShare * scale);
    const start = Math.round((width - plate) / 2);
    for (let y = start; y < start + plate; y += 1) {
      for (let x = start; x < start + plate; x += 1) {
        const index = (y * width + x) * 4;
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
      }
    }
  }
  return { data, width };
}

describe('QR code with the qrating mark', () => {
  it('stays readable although the mark covers the middle', () => {
    const matrix = QRCode.create(url, { errorCorrectionLevel: 'H' }).modules;
    const image = pixels(matrix, { withMark: true });

    const read = jsQR(image.data, image.width, image.width);

    expect(read?.data).toBe(url);
  });

  it('reads the same address without the mark', () => {
    const matrix = QRCode.create(url, { errorCorrectionLevel: 'H' }).modules;
    const image = pixels(matrix, { withMark: false });

    expect(jsQR(image.data, image.width, image.width)?.data).toBe(url);
  });

  it('also survives a long address of a dynamic code', () => {
    const long = 'https://qrat.ing/f/eine-ziemlich-lange-organisation-mit-namen/baendchen-am-eingang';
    const matrix = QRCode.create(long, { errorCorrectionLevel: 'H' }).modules;
    const image = pixels(matrix, { withMark: true });

    expect(jsQR(image.data, image.width, image.width)?.data).toBe(long);
  });

  it('puts the mark into the middle of the picture', async () => {
    const svg = await renderQrSvg(url);

    expect(svg).toContain('#FFC933');
    expect(svg).toContain('#25123A');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    // The plate sits in the middle and covers about a fifth of the width.
    const size = Number(/viewBox="0 0 ([\d.]+)/.exec(svg)[1]);
    const rect = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"/.exec(svg);
    expect(Number(rect[3])).toBeCloseTo(size * markShare, 3);
    expect(Number(rect[1])).toBeCloseTo((size - size * markShare) / 2, 3);
    expect(Number(rect[1])).toBe(Number(rect[2]));
  });

  it('leaves the code plain when the mark is switched off', async () => {
    const svg = await renderQrSvg(url, { withMark: false });

    expect(svg).not.toContain('#FFC933');
    expect(svg).not.toContain('<rect');
    expect(markLayer(10)).toContain('#FFC933');
  });
});
