/**
 * Decode the canonical on-chain layout bytes into a playable maze structure.
 *
 * This is the inverse of `serializeLayoutBytes` (`tokenId.ts`) and the TS
 * mirror of `MazeRenderer._decodeHeader` + cell-nibble decode in
 * `contracts/src/MazeRenderer.sol`. Replay flows can call this to recover a
 * full `MazeData` (cells + entity positions) from `MazeKingNFT.layouts(id)`
 * without ever needing the original seed string.
 *
 * Format (MUST stay byte-aligned with the Solidity decoder):
 *   bytes[ 0..20] = 10 BE u16: width, height, startX, startY, robeX, robeY,
 *                              scepterX, scepterY, goalX, goalY
 *   bytes[20..]   = ceil(width*height / 2) packed cells. High nibble = even
 *                   row-major index, low nibble = odd. Within a nibble:
 *                     bit 3: south wall, bit 2: east wall,
 *                     bits 1-0: cell type (0=Normal,1=Text,2=ZkText,3=CrownText)
 *
 * The TS encoder zero-pads each layout to LAYOUT_TOTAL_BYTES (1520) so the
 * Pedersen circuit sees a fixed-size buffer; trailing zeros past the
 * width*height cell count are ignored here, matching the Solidity decoder.
 */

import { CellType, type Cell, type MazeData, type Position } from '../types';

export interface DecodedLayout {
  maze: MazeData;
  startPos: Position;
  robePos: Position;
  scepterPos: Position;
  goalPos: Position;
}

const HEADER_BYTES = 20;

function readU16BE(layout: Uint8Array, offset: number): number {
  return ((layout[offset] << 8) | layout[offset + 1]) & 0xffff;
}

/// Read the row-major cell at `idx` from the packed cells region. High nibble
/// is the even index, low nibble is the odd — matches `MazeRenderer._cellAt`.
function readCellNibble(layout: Uint8Array, idx: number): number {
  const byteIdx = HEADER_BYTES + (idx >> 1);
  const b = layout[byteIdx];
  return (idx & 1) === 0 ? (b >> 4) & 0x0f : b & 0x0f;
}

export function mazeFromLayoutBytes(layout: Uint8Array): DecodedLayout {
  if (layout.length < HEADER_BYTES) {
    throw new Error(
      `mazeFromLayoutBytes: layout too short (${layout.length} < ${HEADER_BYTES})`
    );
  }

  const width = readU16BE(layout, 0);
  const height = readU16BE(layout, 2);
  if (width === 0 || height === 0) {
    throw new Error(
      `mazeFromLayoutBytes: empty maze (width=${width}, height=${height})`
    );
  }

  const totalCells = width * height;
  const requiredBytes = HEADER_BYTES + Math.ceil(totalCells / 2);
  if (layout.length < requiredBytes) {
    throw new Error(
      `mazeFromLayoutBytes: layout truncated (${layout.length} < ${requiredBytes} for ${width}x${height})`
    );
  }

  const startPos: Position = {
    x: readU16BE(layout, 4),
    y: readU16BE(layout, 6),
  };
  const robePos: Position = {
    x: readU16BE(layout, 8),
    y: readU16BE(layout, 10),
  };
  const scepterPos: Position = {
    x: readU16BE(layout, 12),
    y: readU16BE(layout, 14),
  };
  const goalPos: Position = {
    x: readU16BE(layout, 16),
    y: readU16BE(layout, 18),
  };

  const cells: Cell[][] = new Array(height);
  for (let y = 0; y < height; y++) {
    const row: Cell[] = new Array(width);
    for (let x = 0; x < width; x++) {
      const nibble = readCellNibble(layout, y * width + x);
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
    startPos,
    robePos,
    scepterPos,
    goalPos,
  };
}
