import { describe, it, expect } from 'vitest';
import { pickTextColor } from '../contrastText';

describe('pickTextColor', () => {
  it('picks black for pure white', () => {
    expect(pickTextColor('#ffffff')).toBe('#000');
  });

  it('picks white for pure black', () => {
    expect(pickTextColor('#000000')).toBe('#fff');
  });

  it('picks white for mid gray (#808080) — perceptually closer to dark side via WCAG curve', () => {
    expect(pickTextColor('#808080')).toBe('#fff');
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
