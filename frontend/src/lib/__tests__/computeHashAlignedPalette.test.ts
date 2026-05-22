/**
 * Locks in the ma-09y invariant: previews and the live render derive colors
 * through a single algorithm. `computeHashAlignedPalette(seed)` must equal
 * `generateColorScheme(seed, { mazeHash })` for `mazeHash = pedersen(layout)`.
 * If a future refactor lets these drift, this test fails and we catch the
 * preview-vs-live color split before it ships.
 */
import { describe, expect, it } from 'vitest';
import {
  computeHashAlignedPalette,
  generateColorScheme,
} from '../colorGenerator';
import { computeMazeHash } from '../mazeIdentity';
import { layoutBytesForSeed } from '../tokenId';

describe('computeHashAlignedPalette', () => {
  it('matches the live-game upgrade path byte-for-byte', async () => {
    const seed = 'preview vs live';
    const layout = layoutBytesForSeed(seed);
    const mazeHash = await computeMazeHash(layout);
    const liveGamePalette = generateColorScheme(seed, { mazeHash });
    const helperPalette = await computeHashAlignedPalette(seed);
    expect(helperPalette).toEqual(liveGamePalette);
  });

  it('is deterministic across calls', async () => {
    const seed = 'stable preview seed';
    const a = await computeHashAlignedPalette(seed);
    const b = await computeHashAlignedPalette(seed);
    expect(a).toEqual(b);
  });

  it('differs from the seed-only palette (proves the upgrade is real)', async () => {
    const seed = 'upgrade is non-trivial';
    const seedOnly = generateColorScheme(seed);
    const upgraded = await computeHashAlignedPalette(seed);
    // The structural fields (wall/mazeBg/textBg/zkBg/crownBg/player/key/goal)
    // come from the on-chain recipe in the upgraded palette, so at least one
    // of them must differ from the rng-only derivation.
    expect(upgraded.wallColor).not.toBe(seedOnly.wallColor);
  });
});
