// The organizer picks one brand color; the guest page derives readable variants for its dark stage and the paper ticket.
export const stageHex = '#140f1c';

const fallbackBrand = '#2563eb';
const white = [255, 255, 255];
const ink = [26, 20, 34];
const paperBase = [255, 252, 247];

export function parseHex(value) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value ?? '').trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? match[1].split('').map((char) => char + char).join('') : match[1];
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

export function toHex(rgb) {
  return `#${rgb.map((value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')).join('')}`;
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function luminance(rgb) {
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(first, second) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

function mix(color, target, amount) {
  return color.map((value, index) => value + (target[index] - value) * amount);
}

// Moves the color toward the target in small steps until it reaches the wanted contrast.
function withContrast(color, background, target, ratio) {
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mix(color, target, step / 20).map(Math.round);
    if (contrast(candidate, background) >= ratio) return candidate;
  }
  return target;
}

function rgba(rgb, alpha) {
  return `rgba(${rgb.map(Math.round).join(', ')}, ${alpha})`;
}

export function guestPalette(brandColor) {
  const brand = parseHex(brandColor) || parseHex(fallbackBrand);
  const stage = parseHex(stageHex);
  // Buttons, chips and stars: visible against the stage.
  const fill = withContrast(brand, stage, white, 3);
  // Text and focus rings on the stage.
  const accent = withContrast(brand, stage, white, 4.5);
  const paper = mix(paperBase, brand, 0.07).map(Math.round);
  const stamp = withContrast(brand, paper, ink, 4.5);
  return {
    fill: toHex(fill),
    fillInk: contrast(fill, white) >= 4.5 ? '#ffffff' : toHex(ink),
    accent: toHex(accent),
    glow: rgba(fill, 0.45),
    soft: rgba(fill, 0.18),
    preview: rgba(fill, 0.55),
    paper: toHex(paper),
    stamp: toHex(stamp)
  };
}

export function paletteStyle(palette) {
  return {
    '--fill': palette.fill,
    '--fill-ink': palette.fillInk,
    '--accent': palette.accent,
    '--glow': palette.glow,
    '--soft': palette.soft,
    '--preview': palette.preview,
    '--paper': palette.paper,
    '--stamp': palette.stamp
  };
}
