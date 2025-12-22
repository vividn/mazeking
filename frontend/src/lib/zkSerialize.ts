/**
 * ZK-friendly serialization for maze proofs.
 *
 * This module provides functions to serialize maze data in a format
 * compatible with the Noir maze_prover circuit.
 *
 * Cell encoding (4 bits per cell, packed 2 cells per byte):
 * - bit 3: southWall
 * - bit 2: eastWall
 * - bits 1-0: cellType (0=Normal, 1=Text, 2=ZkText, 3=CrownText)
 *
 * Byte packing: high nibble = even cell, low nibble = odd cell
 * Example: byte[0] contains cells[0] (high) and cells[1] (low)
 */

import { CellType, type Cell, type MazeData, type Position, Move } from '../types';

// Direction constants matching Noir
export const DIR_UP = 0;
export const DIR_RIGHT = 1;
export const DIR_DOWN = 2;
export const DIR_LEFT = 3;

/**
 * Encode a single cell into a 4-bit value.
 * bit 3: southWall, bit 2: eastWall, bits 1-0: cellType
 */
export function encodeCell(cell: Cell): number {
  let data = 0;
  if (cell.southWall) {
    data |= 0x08; // bit 3
  }
  if (cell.eastWall) {
    data |= 0x04; // bit 2
  }
  data |= (cell.cellType & 0x03); // bits 1-0
  return data;
}

/**
 * Decode a 4-bit cell value back to Cell structure.
 */
export function decodeCell(data: number): Cell {
  return {
    southWall: (data & 0x08) !== 0,
    eastWall: (data & 0x04) !== 0,
    cellType: (data & 0x03) as CellType,
  };
}

/**
 * Pack two 4-bit cells into one byte.
 * @param evenCell - Cell at even index (high nibble)
 * @param oddCell - Cell at odd index (low nibble)
 */
export function packCells(evenCell: number, oddCell: number): number {
  return ((evenCell & 0x0F) << 4) | (oddCell & 0x0F);
}

/**
 * Unpack a byte into two 4-bit cells.
 * @returns [evenCell, oddCell]
 */
export function unpackCells(byte: number): [number, number] {
  return [(byte >> 4) & 0x0F, byte & 0x0F];
}

/**
 * ZK maze data structure for proof generation.
 */
export interface ZkMazeData {
  width: number;
  height: number;
  startX: number;
  startY: number;
  keyX: number;
  keyY: number;
  goalX: number;
  goalY: number;
  packedCells: number[]; // Packed array (2 cells per byte)
}

/**
 * Serialize maze and positions into ZK-friendly format.
 */
export function serializeForZk(
  maze: MazeData,
  startPos: Position,
  keyPos: Position,
  goalPos: Position
): ZkMazeData {
  const { width, height, cells } = maze;
  const totalCells = width * height;

  // Encode all cells to 4-bit values (row-major order)
  const encodedCells: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      encodedCells.push(encodeCell(cells[y][x]));
    }
  }

  // Pack cells: 2 cells per byte
  const packedCells: number[] = [];
  for (let i = 0; i < encodedCells.length; i += 2) {
    const evenCell = encodedCells[i];
    const oddCell = i + 1 < encodedCells.length ? encodedCells[i + 1] : 0;
    packedCells.push(packCells(evenCell, oddCell));
  }

  return {
    width,
    height,
    startX: startPos.x,
    startY: startPos.y,
    keyX: keyPos.x,
    keyY: keyPos.y,
    goalX: goalPos.x,
    goalY: goalPos.y,
    packedCells,
  };
}

/**
 * Convert Move enum to direction constant.
 */
export function moveToDirection(move: Move): number {
  switch (move) {
    case Move.Up: return DIR_UP;
    case Move.Right: return DIR_RIGHT;
    case Move.Down: return DIR_DOWN;
    case Move.Left: return DIR_LEFT;
  }
}

