/**
 * Locks the on-chain layout decoder to the same byte format as
 * `MazeRenderer._decodeHeader` (Solidity) and `serializeLayoutBytes` (TS).
 *
 * The fixtures in this file mirror `_fixtureMinimal`/`_fixtureAverage`/
 * `_fixtureMaxCell` in `contracts/test/MazeRenderer.t.sol` (ma-vzm), so a
 * drift between the TS and Sol decoders fails BOTH suites — keeping replay
 * (frontend) and on-chain rendering (Solidity) in lockstep.
 */
import { describe, expect, it } from 'vitest';
import { mazeFromLayoutBytes } from '../mazeFromLayoutBytes';
import { layoutBytesForSeed, serializeLayoutBytes } from '../tokenId';
import { generateMaze } from '../mazeGenerator';
import { serializeForZk } from '../zkSerialize';
import { LAYOUT_TOTAL_BYTES } from '../mazeConstants.generated';
import { CellType } from '../../types';

interface HeaderInput {
  width: number;
  height: number;
  startX: number;
  startY: number;
  robeX: number;
  robeY: number;
  scepterX: number;
  scepterY: number;
  goalX: number;
  goalY: number;
}

function writeU16BE(out: Uint8Array, offset: number, value: number): void {
  out[offset] = (value >> 8) & 0xff;
  out[offset + 1] = value & 0xff;
}

function buildLayout(h: HeaderInput, packedCells: Uint8Array): Uint8Array {
  const out = new Uint8Array(20 + packedCells.length);
  writeU16BE(out, 0, h.width);
  writeU16BE(out, 2, h.height);
  writeU16BE(out, 4, h.startX);
  writeU16BE(out, 6, h.startY);
  writeU16BE(out, 8, h.robeX);
  writeU16BE(out, 10, h.robeY);
  writeU16BE(out, 12, h.scepterX);
  writeU16BE(out, 14, h.scepterY);
  writeU16BE(out, 16, h.goalX);
  writeU16BE(out, 18, h.goalY);
  out.set(packedCells, 20);
  return out;
}

// _fixtureMinimal in MazeRenderer.t.sol: 2x2, all Normal, no walls.
function fixtureMinimal(): Uint8Array {
  return buildLayout(
    {
      width: 2,
      height: 2,
      startX: 0,
      startY: 0,
      robeX: 1,
      robeY: 0,
      scepterX: 0,
      scepterY: 1,
      goalX: 1,
      goalY: 1,
    },
    new Uint8Array([0x00, 0x00])
  );
}

// _fixtureAverage in MazeRenderer.t.sol: 4x4, mixed cell types and walls.
function fixtureAverage(): Uint8Array {
  return buildLayout(
    {
      width: 4,
      height: 4,
      startX: 0,
      startY: 0,
      robeX: 2,
      robeY: 1,
      scepterX: 0,
      scepterY: 2,
      goalX: 3,
      goalY: 3,
    },
    new Uint8Array([0xc9, 0x63, 0xc0, 0x49, 0xcc, 0x33, 0xc9, 0x66])
  );
}

// _fixtureMaxCell in MazeRenderer.t.sol: 8x8, packed bytes cycle 0x00,0x05,0xAA,0xFF.
function fixtureMaxCell(): Uint8Array {
  const cells = new Uint8Array(32);
  const pattern = [0x00, 0x05, 0xaa, 0xff];
  for (let i = 0; i < 32; i++) cells[i] = pattern[i % 4];
  return buildLayout(
    {
      width: 8,
      height: 8,
      startX: 0,
      startY: 0,
      robeX: 4,
      robeY: 4,
      scepterX: 7,
      scepterY: 0,
      goalX: 7,
      goalY: 7,
    },
    cells
  );
}

