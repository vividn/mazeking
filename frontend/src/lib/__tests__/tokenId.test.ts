/**
 * Sanity checks for the canonical layout serialization that feeds the
 * Pedersen hash. Under the hash-as-public-input architecture (ma-6cr.6)
 * the contract derives tokenId from `mazeHash = pedersen(layout)` rather
 * than from a keccak over publicInputs, so the layout bytes are the new
 * point of agreement between client and circuit. The actual Pedersen
 * call lives in ma-6cr.8.
 */
import { describe, expect, it } from 'vitest';
import { layoutBytesForSeed, serializeLayoutBytes } from '../tokenId';
import { generateMaze } from '../mazeGenerator';
import { serializeForZk } from '../zkSerialize';
import { LAYOUT_TOTAL_BYTES } from '../mazeConstants.generated';

describe('layout serialization', () => {
  it('produces a fixed-size buffer regardless of maze size', () => {
    const small = layoutBytesForSeed('a');
    const big = layoutBytesForSeed('the quick brown fox jumps over');
    expect(small.length).toBe(LAYOUT_TOTAL_BYTES);
    expect(big.length).toBe(LAYOUT_TOTAL_BYTES);
  });

  it('is deterministic for the same seed', () => {
    const a = layoutBytesForSeed('stable');
    const b = layoutBytesForSeed('stable');
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('produces different layouts for different seeds', () => {
    const a = layoutBytesForSeed('alpha');
    const b = layoutBytesForSeed('bravo');
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('encodes width/height as big-endian u16 in the first 4 bytes', () => {
    const seed = 'demo seed 42';
    const { maze, kingPos, robePos, scepterPos, goalPos } = generateMaze(seed);
    const zk = serializeForZk(maze, kingPos, robePos, scepterPos, goalPos);
    const layout = serializeLayoutBytes(zk);

    expect(layout[0]).toBe((zk.width >> 8) & 0xff);
    expect(layout[1]).toBe(zk.width & 0xff);
    expect(layout[2]).toBe((zk.height >> 8) & 0xff);
    expect(layout[3]).toBe(zk.height & 0xff);
  });

  it('encodes robe and scepter at bytes [8..16]', () => {
    const seed = 'regalia layout check';
    const { maze, kingPos, robePos, scepterPos, goalPos } = generateMaze(seed);
    const zk = serializeForZk(maze, kingPos, robePos, scepterPos, goalPos);
    const layout = serializeLayoutBytes(zk);

    expect(layout[8]).toBe((zk.robeX >> 8) & 0xff);
    expect(layout[9]).toBe(zk.robeX & 0xff);
    expect(layout[10]).toBe((zk.robeY >> 8) & 0xff);
    expect(layout[11]).toBe(zk.robeY & 0xff);
    expect(layout[12]).toBe((zk.scepterX >> 8) & 0xff);
    expect(layout[13]).toBe(zk.scepterX & 0xff);
    expect(layout[14]).toBe((zk.scepterY >> 8) & 0xff);
    expect(layout[15]).toBe(zk.scepterY & 0xff);
  });
});