/**
 * Convert Move[] to direction number array.
 */
export function serializeMoves(moves: Move[]): number[] {
  return moves.map(moveToDirection);
}

/**
 * Maximum cells supported by the prover (50x50).
 */
export const MAX_CELLS = 2500;

/**
 * Maximum packed bytes (MAX_CELLS / 2).
 */
export const MAX_PACKED_BYTES = 1250;

/**
 * Maximum moves supported by the prover.
 */
export const MAX_MOVES = 3000;

/**
 * Prover input structure matching Noir main function signature.
 */
export interface ProverInput {
  // Public inputs
  width: number;
  height: number;
  start_x: number;
  start_y: number;
  key_x: number;
  key_y: number;
  goal_x: number;
  goal_y: number;
  packed_cells: number[];  // Padded to MAX_PACKED_BYTES
  move_count: number;

  // Private inputs
  moves: number[];         // Padded to MAX_MOVES
}

/**
 * Generate prover input from maze data and solution path.
 *
 * @param zkMaze - ZK-serialized maze data
 * @param solutionMoves - Array of moves representing the solution
 * @returns ProverInput ready for Noir prover
 */
export function generateProverInput(
  zkMaze: ZkMazeData,
  solutionMoves: Move[]
): ProverInput {
  // Validate dimensions
  const totalCells = zkMaze.width * zkMaze.height;
  if (totalCells > MAX_CELLS) {
    throw new Error(`Maze too large: ${totalCells} cells exceeds max ${MAX_CELLS}`);
  }

  if (solutionMoves.length > MAX_MOVES) {
    throw new Error(`Too many moves: ${solutionMoves.length} exceeds max ${MAX_MOVES}`);
  }

  // Pad packed cells array to MAX_PACKED_BYTES
  const paddedPackedCells = [...zkMaze.packedCells];
  while (paddedPackedCells.length < MAX_PACKED_BYTES) {
    paddedPackedCells.push(0);
  }

  // Convert and pad moves array to MAX_MOVES
  const directions = serializeMoves(solutionMoves);
  const paddedMoves = [...directions];
  while (paddedMoves.length < MAX_MOVES) {
    paddedMoves.push(0);
  }

  return {
    width: zkMaze.width,
    height: zkMaze.height,
    start_x: zkMaze.startX,
    start_y: zkMaze.startY,
    key_x: zkMaze.keyX,
    key_y: zkMaze.keyY,
    goal_x: zkMaze.goalX,
    goal_y: zkMaze.goalY,
    packed_cells: paddedPackedCells,
    move_count: solutionMoves.length,
    moves: paddedMoves,
  };
}

/**
 * Generate Prover.toml content for the Noir prover.
 *
 * @param input - ProverInput structure
 * @returns TOML string for Prover.toml
 */
export function generateProverToml(input: ProverInput): string {
  const lines: string[] = [];

  // Public inputs
  lines.push(`width = ${input.width}`);
  lines.push(`height = ${input.height}`);
  lines.push(`start_x = ${input.start_x}`);
  lines.push(`start_y = ${input.start_y}`);
  lines.push(`key_x = ${input.key_x}`);
  lines.push(`key_y = ${input.key_y}`);
  lines.push(`goal_x = ${input.goal_x}`);
  lines.push(`goal_y = ${input.goal_y}`);
  lines.push(`move_count = ${input.move_count}`);

  // Packed cells array
  lines.push(`packed_cells = [${input.packed_cells.join(', ')}]`);

  // Moves array (private)
  lines.push(`moves = [${input.moves.join(', ')}]`);

  return lines.join('\n');
}

/**
 * Create a simple test maze for demonstration.
 * This creates a 10x10 maze with a clear path from start to key to goal.
 */