describe('mazeFromLayoutBytes', () => {
  it('decodes the minimal fixture (2x2, all Normal, no walls)', () => {
    const { maze, startPos, robePos, scepterPos, goalPos } =
      mazeFromLayoutBytes(fixtureMinimal());
    expect(maze.width).toBe(2);
    expect(maze.height).toBe(2);
    expect(startPos).toEqual({ x: 0, y: 0 });
    expect(robePos).toEqual({ x: 1, y: 0 });
    expect(scepterPos).toEqual({ x: 0, y: 1 });
    expect(goalPos).toEqual({ x: 1, y: 1 });
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        expect(maze.cells[y][x]).toEqual({
          southWall: false,
          eastWall: false,
          cellType: CellType.Normal,
        });
      }
    }
  });

  it('decodes the average fixture (4x4, mixed cells, walls)', () => {
    // Packed cells [0xC9, 0x63, 0xC0, 0x49, 0xCC, 0x33, 0xC9, 0x66] expanded:
    //   [C,9, 6,3, C,0, 4,9, C,C, 3,3, C,9, 6,6]
    // Within each nibble: bit3 south, bit2 east, bits1-0 cellType.
    //   C = 1100 -> south + east + Normal
    //   9 = 1001 -> south + Text
    //   6 = 0110 -> east + ZkText
    //   3 = 0011 -> CrownText (3)
    //   0 = 0000 -> Normal, no walls
    //   4 = 0100 -> east, Normal
    const { maze } = mazeFromLayoutBytes(fixtureAverage());
    expect(maze.width).toBe(4);
    expect(maze.height).toBe(4);

    // First row: cells 0..3 from nibbles [C, 9, 6, 3]
    expect(maze.cells[0][0]).toEqual({
      southWall: true,
      eastWall: true,
      cellType: CellType.Normal,
    });
    expect(maze.cells[0][1]).toEqual({
      southWall: true,
      eastWall: false,
      cellType: CellType.Text,
    });
    expect(maze.cells[0][2]).toEqual({
      southWall: false,
      eastWall: true,
      cellType: CellType.ZkText,
    });
    expect(maze.cells[0][3]).toEqual({
      southWall: false,
      eastWall: false,
      cellType: CellType.CrownText,
    });

    // Bottom-right cell uses last nibble (low of byte 7 = 0x66): 0110 -> ZkText, east only.
    expect(maze.cells[3][3]).toEqual({
      southWall: false,
      eastWall: true,
      cellType: CellType.ZkText,
    });
  });

  it('decodes the 8x8 fixture (cycles 0x00,0x05,0xAA,0xFF — every nibble pattern)', () => {
    const { maze, startPos, robePos, scepterPos, goalPos } =
      mazeFromLayoutBytes(fixtureMaxCell());
    expect(maze.width).toBe(8);
    expect(maze.height).toBe(8);
    expect(startPos).toEqual({ x: 0, y: 0 });
    expect(robePos).toEqual({ x: 4, y: 4 });
    expect(scepterPos).toEqual({ x: 7, y: 0 });
    expect(goalPos).toEqual({ x: 7, y: 7 });

    // 64 cells, packed 2-per-byte over 32 bytes; pattern [0x00, 0x05, 0xAA, 0xFF].
    // The pattern repeats every 4 bytes (= 8 cells = one row at width=8).
    // Row 0 cells [0..7] derive from bytes [0,1,2,3] = [0x00, 0x05, 0xAA, 0xFF]:
    //   0x00 -> [0, 0]    -> Normal/no walls, Normal/no walls
    //   0x05 -> [0, 5]    -> Normal/no walls, eastWall+Text(1)
    //   0xAA -> [A, A]    -> southWall+ZkText(2), southWall+ZkText(2)
    //   0xFF -> [F, F]    -> all walls + CrownText, all walls + CrownText
    expect(maze.cells[0][0]).toEqual({
      southWall: false,
      eastWall: false,
      cellType: CellType.Normal,
    });
    expect(maze.cells[0][3]).toEqual({
      southWall: false,
      eastWall: true,
      cellType: CellType.Text,
    });
    expect(maze.cells[0][4]).toEqual({
      southWall: true,
      eastWall: false,
      cellType: CellType.ZkText,
    });
    expect(maze.cells[0][7]).toEqual({
      southWall: true,
      eastWall: true,
      cellType: CellType.CrownText,
    });
  });

  it('accepts zero-padded layouts (TS encoder pads to LAYOUT_TOTAL_BYTES)', () => {
    // Build the same average fixture but pad to LAYOUT_TOTAL_BYTES — same as
    // serializeLayoutBytes does for the Pedersen circuit.
    const padded = new Uint8Array(LAYOUT_TOTAL_BYTES);
    padded.set(fixtureAverage(), 0);
    const { maze, startPos, goalPos } = mazeFromLayoutBytes(padded);
    expect(maze.width).toBe(4);
    expect(maze.height).toBe(4);
    expect(startPos).toEqual({ x: 0, y: 0 });
    expect(goalPos).toEqual({ x: 3, y: 3 });
  });

  it('round-trips through serializeLayoutBytes for ≥6 fixture seeds', () => {
    const seeds = [
      'fixture-one',
      'fixture-two',
      'maze♚ ♚king',
      'the quick brown fox',
      'roundtrip-7',
      'a',
      'longer test seed with spaces',
    ];
    for (const seed of seeds) {
      const layout = layoutBytesForSeed(seed);
      const decoded = mazeFromLayoutBytes(layout);
      const generated = generateMaze(seed);

      expect(decoded.maze.width).toBe(generated.maze.width);
      expect(decoded.maze.height).toBe(generated.maze.height);
      expect(decoded.startPos).toEqual(generated.kingPos);
      expect(decoded.robePos).toEqual(generated.robePos);
      expect(decoded.scepterPos).toEqual(generated.scepterPos);
      expect(decoded.goalPos).toEqual(generated.goalPos);

      // Cell-by-cell: every wall + cellType must match the source maze.
      for (let y = 0; y < decoded.maze.height; y++) {
        for (let x = 0; x < decoded.maze.width; x++) {
          expect(decoded.maze.cells[y][x]).toEqual(generated.maze.cells[y][x]);
        }
      }
    }
  });

  it('round-trips through serializeForZk -> serializeLayoutBytes', () => {
    const seed = 'serializeForZk-roundtrip';
    const generated = generateMaze(seed);
    const zk = serializeForZk(
      generated.maze,
      generated.kingPos,
      generated.robePos,
      generated.scepterPos,
      generated.goalPos
    );
    const layout = serializeLayoutBytes(zk);
    const decoded = mazeFromLayoutBytes(layout);
    expect(decoded.maze.width).toBe(zk.width);
    expect(decoded.maze.height).toBe(zk.height);
    expect(decoded.startPos).toEqual({ x: zk.startX, y: zk.startY });
  });

  it('throws on too-short layouts (< 20 bytes)', () => {
    expect(() => mazeFromLayoutBytes(new Uint8Array(19))).toThrow(/too short/);
  });

  it('throws on zero-width or zero-height layouts', () => {
    // Width 0, height 0 — header all zeroes.
    expect(() => mazeFromLayoutBytes(new Uint8Array(20))).toThrow(/empty/);
  });

  it('throws when packed cells are truncated', () => {
    // 4x4 needs 20 + ceil(16/2) = 28 bytes; provide 27.
    const layout = buildLayout(
      {
        width: 4,
        height: 4,
        startX: 0,
        startY: 0,
        robeX: 0,
        robeY: 0,
        scepterX: 0,
        scepterY: 0,
        goalX: 0,
        goalY: 0,
      },
      new Uint8Array(7) // truncated by 1
    );
    expect(() => mazeFromLayoutBytes(layout)).toThrow(/truncated/);
  });
});
