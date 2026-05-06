/**
 * Golden test for the canonical hash-aligned palette.
 *
 * Pairs with `contracts/test/MazePalette.t.sol`: both tests assert the same
 * HSL strings for the same fixture seed, so they catch silent drift in either
 * direction (TS vs. Sol). If you regenerate the recipe and these golden
 * strings fall out of sync, fix BOTH sides — see ma-fy3.
 */
import { describe, expect, it } from 'vitest';
import { generateColorScheme } from '../colorGenerator';
import { PALETTE_RECIPE, resolveHue } from '../paletteRecipe.generated';

// Fixture seed: 0x7f = 127. Chosen so baseHue == seed (no wrap), trivially
// auditable. Must match FIXTURE_SEED in MazePalette.t.sol.
const FIXTURE_HASH = '0x7f';

describe('canonical palette (hash-aligned)', () => {
  it('produces the expected HSL strings for the fixture seed', () => {
    const scheme = generateColorScheme('any-seed', { mazeHash: FIXTURE_HASH });

    // baseHue = 127. These strings MUST match MazePalette.t.sol byte-for-byte.
    expect(scheme.wallColor).toBe('hsl(127,25%,22%)');
    expect(scheme.mazeBackgroundColor).toBe('hsl(157,22%,80%)');
    expect(scheme.textBackgroundColor).toBe('hsl(327,80%,60%)');
    expect(scheme.zkBackgroundColor).toBe('hsl(87,80%,55%)');
    expect(scheme.crownBackgroundColor).toBe('hsl(48,85%,55%)');
  });

  it('wraps baseHue at 360', () => {
    // 0x2d0 = 720, 720 % 360 = 0. Mirrors the Foundry wrap test.
    const scheme = generateColorScheme('any-seed', { mazeHash: '0x2d0' });
    expect(scheme.wallColor).toBe('hsl(0,25%,22%)');
    expect(scheme.mazeBackgroundColor).toBe('hsl(30,22%,80%)');
    expect(scheme.textBackgroundColor).toBe('hsl(200,80%,60%)');
    expect(scheme.zkBackgroundColor).toBe('hsl(320,80%,55%)');
    expect(scheme.crownBackgroundColor).toBe('hsl(48,85%,55%)');
  });
});

describe('PALETTE_RECIPE shape', () => {
  it('declares the five canonical on-chain fields', () => {
    const onChain = PALETTE_RECIPE.filter((f) => f.onChain).map((f) => f.name);
    // The on-chain Palette struct in MazePalette.sol depends on this exact
    // set + order. Updating the recipe must keep these five in this order;
    // if you intentionally change the on-chain palette, regenerate AND
    // update the Foundry struct expectation accordingly.
    expect(onChain).toEqual(['wall', 'mazeBg', 'textBg', 'zkBg', 'crownBg']);
  });

  it('resolveHue matches Solidity `(baseHue + offset) % 360` for every field', () => {
    // Spot-check at a few base hues to confirm the TS resolver mirrors
    // the on-chain modulo. Pure-TS test, no Foundry dependency.
    for (const baseHue of [0, 47, 127, 200, 359]) {
      for (const f of PALETTE_RECIPE) {
        const h = resolveHue(f, baseHue);
        const expected =
          f.hue.type === 'constant' ? f.hue.value : (baseHue + f.hue.offset) % 360;
        expect(h).toBe(expected);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(360);
      }
    }
  });
});
