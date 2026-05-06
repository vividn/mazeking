/**
 * Decode canonical layout bytes back into a playable maze.
 *
 * Mirrors `MazeRenderer._decodeHeader` + the cell-nibble decode in
 * `contracts/src/MazeRenderer.sol`, and inverts `serializeLayoutBytes`
 * from `tokenId.ts`. With this we can replay any owned token straight
 * from `layouts(tokenId)` — no seed needed.
 *
 * Layout (matches MazeRenderer doc-comment):
 *   bytes[ 0:2 ]  width   (big-endian u16)
 *   bytes[ 2:4 ]  height
 *   bytes[ 4:6 ]  startX
 *   bytes[ 6:8 ]  startY
 *   bytes[ 8:10] robeX
 *   bytes[10:12] robeY
 *   bytes[12:14] scepterX
 *   bytes[14:16] scepterY
 *   bytes[16:18] goalX
 *   bytes[18:20] goalY
 *   bytes[20: ]  packed_cells (high nibble = even index, low nibble = odd)
 *
 * Each 4-bit cell nibble:
 *   bit 3: south wall, bit 2: east wall, bits 1-0: cellType (0..3).
 */
import { CellType, type Cell, type SerializedMaze } from '../types';
import { LAYOUT_HEADER_BYTES } from './mazeConstants.generated';

function readU16BE(layout: Uint8Array, offset: number): number {
  return (layout[offset] << 8) | layout[offset + 1];
}

function cellAt(layout: Uint8Array, idx: number): number {
  const byte = layout[LAYOUT_HEADER_BYTES + (idx >> 1)];
  return (idx & 1) === 0 ? (byte >> 4) & 0x0f : byte & 0x0f;
}

export function mazeFromLayoutBytes(layout: Uint8Array): SerializedMaze {
  if (layout.length < LAYOUT_HEADER_BYTES) {
    throw new Error(
      `Layout too short: ${layout.length} bytes, need >= ${LAYOUT_HEADER_BYTES}`
    );
  }

  const width = readU16BE(layout, 0);
  const height = readU16BE(layout, 2);
  if (width === 0 || height === 0) {
    throw new Error(`Empty maze (width=${width}, height=${height})`);
  }

  const totalCells = width * height;
  const expected = LAYOUT_HEADER_BYTES + Math.ceil(totalCells / 2);
  if (layout.length < expected) {
    throw new Error(
      `Layout truncated: ${layout.length} bytes, need >= ${expected} for ${width}x${height}`
    );
  }

  const startPlayerPos = { x: readU16BE(layout, 4), y: readU16BE(layout, 6) };
  const startRobePos = { x: readU16BE(layout, 8), y: readU16BE(layout, 10) };
  const startScepterPos = {
    x: readU16BE(layout, 12),
    y: readU16BE(layout, 14),
  };
  const startGoalPos = { x: readU16BE(layout, 16), y: readU16BE(layout, 18) };

  const cells: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Cell[] = new Array(width);
    for (let x = 0; x < width; x++) {
      const nibble = cellAt(layout, y * width + x);
      row[x] = {
        southWall: (nibble & 0x08) !== 0,
        eastWall: (nibble & 0x04) !== 0,
        cellType: (nibble & 0x03) as CellType,
      };
    }
    cells[y] = row;
  }

  return {
    maze: { width, height, cells },
    startPlayerPos,
    startRobePos,
    startScepterPos,
    startGoalPos,
  };
}

/**
 * Hex (0x-prefixed or bare) representation of layout bytes back to Uint8Array.
 * Matches the contract's `bytes layouts(tokenId)` getter, which Viem returns
 * as a `0x...` hex string.
 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`Invalid hex length: ${clean.length}`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
