import type { Cell, Position, MazeData, Move } from '../types';

/**
 * Serializes a maze and its key positions into a compact binary format.
 * Each cell uses 3 bits: southWall (1 bit) + eastWall (1 bit) + isTextCell (1 bit)
 * Format: [width: 2 bytes][height: 2 bytes][kingPos: 4 bytes][keyPos: 4 bytes][doorPos: 4 bytes][cells: variable]
 */
export function serializeMaze(
  maze: MazeData,
  kingPos: Position,
  keyPos: Position,
  doorPos: Position
): string {
  const { width, height, cells } = maze;

  // Calculate total bits needed for cells
  const totalCells = width * height;
  const cellBits = totalCells * 3;
  const cellBytes = Math.ceil(cellBits / 8);

  // Total buffer: 2 (width) + 2 (height) + 4 (kingPos) + 4 (keyPos) + 4 (doorPos) + cellBytes
  const buffer = new ArrayBuffer(2 + 2 + 4 + 4 + 4 + cellBytes);
  const view = new DataView(buffer);
  const byteArray = new Uint8Array(buffer);

  let offset = 0;

  // Write width and height (16-bit unsigned integers)
  view.setUint16(offset, width, false); // big-endian
  offset += 2;
  view.setUint16(offset, height, false);
  offset += 2;

  // Write positions (2 bytes per coordinate, 4 bytes per position)
  view.setUint16(offset, kingPos.x, false);
  offset += 2;
  view.setUint16(offset, kingPos.y, false);
  offset += 2;

  view.setUint16(offset, keyPos.x, false);
  offset += 2;
  view.setUint16(offset, keyPos.y, false);
  offset += 2;

  view.setUint16(offset, doorPos.x, false);
  offset += 2;
  view.setUint16(offset, doorPos.y, false);
  offset += 2;

  // Pack cell data into bits
  let bitOffset = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];

      // Pack 3 bits: [southWall][eastWall][isTextCell]
      const cellValue =
        (cell.southWall ? 4 : 0) |
        (cell.eastWall ? 2 : 0) |
        (cell.isTextCell ? 1 : 0);

      // Write 3 bits to the appropriate byte position
      const byteIndex = offset + Math.floor(bitOffset / 8);
      const bitInByte = bitOffset % 8;

      // Shift the 3-bit value to the correct position and OR it in
      byteArray[byteIndex] |= (cellValue << (5 - bitInByte));

      bitOffset += 3;
    }
  }

  // Convert to hex string
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Deserializes a maze from its binary format.
 */
export function deserializeMaze(data: string): {
  maze: MazeData;
  kingPos: Position;
  keyPos: Position;
  doorPos: Position;
} {
  // Convert hex string to buffer
  const bytes = new Uint8Array(data.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const buffer = bytes.buffer;
  const view = new DataView(buffer);

  let offset = 0;

  // Read width and height
  const width = view.getUint16(offset, false);
  offset += 2;
  const height = view.getUint16(offset, false);
  offset += 2;

  // Read positions
  const kingPos: Position = {
    x: view.getUint16(offset, false),
    y: view.getUint16(offset + 2, false)
  };
  offset += 4;

  const keyPos: Position = {
    x: view.getUint16(offset, false),
    y: view.getUint16(offset + 2, false)
  };
  offset += 4;

  const doorPos: Position = {
    x: view.getUint16(offset, false),
    y: view.getUint16(offset + 2, false)
  };
  offset += 4;

  // Unpack cell data
  const cells: Cell[][] = Array.from({ length: height }, () => []);
  let bitOffset = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byteIndex = offset + Math.floor(bitOffset / 8);
      const bitInByte = bitOffset % 8;

      // Extract 3 bits
      const cellValue = (bytes[byteIndex] >> (5 - bitInByte)) & 0b111;

      cells[y][x] = {
        southWall: (cellValue & 4) !== 0,
        eastWall: (cellValue & 2) !== 0,
        isTextCell: (cellValue & 1) !== 0
      };

      bitOffset += 3;
    }
  }

  return {
    maze: { cells, width, height },
    kingPos,
    keyPos,
    doorPos
  };
}

/**
 * Serializes a sequence of moves into a compact binary format.
 * Each move uses 2 bits: 00=up, 01=down, 10=left, 11=right
 */
export function serializeMoves(moves: Move[]): string {
  if (moves.length === 0) return '';

  const totalBits = moves.length * 2;
  const totalBytes = Math.ceil(totalBits / 8);
  const bytes = new Uint8Array(totalBytes);

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const bitOffset = i * 2;
    const byteIndex = Math.floor(bitOffset / 8);
    const bitInByte = bitOffset % 8;

    // Pack 2 bits for this move
    bytes[byteIndex] |= (move << (6 - bitInByte));
  }

  // Convert to hex string
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Deserializes a sequence of moves from binary format.
 */
export function deserializeMoves(data: string): Move[] {
  if (!data) return [];

  const bytes = new Uint8Array(data.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const moves: Move[] = [];

  // We need to know how many moves there are
  // Since each move is 2 bits, and we have bytes.length bytes:
  const totalBits = bytes.length * 8;
  const maxMoves = Math.floor(totalBits / 2);

  for (let i = 0; i < maxMoves; i++) {
    const bitOffset = i * 2;
    const byteIndex = Math.floor(bitOffset / 8);
    const bitInByte = bitOffset % 8;

    // Extract 2 bits
    const move = ((bytes[byteIndex] >> (6 - bitInByte)) & 0b11) as Move;

    // Stop if we hit padding (all zeros at the end)
    // This is a heuristic - in production you'd want to store move count
    if (move === 0 && i > 0 && bitInByte === 6) {
      // Could be padding, check if remaining bits are all zero
      let isPadding = true;
      for (let j = byteIndex; j < bytes.length; j++) {
        if (bytes[j] !== 0) {
          isPadding = false;
          break;
        }
      }
      if (isPadding) break;
    }

    moves.push(move);
  }

  return moves;
}