export function createTestMaze(): {
  maze: MazeData;
  startPos: Position;
  keyPos: Position;
  goalPos: Position;
  solution: Move[];
} {
  const width = 10;
  const height = 10;

  // Initialize all cells with both walls
  const cells: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      cells[y][x] = {
        southWall: true,
        eastWall: true,
        cellType: CellType.Normal,
      };
    }
  }

  // Create path: (0,0) -> right to (9,0) -> down to (9,9) -> left to (5,9)

  // Row 0: open corridor right (remove east walls)
  for (let x = 0; x < 9; x++) {
    cells[0][x].eastWall = false;
  }
  // (9,0) open down
  cells[0][9].southWall = false;

  // Column 9: open corridor down (remove south walls)
  for (let y = 1; y < 9; y++) {
    cells[y][9].southWall = false;
  }

  // Row 9: open corridor left from (9,9) to (5,9) (remove east walls from 4-8)
  for (let x = 4; x < 9; x++) {
    cells[9][x].eastWall = false;
  }

  const startPos: Position = { x: 0, y: 0 };
  const keyPos: Position = { x: 9, y: 0 };
  const goalPos: Position = { x: 5, y: 9 };

  // Solution: Right x9, Down x9, Left x4
  const solution: Move[] = [];
  for (let i = 0; i < 9; i++) solution.push(Move.Right);
  for (let i = 0; i < 9; i++) solution.push(Move.Down);
  for (let i = 0; i < 4; i++) solution.push(Move.Left);

  return {
    maze: { width, height, cells },
    startPos,
    keyPos,
    goalPos,
    solution,
  };
}

/**
 * Simulate a path and check if it's valid.
 * Returns true if the path collects the key and ends at goal without hitting walls.
 */
export function validatePath(
  maze: MazeData,
  startPos: Position,
  keyPos: Position,
  goalPos: Position,
  moves: Move[]
): { valid: boolean; error?: string } {
  const { width, height, cells } = maze;
  let pos = { ...startPos };
  let hasKey = pos.x === keyPos.x && pos.y === keyPos.y;

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];

    // Check if movement is allowed
    if (!canMove(maze, pos, move)) {
      return { valid: false, error: `Move ${i}: Cannot move ${Move[move]} from (${pos.x}, ${pos.y}) - wall` };
    }

    // Update position
    pos = getNewPosition(maze, pos, move);

    // Check key pickup
    if (pos.x === keyPos.x && pos.y === keyPos.y) {
      hasKey = true;
    }
  }

  if (!hasKey) {
    return { valid: false, error: 'Path does not collect the key' };
  }

  if (pos.x !== goalPos.x || pos.y !== goalPos.y) {
    return { valid: false, error: `Path ends at (${pos.x}, ${pos.y}), not goal (${goalPos.x}, ${goalPos.y})` };
  }

  return { valid: true };
}

/**
 * Check if movement is allowed (no wall blocking).
 * Matches the Noir can_move function exactly.
 */
function canMove(maze: MazeData, from: Position, move: Move): boolean {
  const { width, height, cells } = maze;
  const { x, y } = from;

  switch (move) {
    case Move.Up: {
      const aboveY = (y - 1 + height) % height;
      return !cells[aboveY][x].southWall;
    }
    case Move.Down: {
      return !cells[y][x].southWall;
    }
    case Move.Left: {
      const leftX = (x - 1 + width) % width;
      return !cells[y][leftX].eastWall;
    }
    case Move.Right: {
      return !cells[y][x].eastWall;
    }
  }
}

/**
 * Get new position after a move (with toroidal wrapping).
 */
function getNewPosition(maze: MazeData, from: Position, move: Move): Position {
  const { width, height } = maze;
  const { x, y } = from;

  switch (move) {
    case Move.Up:
      return { x, y: (y - 1 + height) % height };
    case Move.Down:
      return { x, y: (y + 1) % height };
    case Move.Left:
      return { x: (x - 1 + width) % width, y };
    case Move.Right:
      return { x: (x + 1) % width, y };
  }
}
