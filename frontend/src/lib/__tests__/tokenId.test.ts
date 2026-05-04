/**
 * Sanity checks for tokenId derivation.
 *
 * The contract derives tokenId from the same maze layout the prover emits as
 * publicInputs[0..MAZE_DATA_LENGTH-1]. Our two helpers must agree:
 *
 *   computeTokenIdFromSeed(seed) ===
 *     computeTokenIdFromPublicInputs(simulatePublicInputsForSeed(seed))
 *
 * If they ever diverge, owned-NFT lookup against seedHistory will silently
 * miss matches, breaking the My Mazes replay path.
 */
import { describe, expect, it } from 'vitest';
import {
  computeTokenIdFromPublicInputs,
  computeTokenIdFromSeed,
} from '../tokenId';
import { generateMaze } from '../mazeGenerator';
import { serializeForZk } from '../zkSerialize';
import { MAX_PACKED_BYTES } from '../mazeConstants.generated';

function bigintToBytes32Hex(value: bigint | number): string {
  const v = typeof value === 'bigint' ? value : BigInt(value);
  return '0x' + v.toString(16).padStart(64, '0');
}

function buildPublicInputsFromSeed(seed: string): string[] {
  const { maze, kingPos, keyPos, goalPos } = generateMaze(seed);
  const zk = serializeForZk(maze, kingPos, keyPos, goalPos);
  const padded = [...zk.packedCells];
  while (padded.length < MAX_PACKED_BYTES) padded.push(0);
  const inputs = [
    bigintToBytes32Hex(zk.width),
    bigintToBytes32Hex(zk.height),
    bigintToBytes32Hex(zk.startX),
    bigintToBytes32Hex(zk.startY),
    bigintToBytes32Hex(zk.keyX),
    bigintToBytes32Hex(zk.keyY),
    bigintToBytes32Hex(zk.goalX),
    bigintToBytes32Hex(zk.goalY),
    ...padded.map((b) => bigintToBytes32Hex(b)),
    bigintToBytes32Hex(0), // move_count placeholder; excluded from hash anyway
  ];
  return inputs;
}

describe('tokenId derivation', () => {
  it('agrees between seed-based and publicInputs-based paths', () => {
    const seeds = ['maze♚ ♚king', 'hello world', 'demo seed 42'];
    for (const seed of seeds) {
      const fromSeed = computeTokenIdFromSeed(seed);
      const fromPi = computeTokenIdFromPublicInputs(
        buildPublicInputsFromSeed(seed)
      );
      expect(fromPi).toBe(fromSeed);
    }
  });

  it('produces different tokenIds for different seeds', () => {
    const a = computeTokenIdFromSeed('alpha');
    const b = computeTokenIdFromSeed('bravo');
    expect(a).not.toBe(b);
  });

  it('is deterministic for the same seed', () => {
    expect(computeTokenIdFromSeed('stable')).toBe(
      computeTokenIdFromSeed('stable')
    );
  });
});
