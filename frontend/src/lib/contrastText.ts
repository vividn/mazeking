/**
 * Pick a readable text color (black or white) for the given background.
 *
 * Uses WCAG relative luminance and chooses whichever of black/white has the
 * higher contrast ratio against `bg`. Alpha is ignored — we pick based on the
 * intended button hue, not the composite over the panel background.
 *
 * Accepts CSS color strings: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`,
 * `hsl(h, s%, l%)`, `hsla(h, s%, l%, a)`, `rgb(r, g, b)`, `rgba(r, g, b, a)`,
 * with comma- or whitespace-separated channels and optional `/ a` alpha.
 * Returns `#fff` as a fallback when parsing fails.
 *
 * Background — generateColorScheme emits hsl()/hsla() strings, so the parser
 * MUST handle those formats; an earlier hex-only implementation silently
 * returned `#fff` for every palette-derived background. See ma-pe9.
 */
export function pickTextColor(bg: string): '#000' | '#fff' {
  const rgb = parseColor(bg);
  if (!rgb) return '#fff';
  const L = relativeLuminance(rgb[0], rgb[1], rgb[2]);
  return contrastVsWhite(L) >= contrastVsBlack(L) ? '#fff' : '#000';
}

/**
 * WCAG contrast ratio between two colors, given by their relative luminances.
 * Returns a number in [1, 21].
 */
export function contrastRatio(bgL: number, fgL: number): number {
  const [hi, lo] = bgL > fgL ? [bgL, fgL] : [fgL, bgL];
  return (hi + 0.05) / (lo + 0.05);
}

function contrastVsWhite(L: number): number {
  return contrastRatio(L, 1);
}

function contrastVsBlack(L: number): number {
  return contrastRatio(L, 0);
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function parseColor(input: string): [number, number, number] | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;
  if (s.startsWith('#') || /^[0-9a-f]+$/i.test(s)) return parseHex(s);
  const lower = s.toLowerCase();
  if (lower.startsWith('hsl')) return parseHsl(s);
  if (lower.startsWith('rgb')) return parseRgb(s);
  return null;
}

function parseHex(hex: string): [number, number, number] | null {
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

/**
 * Pull the channel arguments out of `fn(...)` syntax, accepting both
 * comma-separated (`hsl(120, 50%, 40%)`) and whitespace-separated with optional
 * slash-alpha (`hsl(120 50% 40% / 0.8)`) per CSS Color 4.
 */
function extractArgs(s: string): string[] | null {
  const open = s.indexOf('(');
  const close = s.lastIndexOf(')');
  if (open < 0 || close < 0 || close <= open) return null;
  const inner = s.slice(open + 1, close).trim();
  if (!inner) return null;
  const slashIdx = inner.indexOf('/');
  const main = slashIdx >= 0 ? inner.slice(0, slashIdx) : inner;
  return main
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function parseHsl(input: string): [number, number, number] | null {
  const args = extractArgs(input);
  if (!args || args.length < 3) return null;
  const h = parseHueDegrees(args[0]);
  const s = parsePercent(args[1]);
  const l = parsePercent(args[2]);
  if (h === null || s === null || l === null) return null;
  return hslToRgb(h, s, l);
}

function parseRgb(input: string): [number, number, number] | null {
  const args = extractArgs(input);
  if (!args || args.length < 3) return null;
  const r = parseRgbChannel(args[0]);
  const g = parseRgbChannel(args[1]);
  const b = parseRgbChannel(args[2]);
  if (r === null || g === null || b === null) return null;
  return [r, g, b];
}

function parseHueDegrees(token: string): number | null {
  const m = token.match(/^(-?\d*\.?\d+)(deg|rad|grad|turn)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  switch ((m[2] ?? 'deg').toLowerCase()) {
    case 'rad':
      return ((n * 180) / Math.PI) % 360;
    case 'grad':
      return (n * 0.9) % 360;
    case 'turn':
      return (n * 360) % 360;
    default:
      return n % 360;
  }
}

function parsePercent(token: string): number | null {
  const m = token.match(/^(-?\d*\.?\d+)%?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  return clamp(n / 100, 0, 1);
}

function parseRgbChannel(token: string): number | null {
  if (token.endsWith('%')) {
    const p = parsePercent(token);
    return p === null ? null : Math.round(p * 255);
  }
  const n = parseFloat(token);
  if (Number.isNaN(n)) return null;
  return Math.round(clamp(n, 0, 255));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (hh < 60) [r1, g1, b1] = [c, x, 0];
  else if (hh < 120) [r1, g1, b1] = [x, c, 0];
  else if (hh < 180) [r1, g1, b1] = [0, c, x];
  else if (hh < 240) [r1, g1, b1] = [0, x, c];
  else if (hh < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}
