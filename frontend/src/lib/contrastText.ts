/**
 * Pick a readable text color (black or white) for the given background.
 * Uses WCAG relative luminance; alpha is ignored — we pick based on the
 * intended button hue, not the composite over the panel background.
 */
export function pickTextColor(bg: string): '#000' | '#fff' {
  const rgb = parseHex(bg);
  if (!rgb) return '#fff';
  const [r, g, b] = rgb;
  const L = relativeLuminance(r, g, b);
  return L > 0.5 ? '#000' : '#fff';
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** Parse '#rgb', '#rgba', '#rrggbb', '#rrggbbaa' into [r,g,b] (0-255). Alpha is ignored. */
function parseHex(hex: string): [number, number, number] | null {
  if (typeof hex !== 'string') return null;
  const h = hex.trim().replace(/^#/, '');
  let r: number, g: number, b: number;
  if (h.length === 3 || h.length === 4) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length === 6 || h.length === 8) {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    return null;
  }
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return [r, g, b];
}
