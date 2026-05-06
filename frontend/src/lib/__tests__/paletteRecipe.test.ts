import { describe, it, expect } from 'vitest';
import {
  PALETTE_RECIPE,
  STRUCTURAL_FIELD_NAMES,
  canonicalPaletteFromHash,
  hslString,
} from '../paletteRecipe.generated';

/**
 * Golden tests for the codegen'd palette. These fixtures MUST match the
 * Solidity-side fixtures in `contracts/test/MazePalette.t.sol` for the
 * structural fields (wall/mazeBg/textBg/zkBg/crownBg). Drift between the
 * two test files indicates the codegen has gone out of sync — exactly
 * what this whole machinery (ma-fy3) is meant to prevent.
 *
 * Format: `hsl(h,s%,l%)` (no spaces) — the same format Sol emits and the
 * format that the live canvas now uses. Byte-identical strings are how we
 * verify cross-language palette agreement.
 */

interface Fixture {
  /** Hex hash for TS / `seed` for Sol. */
  hash: string;
  baseHue: number;
  // Structural — must match Sol byte-for-byte.
  wall: string;
  mazeBg: string;
  textBg: string;
  zkBg: string;
  crownBg: string;
  // Entity — TS-only.
  player: string;
  key: string;
  goal: string;
}

const FIXTURES: readonly Fixture[] = [
  // Fixture A — no wraparound on textBg/zkBg.
  {
    hash: '0x3039', // = 12345
    baseHue: 105,
    wall: 'hsl(105,25%,22%)',
    mazeBg: 'hsl(135,22%,80%)',
    textBg: 'hsl(305,80%,60%)',
    zkBg: 'hsl(65,80%,55%)', // (105 + 320) % 360
    crownBg: 'hsl(48,85%,55%)',
    player: 'hsl(45,90%,60%)',
    key: 'hsl(55,85%,55%)',
    goal: 'hsl(195,65%,50%)',
  },
  // Fixture B — both textBg and zkBg wrap around 360.
  {
    hash: '0xb4', // = 180
    baseHue: 180,
    wall: 'hsl(180,25%,22%)',
    mazeBg: 'hsl(210,22%,80%)',
    textBg: 'hsl(20,80%,60%)', // (180 + 200) % 360
    zkBg: 'hsl(140,80%,55%)', // (180 + 320) % 360
    crownBg: 'hsl(48,85%,55%)',
    player: 'hsl(45,90%,60%)',
    key: 'hsl(55,85%,55%)',
    goal: 'hsl(270,65%,50%)',
  },
  // Fixture C — corner: hash = 0, baseHue = 0.
  {
    hash: '0x0',
    baseHue: 0,
    wall: 'hsl(0,25%,22%)',
    mazeBg: 'hsl(30,22%,80%)',
    textBg: 'hsl(200,80%,60%)',
    zkBg: 'hsl(320,80%,55%)',
    crownBg: 'hsl(48,85%,55%)',
    player: 'hsl(45,90%,60%)',
    key: 'hsl(55,85%,55%)',
    goal: 'hsl(90,65%,50%)',
  },
  // Fixture D — large hex exercises BigInt mod path. 0xabcdef = 11259375;
  // 11259375 % 360 = 15.
  {
    hash: '0xabcdef',
    baseHue: 15,
    wall: 'hsl(15,25%,22%)',
    mazeBg: 'hsl(45,22%,80%)',
    textBg: 'hsl(215,80%,60%)',
    zkBg: 'hsl(335,80%,55%)',
    crownBg: 'hsl(48,85%,55%)',
    player: 'hsl(45,90%,60%)',
    key: 'hsl(55,85%,55%)',
    goal: 'hsl(105,65%,50%)',
  },
];

describe('PALETTE_RECIPE (autogen)', () => {
  it('contains the eight canonical fields in the documented order', () => {
    expect(PALETTE_RECIPE.map((f) => f.name)).toEqual([
      'wall',
      'mazeBg',
      'textBg',
      'zkBg',
      'crownBg',
      'player',
      'key',
      'goal',
    ]);
  });

  it('marks exactly the five structural fields as structural', () => {
    expect(STRUCTURAL_FIELD_NAMES).toEqual([
      'wall',
      'mazeBg',
      'textBg',
      'zkBg',
      'crownBg',
    ]);
  });

  it('uses only valid hue kinds with values in [0, 360)', () => {
    for (const f of PALETTE_RECIPE) {
      expect(['constant', 'offset']).toContain(f.hue.kind);
      expect(f.hue.value).toBeGreaterThanOrEqual(0);
      expect(f.hue.value).toBeLessThan(360);
      expect(f.s).toBeGreaterThanOrEqual(0);
      expect(f.s).toBeLessThanOrEqual(100);
      expect(f.l).toBeGreaterThanOrEqual(0);
      expect(f.l).toBeLessThanOrEqual(100);
    }
  });
});

describe('canonicalPaletteFromHash', () => {
  for (const fx of FIXTURES) {
    describe(`hash=${fx.hash} (baseHue=${fx.baseHue})`, () => {
      const palette = canonicalPaletteFromHash(fx.hash);

      it('derives baseHue from hash mod 360', () => {
        expect(palette.baseHue).toBe(fx.baseHue);
      });

      // Structural — these strings are also asserted in MazePalette.t.sol.
      // If TS and Sol disagree on these, one or both have drifted from
      // palette/paletteRecipe.json.
      it('emits byte-identical structural fields (Sol-aligned)', () => {
        expect(hslString(palette.wall)).toBe(fx.wall);
        expect(hslString(palette.mazeBg)).toBe(fx.mazeBg);
        expect(hslString(palette.textBg)).toBe(fx.textBg);
        expect(hslString(palette.zkBg)).toBe(fx.zkBg);
        expect(hslString(palette.crownBg)).toBe(fx.crownBg);
      });

      // Entity — frontend-only; tested here and only here.
      it('emits expected entity fields (TS-only)', () => {
        expect(hslString(palette.player)).toBe(fx.player);
        expect(hslString(palette.key)).toBe(fx.key);
        expect(hslString(palette.goal)).toBe(fx.goal);
      });
    });
  }

  it('handles a 256-bit hash without overflow', () => {
    const big =
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const palette = canonicalPaletteFromHash(big);
    // 2^256 - 1 mod 360 = 15.
    expect(palette.baseHue).toBe(15);
    expect(hslString(palette.wall)).toBe('hsl(15,25%,22%)');
    expect(hslString(palette.mazeBg)).toBe('hsl(45,22%,80%)');
  });
});
