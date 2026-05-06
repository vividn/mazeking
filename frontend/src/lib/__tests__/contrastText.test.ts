import { describe, it, expect } from 'vitest';
import { pickTextColor, contrastRatio } from '../contrastText';

describe('pickTextColor — hex inputs', () => {
  it('picks black for pure white', () => {
    expect(pickTextColor('#ffffff')).toBe('#000');
  });

  it('picks white for pure black', () => {
    expect(pickTextColor('#000000')).toBe('#fff');
  });

  // Mid gray (#808080) has WCAG luminance ≈ 0.215; contrast vs black ≈ 5.31 vs
  // white ≈ 3.96, so black is the readable choice. The previous L>0.5 threshold
  // returned white here, which was the bug ma-pe9 also fixes.
  it('picks black for mid gray (#808080)', () => {
    expect(pickTextColor('#808080')).toBe('#000');
  });

  it('picks black for a light pastel', () => {
    expect(pickTextColor('#ffe4b5')).toBe('#000');
  });

  it('picks white for dark navy', () => {
    expect(pickTextColor('#0a1f44')).toBe('#fff');
  });

  it('handles short hex (#fff → black)', () => {
    expect(pickTextColor('#fff')).toBe('#000');
  });

  it('handles short hex (#000 → white)', () => {
    expect(pickTextColor('#000')).toBe('#fff');
  });

  it('strips alpha from #rrggbbaa (light color + alpha → black)', () => {
    expect(pickTextColor('#ffe4b5cc')).toBe('#000');
  });

  it('strips alpha from #rgba short form', () => {
    expect(pickTextColor('#fff8')).toBe('#000');
  });

  it('accepts uppercase hex', () => {
    expect(pickTextColor('#FFE4B5')).toBe('#000');
  });

  it('accepts hex without leading #', () => {
    expect(pickTextColor('ffffff')).toBe('#000');
  });

  it('falls back to white for malformed input', () => {
    expect(pickTextColor('not-a-color')).toBe('#fff');
    expect(pickTextColor('#zz')).toBe('#fff');
    expect(pickTextColor('')).toBe('#fff');
  });

  it('picks black for a pale yellow accent', () => {
    expect(pickTextColor('#fff59d')).toBe('#000');
  });

  it('picks white for a saturated red', () => {
    expect(pickTextColor('#b71c1c')).toBe('#fff');
  });
});

describe('pickTextColor — hsl inputs (the ma-pe9 regression)', () => {
  // generateColorScheme emits hsl()/hsla() strings — every palette-derived
  // call site exercised these paths and silently got '#fff' back before.
  it('picks black for pure-white hsl', () => {
    expect(pickTextColor('hsl(0, 0%, 100%)')).toBe('#000');
  });

  it('picks white for pure-black hsl', () => {
    expect(pickTextColor('hsl(0, 0%, 0%)')).toBe('#fff');
  });

  it('picks black for a light yellow hsl', () => {
    expect(pickTextColor('hsl(60, 90%, 80%)')).toBe('#000');
  });

  it('picks white for a saturated dark red hsl', () => {
    expect(pickTextColor('hsl(0, 80%, 25%)')).toBe('#fff');
  });

  it('accepts the no-space form generateColorScheme emits', () => {
    // colorGenerator.ts builds strings like `hsl(120,50%,40%)` (no spaces)
    // for byte-alignment with on-chain SVG. This path must work.
    // hsl(120,50%,40%) ≈ rgb(51,153,51), L≈0.237 — black has higher contrast.
    expect(pickTextColor('hsl(120,50%,40%)')).toBe('#000');
  });

  it('picks white for a dark hsl that the no-space format produces', () => {
    // hsl(0,80%,25%) ≈ rgb(115,13,13), L≈0.04 — white is the readable choice.
    expect(pickTextColor('hsl(0,80%,25%)')).toBe('#fff');
  });

  it('accepts the whitespace-separated CSS Color 4 form', () => {
    expect(pickTextColor('hsl(60 90% 80%)')).toBe('#000');
  });

  it('ignores alpha in hsla()', () => {
    expect(pickTextColor('hsla(60, 90%, 80%, 0.5)')).toBe('#000');
    expect(pickTextColor('hsl(60 90% 80% / 0.5)')).toBe('#000');
  });

  it('handles negative / oversize hues by wrapping', () => {
    // -300deg is equivalent to +60deg
    expect(pickTextColor('hsl(-300, 90%, 80%)')).toBe('#000');
    expect(pickTextColor('hsl(420, 90%, 80%)')).toBe('#000');
  });
});

describe('pickTextColor — rgb inputs', () => {
  it('picks black for rgb pure white', () => {
    expect(pickTextColor('rgb(255, 255, 255)')).toBe('#000');
  });

  it('picks white for rgb pure black', () => {
    expect(pickTextColor('rgb(0, 0, 0)')).toBe('#fff');
  });

  it('accepts whitespace-separated rgb', () => {
    expect(pickTextColor('rgb(255 255 255)')).toBe('#000');
  });

  it('ignores alpha in rgba()', () => {
    expect(pickTextColor('rgba(255, 255, 255, 0.5)')).toBe('#000');
    expect(pickTextColor('rgb(255 255 255 / 0.5)')).toBe('#000');
  });

  it('accepts percent rgb channels', () => {
    expect(pickTextColor('rgb(100%, 100%, 100%)')).toBe('#000');
  });
});

describe('contrastRatio', () => {
  it('returns 21 for black on white', () => {
    // L(black)=0, L(white)=1 → (1+0.05)/(0+0.05) = 21
    expect(contrastRatio(0, 1)).toBeCloseTo(21, 5);
  });

  it('returns 1 for identical luminances', () => {
    expect(contrastRatio(0.5, 0.5)).toBeCloseTo(1, 5);
  });

  it('is symmetric in its arguments', () => {
    expect(contrastRatio(0.2, 0.8)).toBeCloseTo(contrastRatio(0.8, 0.2), 10);
  });
});
