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
    // mutate at index 16 (first packed-cells byte) so we are not just
    // re-hashing different positions.
    const mutated = new Uint8Array(base);
    mutated[16] = mutated[16] ^ 0x01;
    const mutatedHash = await computeMazeHash(mutated);
    expect(mutatedHash).not.toBe(baseHash);
  });

  it('rejects layouts of the wrong size', async () => {
    const tooShort = new Uint8Array(LAYOUT_TOTAL_BYTES - 1);
    await expect(computeMazeHash(tooShort)).rejects.toThrow(/1516/);
    const tooLong = new Uint8Array(LAYOUT_TOTAL_BYTES + 1);
    await expect(computeMazeHash(tooLong)).rejects.toThrow(/1516/);
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
      '0x09d86f2a6cdfa27e445f9514e3763cf6a9bd25a0e21378dd48e49fd32b8b0405'
    );
  });

  it('matches Noir compute_maze_hash for a 10x10 fixture with packed_cells[0]=1', async () => {
    // Header: width=10 height=10 sx=0 sy=0 kx=9 ky=0 gx=5 gy=9 (BE u16s).
    const layout = new Uint8Array(LAYOUT_TOTAL_BYTES);
    const header = [10, 10, 0, 0, 9, 0, 5, 9];
    for (let i = 0; i < header.length; i++) {
      layout[i * 2] = (header[i] >> 8) & 0xff;
      layout[i * 2 + 1] = header[i] & 0xff;
    }
    layout[16] = 1; // packed_cells[0] = 1
    const h = await computeMazeHash(layout);
    expect(h).toBe(
      '0x286ca4a3d86351cf0beeb21a7afccdda0108ffd008ea8cb3606059966df1a02d'
    );
  });
});
