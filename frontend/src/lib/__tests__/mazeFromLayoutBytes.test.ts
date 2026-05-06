/**
 * Round-trip goldens: every seed we use to seed the canonical layout must
 * decode back to a maze structurally identical to the one the generator
 * produced. This proves `mazeFromLayoutBytes` is the exact inverse of
 * `serializeLayoutBytes` (modulo zero-padded tail), which is what makes
 * on-chain replay correct.
 */
import { describe, expect, it } from 'vitest';
import { generateMaze } from '../mazeGenerator';
import { serializeForZk } from '../zkSerialize';
import { layoutBytesForSeed, serializeLayoutBytes } from '../tokenId';
import { mazeFromLayoutBytes, hexToBytes } from '../mazeFromLayoutBytes';

const FIXTURE_SEEDS = [
  'maze♚ ♚king',
  'alpha',
  'the quick brown fox',
  'a',
  'demo seed 42',
  'regalia layout check',
];

describe('mazeFromLayoutBytes', () => {
  for (const seed of FIXTURE_SEEDS) {
    it(`round-trips seed: ${seed}`, () => {
      const original = generateMaze(seed);
      const layout = layoutBytesForSeed(seed);
      const decoded = mazeFromLayoutBytes(layout);

      expect(decoded.maze.width).toBe(original.maze.width);
      expect(decoded.maze.height).toBe(original.maze.height);
      expect(decoded.startPlayerPos).toEqual(original.kingPos);
      expect(decoded.startRobePos).toEqual(original.robePos);
      expect(decoded.startScepterPos).toEqual(original.scepterPos);
      expect(decoded.startGoalPos).toEqual(original.goalPos);

      for (let y = 0; y < original.maze.height; y++) {
        for (let x = 0; x < original.maze.width; x++) {
          expect(decoded.maze.cells[y][x]).toEqual(original.maze.cells[y][x]);
        }
      }
    });
  }

  it('rejects layouts shorter than the header', () => {
    expect(() => mazeFromLayoutBytes(new Uint8Array(10))).toThrow(/too short/);
  });

  it('rejects layouts with zero dimensions', () => {
    const layout = new Uint8Array(20);
    expect(() => mazeFromLayoutBytes(layout)).toThrow(/Empty maze/);
  });

  it('rejects layouts truncated below packed-cells length', () => {
    // 4x4 = 16 cells = 8 packed bytes; header + 4 bytes is short.
    const layout = new Uint8Array(20 + 4);
    layout[0] = 0;
    layout[1] = 4; // width = 4
    layout[2] = 0;
    layout[3] = 4; // height = 4
    expect(() => mazeFromLayoutBytes(layout)).toThrow(/truncated/);
  });

  it('decodes the same layout the renderer would render', () => {
    // Spot-check the cell-nibble decode against an explicit two-cell layout.
    // 1x2 maze: cell(0,0) = south=1, east=1, type=2 (ZkText) -> 0xE
    //           cell(0,1) = south=0, east=1, type=1 (Text)   -> 0x5
    // Packed byte: high nibble first (even index), low nibble second.
    const layout = new Uint8Array(20 + 1);
    layout[0] = 0;
    layout[1] = 1; // width=1
    layout[2] = 0;
    layout[3] = 2; // height=2
    layout[20] = 0xe5;

    const { maze } = mazeFromLayoutBytes(layout);
    expect(maze.width).toBe(1);
    expect(maze.height).toBe(2);
    expect(maze.cells[0][0]).toEqual({
      southWall: true,
      eastWall: true,
      cellType: 2,
    });
    expect(maze.cells[1][0]).toEqual({
      southWall: false,
      eastWall: true,
      cellType: 1,
    });
  });

  it('handles odd cell counts (last byte half-used)', () => {
    // 3x1: three cells packed into two bytes; last nibble unused.
    const original = generateMaze('a'); // 'a' produces a small maze
    const zk = serializeForZk(
      original.maze,
      original.kingPos,
      original.robePos,
      original.scepterPos,
      original.goalPos
    );
    const layout = serializeLayoutBytes(zk);
    const decoded = mazeFromLayoutBytes(layout);
    expect(decoded.maze.cells.length).toBe(original.maze.height);
    expect(decoded.maze.cells[0].length).toBe(original.maze.width);
  });
});

describe('hexToBytes', () => {
  it('round-trips a known hex string', () => {
    const bytes = hexToBytes('0x000a0bff');
    expect(Array.from(bytes)).toEqual([0x00, 0x0a, 0x0b, 0xff]);
  });

  it('accepts hex without 0x prefix', () => {
    const bytes = hexToBytes('deadbeef');
    expect(Array.from(bytes)).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  it('rejects odd-length hex', () => {
    expect(() => hexToBytes('0x1')).toThrow(/Invalid hex/);
  });
});
