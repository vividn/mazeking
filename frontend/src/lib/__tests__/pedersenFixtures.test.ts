/**
 * Cross-layer Pedersen fixtures (ma-bu3 / pawn retro Appendix C).
 *
 * Source of truth: `maze_prover/test_data/layout_fixtures.json` (header u16s
 * + sparse packed_cells overrides). The recipe `just regen-pedersen-fixtures`
 * runs the Noir test that hashes each fixture and emits this `pedersen_fixtures.json`
 * with the canonical `expectedHash`.
 *
 * This test reconstructs the 1520-byte canonical layout for each fixture and
 * asserts that `computeMazeHash` (TS / bb.js) produces the same hash that
 * Noir's `compute_maze_hash` produced for the identical bytes. Drift in
 * either side's byte-encoding fails this test before any proof generation
 * gets near a real circuit.
 *
 * To add a fixture:
 *   1. Edit `maze_prover/test_data/layout_fixtures.json`
 *   2. `just regen-pedersen-fixtures`
 *   3. Commit the updated source + generated artifacts
 */
import { describe, expect, it } from 'vitest';
import { computeMazeHash } from '../mazeIdentity';
import {
  LAYOUT_HEADER_BYTES,
  LAYOUT_TOTAL_BYTES,
  MAX_PACKED_BYTES,
} from '../mazeConstants.generated';
import fixtureFile from './pedersen_fixtures.json';

interface Fixture {
  name: string;
  description: string;
  header: number[];
  packedFill: number;
  packedOverrides?: [number, number][];
  expectedHash: string;
}

const FIXTURES = (fixtureFile as { fixtures: Fixture[] }).fixtures;

function buildLayout(fx: Fixture): Uint8Array {
  if (fx.header.length !== 10) {
    throw new Error(`fixture "${fx.name}": header must have 10 u16s`);
  }
  const layout = new Uint8Array(LAYOUT_TOTAL_BYTES);
  for (let i = 0; i < 10; i++) {
    const v = fx.header[i] & 0xffff;
    layout[i * 2] = (v >> 8) & 0xff;
    layout[i * 2 + 1] = v & 0xff;
  }
  if (fx.packedFill !== 0) {
    for (let i = 0; i < MAX_PACKED_BYTES; i++) {
      layout[LAYOUT_HEADER_BYTES + i] = fx.packedFill & 0xff;
    }
  }
  for (const [idx, byte] of fx.packedOverrides ?? []) {
    if (idx < 0 || idx >= MAX_PACKED_BYTES) {
      throw new Error(
        `fixture "${fx.name}": override index ${idx} out of range [0, ${MAX_PACKED_BYTES})`
      );
    }
    layout[LAYOUT_HEADER_BYTES + idx] = byte & 0xff;
  }
  return layout;
}

describe('cross-layer Pedersen fixtures', () => {
  it('loads at least 6 fixtures (drift gate)', () => {
    // Acceptance criterion from ma-bu3: fewer than 6 fixtures means we lost
    // the boundary coverage the regen recipe was supposed to give us.
    expect(FIXTURES.length).toBeGreaterThanOrEqual(6);
  });

  it('has unique fixture names', () => {
    const names = FIXTURES.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  for (const fx of FIXTURES) {
    it(`computeMazeHash matches Noir for "${fx.name}"`, async () => {
      const layout = buildLayout(fx);
      expect(layout.length).toBe(LAYOUT_TOTAL_BYTES);
      const h = await computeMazeHash(layout);
      expect(h).toBe(fx.expectedHash.toLowerCase());
    });
  }
});
