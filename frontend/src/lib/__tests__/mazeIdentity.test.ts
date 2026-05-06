/**
 * Tests for the bb.js Pedersen wiring.
 *
 * These exercise the actual Barretenberg WASM, so they run a bit slower than
 * pure-TS tests. The core invariant is that the JS hash matches the Noir
 * circuit's `compute_maze_hash` byte-for-byte; if it does not, proof
 * generation fails (the circuit's hash assertion catches it before bb).
 */
import { describe, expect, it } from 'vitest';
import { computeMazeHash } from '../mazeIdentity';
import { layoutBytesForSeed } from '../tokenId';
import { LAYOUT_TOTAL_BYTES } from '../mazeConstants.generated';

describe('computeMazeHash (bb.js Pedersen)', () => {
  it('returns a 32-byte 0x-prefixed hex string', async () => {
    const layout = layoutBytesForSeed('determinism check');
    const h = await computeMazeHash(layout);
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('is deterministic for the same seed', async () => {
    const layout = layoutBytesForSeed('stable');
    const a = await computeMazeHash(layout);
    const b = await computeMazeHash(layout);
    expect(a).toBe(b);
  });

  it('changes when any layout byte changes', async () => {
    const base = layoutBytesForSeed('alpha');
    const baseHash = await computeMazeHash(base);

    // Mutate a byte in the packed-cells region; the hash MUST change. We
    // mutate at index 20 (first packed-cells byte) so we are not just
    // re-hashing different positions.
    const mutated = new Uint8Array(base);
    mutated[20] = mutated[20] ^ 0x01;
    const mutatedHash = await computeMazeHash(mutated);
    expect(mutatedHash).not.toBe(baseHash);
  });

  it('rejects layouts of the wrong size', async () => {
    const tooShort = new Uint8Array(LAYOUT_TOTAL_BYTES - 1);
    await expect(computeMazeHash(tooShort)).rejects.toThrow(/1520/);
    const tooLong = new Uint8Array(LAYOUT_TOTAL_BYTES + 1);
    await expect(computeMazeHash(tooLong)).rejects.toThrow(/1520/);
  });

  it('produces different hashes for different seeds', async () => {
    const [hA, hB] = await Promise.all([
      computeMazeHash(layoutBytesForSeed('alpha')),
      computeMazeHash(layoutBytesForSeed('bravo')),
    ]);
    expect(hA).not.toBe(hB);
  });

  // Cross-layer Noir↔TS hash fixtures live in `pedersenFixtures.test.ts`,
  // which reads `pedersen_fixtures.json` produced by `just regen-pedersen-fixtures`.
});
