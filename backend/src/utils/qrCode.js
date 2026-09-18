// QR codes of this installation, with the qrating mark in the middle.
// The mark covers a small part of the code; the higher error correction carries that.
import QRCode from 'qrcode';

// The star of the favicon, drawn in a 40 by 40 field.
const starPath = 'M20 8.5l3.4 6.9 7.6 1.1-5.5 5.4 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6-5.5-5.4 7.6-1.1z';
const sun = '#FFC933';
const ink = '#25123A';

// Share of the width the mark takes. Level H recovers three times as much.
const markShare = 0.22;

export const productCredit = 'qrating — ein Projekt von bright color';

function fieldSize(svg) {
  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return viewBox ? Number(viewBox[1]) : 0;
}

// The mark sits on a white plate, so the modules underneath never touch it.
export function markLayer(size) {
  const plate = size * markShare;
  const mark = plate * 0.82;
  const scale = mark / 40;
  const offset = (size - plate) / 2;
  const markOffset = (size - mark) / 2;
  return `<g>`
    + `<rect x="${offset.toFixed(3)}" y="${offset.toFixed(3)}" width="${plate.toFixed(3)}" height="${plate.toFixed(3)}"`
    + ` rx="${(plate * 0.18).toFixed(3)}" fill="#ffffff"/>`
    + `<g transform="translate(${markOffset.toFixed(3)} ${markOffset.toFixed(3)}) scale(${scale.toFixed(5)})">`
    + `<circle cx="20" cy="20" r="20" fill="${sun}"/>`
    + `<path d="${starPath}" fill="${ink}"/>`
    + '</g></g>';
}

export async function renderQrSvg(url, { withMark = true } = {}) {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: withMark ? 'H' : 'M'
  });
  if (!withMark) return svg;
  const size = fieldSize(svg);
  if (!size) return svg;
  return svg.replace('</svg>', `${markLayer(size)}</svg>`);
}
