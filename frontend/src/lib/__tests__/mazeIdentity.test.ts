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

  // Cross-layer fixtures: these exact hash values were emitted by the Noir
  // circuit (`maze_prover/src/hash.nr` :: `compute_maze_hash`) for the
  // listed inputs. If either side drifts (byte packing, hash index, or the
  // canonical layout encoding) this test catches it BEFORE proof
  // generation fails in the wild. Regenerate by adding a temporary
  // `println(f"...={h}")` test in `hash.nr` and running `nargo test
  // --show-output`.
  it('matches Noir compute_maze_hash for an all-zero layout', async () => {
    const layout = new Uint8Array(LAYOUT_TOTAL_BYTES);
    const h = await computeMazeHash(layout);
    expect(h).toBe(
      '0x13a642ccfcf679dd6e43b67940e6b7ecbb608a2dbf52a7b8b2c4b7e96ed0739f'
    );
  });

  it('matches Noir compute_maze_hash for a 10x10 fixture with packed_cells[0]=1', async () => {
    // Header (10 BE u16s): width=10 height=10 sx=0 sy=0
    //   robe=(9,0) scepter=(1,1) goal=(5,9).
    const layout = new Uint8Array(LAYOUT_TOTAL_BYTES);
    const header = [10, 10, 0, 0, 9, 0, 1, 1, 5, 9];
    for (let i = 0; i < header.length; i++) {
      layout[i * 2] = (header[i] >> 8) & 0xff;
      layout[i * 2 + 1] = header[i] & 0xff;
    }
    layout[20] = 1; // packed_cells[0] = 1
    const h = await computeMazeHash(layout);
    expect(h).toBe(
      '0x073ed108f130372d06b419e41b9f0a28f4ff2123082051428f106eb43e4416d4'
    );
  });
});
