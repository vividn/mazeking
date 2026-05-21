/**
 * ⚠️ CONSENSUS-CRITICAL FILE — see ma-5yi
 *
 * Maze carving: empty-grid construction, letter-internal spanning trees,
 * letter boundary walls, letter entry points, Kruskal carving of non-text
 * regions, cycle injection, debug-mode wall blowout, and king/robe/scepter/
 * goal placement. Every wall-removing function here writes into the
 * packed-cell bytes that get hashed to produce `mazeHash` → tokenID. Any
 * change to a function's algorithm, RNG draw order, or wall-iteration order
 * silently re-mints every existing seed under a new tokenID.
 *
 * Post-mainnet edits require a coordinated migration plan AND a
 * `consensus-critical-change: <bead-id>` line in the commit body.
 * Pre-mainnet edits must regenerate Pedersen fixtures
 * (`just regen-pedersen-fixtures`) and re-run the full test suite.
 *
 * The lint gate `just check-consensus-critical` enforces marker presence
 * and commit-message acks for changes to this file.
 */
import { type Rng } from './seededRandom';
import {
  getCharPattern,
  getCharacterBoundaries,
  calculateEntryCountRange,
} from './pixelFont';
import { CellType, type Cell, type MazeData, type Position } from '../types';
import type { CharPlacement } from './wordmarkPlacement';

// Helper to check if a cell is any type of text cell
function isTextCell(cell: Cell): boolean {
  return cell.cellType !== CellType.Normal;
}

export function createEmptyMaze(width: number, height: number): MazeData {
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
  return { cells, width, height };
}

// Create internal paths through each character using a simple spanning tree
export function createInternalLetterPaths(
  maze: MazeData,
  placements: CharPlacement[],
  rng: Rng
): void {
  const { width, height, cells } = maze;

  for (const placement of placements) {
    const charPattern = getCharPattern(placement.char);
    if (!charPattern) continue;

    // Collect all text cells within this character
    const textCells: Position[] = [];
    for (let py = 0; py < charPattern.length; py++) {
      for (let px = 0; px < charPattern[py].length; px++) {
        if (charPattern[py][px]) {
          const cellX = placement.startX + px;
          const cellY = placement.startY + py;
          if (cellX >= 0 && cellX < width && cellY >= 0 && cellY < height) {
            textCells.push({ x: cellX, y: cellY });
          }
        }
      }
    }

    if (textCells.length === 0) continue;

    // Create a spanning tree through this character's text cells
    // Use Union-Find to track connectivity
    const parent = new Map<string, string>();
    const key = (p: Position) => `${p.x},${p.y}`;

    for (const cell of textCells) {
      parent.set(key(cell), key(cell));
    }

    const find = (k: string): string => {
      if (parent.get(k) !== k) {
        parent.set(k, find(parent.get(k)!));
      }
      return parent.get(k)!;
    };

    const union = (a: string, b: string): boolean => {
      const pa = find(a);
      const pb = find(b);
      if (pa === pb) return false;
      parent.set(pa, pb);
      return true;
    };

    // Collect internal walls between text cells
    interface InternalWall {
      from: Position;
      to: Position;
      direction: 'S' | 'E';
    }

    const walls: InternalWall[] = [];

    for (const cell of textCells) {
      // Check south neighbor
      const southPos = { x: cell.x, y: cell.y + 1 };
      if (textCells.some((c) => c.x === southPos.x && c.y === southPos.y)) {
        walls.push({ from: cell, to: southPos, direction: 'S' });
      }
      // Check east neighbor
      const eastPos = { x: cell.x + 1, y: cell.y };
      if (textCells.some((c) => c.x === eastPos.x && c.y === eastPos.y)) {
        walls.push({ from: cell, to: eastPos, direction: 'E' });
      }
    }

    // Shuffle and remove walls to create spanning tree
    const shuffled = rng.shuffle(walls);

    for (const wall of shuffled) {
      const fromKey = key(wall.from);
      const toKey = key(wall.to);

      if (union(fromKey, toKey)) {
        // Remove this wall to create passage
        if (wall.direction === 'S') {
          cells[wall.from.y][wall.from.x].southWall = false;
        } else {
          cells[wall.from.y][wall.from.x].eastWall = false;
        }
      }
    }
  }
}

// Set up boundary walls around each character (walls between text and non-text cells)
export function createLetterBoundaryWalls(maze: MazeData): void {
  const { width, height, cells } = maze;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];

      if (isTextCell(cell)) {
        // Check south - if neighbor is not text, ensure wall exists
        const sy = (y + 1) % height;
        if (!isTextCell(cells[sy][x])) {
          cell.southWall = true;
        }

        // Check east - if neighbor is not text, ensure wall exists
        const ex = (x + 1) % width;
        if (!isTextCell(cells[y][ex])) {
          cell.eastWall = true;
        }
      } else {
        // Non-text cell: check if neighbors are text cells
        const sy = (y + 1) % height;
        if (isTextCell(cells[sy][x])) {
          cell.southWall = true;
        }

        const ex = (x + 1) % width;
        if (isTextCell(cells[y][ex])) {
          cell.eastWall = true;
        }
      }
    }
  }
}

// Create entry points connecting letters to the maze (external boundaries)
// and connecting letter cells to enclosed regions (internal boundaries)
export function createLetterEntryPoints(
  maze: MazeData,
  placements: CharPlacement[],
  rng: Rng
): void {
  const { width, height, cells } = maze;

  for (const placement of placements) {
    const boundaries = getCharacterBoundaries(placement.char);

    // External entries: each disconnected filled region gets its own entry points
    // This ensures characters like '?' or ':' have all parts accessible
    for (const filledRegion of boundaries.external) {
      const externalRange = calculateEntryCountRange(
        filledRegion.length,
        false
      );
      const numExternal = rng.nextInt(externalRange.min, externalRange.max);
      const selectedExternal = rng.shuffle(filledRegion).slice(0, numExternal);

      for (const entry of selectedExternal) {
        const cellX = placement.startX + entry.x;
        const cellY = placement.startY + entry.y;

        if (cellX < 0 || cellX >= width || cellY < 0 || cellY >= height)
          continue;

        // Remove the wall in the direction specified by the entry point
        removeWallForEntry(
          cells,
          cellX,
          cellY,
          entry.side,
          width,
          height,
          false
        );
      }
    }

    // Internal entries: random count per enclosed empty region (min 1, max scales with region size)
    // These connect letter cells TO enclosed empty regions (like inside 'o' or 'B')
    for (const region of boundaries.internal) {
      const internalRange = calculateEntryCountRange(region.length, true);
      const numInternal = rng.nextInt(internalRange.min, internalRange.max);
      const selectedInternal = rng.shuffle(region).slice(0, numInternal);

      for (const entry of selectedInternal) {
        const cellX = placement.startX + entry.x;
        const cellY = placement.startY + entry.y;

        if (cellX < 0 || cellX >= width || cellY < 0 || cellY >= height)
          continue;

        // Remove wall between letter cell and enclosed region
        removeWallForEntry(
          cells,
          cellX,
          cellY,
          entry.side,
          width,
          height,
          true
        );
      }
    }
  }
}

// Helper to remove wall for an entry point
function removeWallForEntry(
  cells: Cell[][],
  cellX: number,
  cellY: number,
  side: 'top' | 'bottom' | 'left' | 'right',
  width: number,
  height: number,
  isInternal: boolean
): void {
  switch (side) {
    case 'top': {
      // Remove wall from cell above (its south wall)
      const aboveY = cellY - 1;
      if (aboveY >= 0) {
        // For internal entries, we allow connecting to non-text cells (the enclosed region)
        // For external entries, we only connect if neighbor is not a text cell
        if (isInternal || !isTextCell(cells[aboveY][cellX])) {
          cells[aboveY][cellX].southWall = false;
        }
      }
      break;
    }
    case 'bottom': {
      // Remove this cell's south wall
      const belowY = (cellY + 1) % height;
      if (isInternal || !isTextCell(cells[belowY][cellX])) {
        cells[cellY][cellX].southWall = false;
      }
      break;
    }
    case 'left': {
      // Remove wall from cell to left (its east wall)
      const leftX = cellX - 1;
      if (leftX >= 0) {
        if (isInternal || !isTextCell(cells[cellY][leftX])) {
          cells[cellY][leftX].eastWall = false;
        }
      }
      break;
    }
    case 'right': {
      // Remove this cell's east wall
      const rightX = (cellX + 1) % width;
      if (isInternal || !isTextCell(cells[cellY][rightX])) {
        cells[cellY][cellX].eastWall = false;
      }
      break;
    }
  }
}

// Generate maze paths for non-text areas using Kruskal's algorithm
export function generateNonTextMazePaths(maze: MazeData, rng: Rng): void {
  const { width, height, cells } = maze;

  const parent: number[] = [];
  const rank: number[] = [];

  for (let i = 0; i < width * height; i++) {
    parent[i] = i;
    rank[i] = 0;
  }

  function find(x: number): number {
    if (parent[x] !== x) {
      parent[x] = find(parent[x]);
    }
    return parent[x];
  }

  function union(x: number, y: number): boolean {
    const px = find(x);
    const py = find(y);
    if (px === py) return false;

    if (rank[px] < rank[py]) {
      parent[px] = py;
    } else if (rank[px] > rank[py]) {
      parent[py] = px;
    } else {
      parent[py] = px;
      rank[px]++;
    }
    return true;
  }

  function cellIndex(x: number, y: number): number {
    return y * width + x;
  }

  // Pre-union all adjacent text cells that are already connected (no wall between)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx1 = cellIndex(x, y);

      // South
      const sy = (y + 1) % height;
      if (!cells[y][x].southWall) {
        union(idx1, cellIndex(x, sy));
      }

      // East
      const ex = (x + 1) % width;
      if (!cells[y][x].eastWall) {
        union(idx1, cellIndex(ex, y));
      }
    }
  }

  // Collect walls between non-text cells only
  interface Wall {
    x: number;
    y: number;
    direction: 'S' | 'E';
  }

  const walls: Wall[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];
      if (isTextCell(cell)) continue; // Skip text cells

      // South wall
      const sy = (y + 1) % height;
      if (!isTextCell(cells[sy][x]) && cell.southWall) {
        walls.push({ x, y, direction: 'S' });
      }

      // East wall
      const ex = (x + 1) % width;
      if (!isTextCell(cells[y][ex]) && cell.eastWall) {
        walls.push({ x, y, direction: 'E' });
      }
    }
  }

  // Shuffle and process walls
  const shuffledWalls = rng.shuffle(walls);

  for (const wall of shuffledWalls) {
    const { x, y, direction } = wall;
    const idx1 = cellIndex(x, y);

    let nx: number, ny: number;
    if (direction === 'S') {
      nx = x;
      ny = (y + 1) % height;
    } else {
      nx = (x + 1) % width;
      ny = y;
    }

    const idx2 = cellIndex(nx, ny);

    if (union(idx1, idx2)) {
      if (direction === 'S') {
        cells[y][x].southWall = false;
      } else {
        cells[y][x].eastWall = false;
      }
    }
  }
}

export function findValidPositions(
  maze: MazeData,
  rng: Rng
): {
  kingPos: Position;
  robePos: Position;
  scepterPos: Position;
  goalPos: Position;
} {
  const { width, height, cells } = maze;

  const candidates: Position[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isTextCell(cells[y][x])) {
        candidates.push({ x, y });
      }
    }
  }

  const pool =
    candidates.length >= 4
      ? candidates
      : Array.from({ length: width * height }, (_, i) => ({
          x: i % width,
          y: Math.floor(i / width),
        }));

  const shuffled = rng.shuffle(pool);

  const kingPos = shuffled[0];

  // Robe: prefer a cell at least width/3 from the king.
  let robePos = shuffled[1];
  for (const pos of shuffled.slice(1)) {
    const dist = Math.abs(pos.x - kingPos.x) + Math.abs(pos.y - kingPos.y);
    if (dist > width / 3) {
      robePos = pos;
      break;
    }
  }

  // Scepter: prefer a cell at least width/3 from both king and robe.
  let scepterPos = shuffled[2];
  for (const pos of shuffled.slice(2)) {
    if (
      (pos.x === kingPos.x && pos.y === kingPos.y) ||
      (pos.x === robePos.x && pos.y === robePos.y)
    ) {
      continue;
    }
    const distKing = Math.abs(pos.x - kingPos.x) + Math.abs(pos.y - kingPos.y);
    const distRobe = Math.abs(pos.x - robePos.x) + Math.abs(pos.y - robePos.y);
    if (distKing > width / 3 && distRobe > width / 3) {
      scepterPos = pos;
      break;
    }
  }

  // Goal: prefer a cell well away from king, robe, and scepter.
  let goalPos = shuffled[3];
  for (const pos of shuffled.slice(3)) {
    if (
      (pos.x === kingPos.x && pos.y === kingPos.y) ||
      (pos.x === robePos.x && pos.y === robePos.y) ||
      (pos.x === scepterPos.x && pos.y === scepterPos.y)
    ) {
      continue;
    }
    const distKing = Math.abs(pos.x - kingPos.x) + Math.abs(pos.y - kingPos.y);
    const distRobe = Math.abs(pos.x - robePos.x) + Math.abs(pos.y - robePos.y);
    const distScepter =
      Math.abs(pos.x - scepterPos.x) + Math.abs(pos.y - scepterPos.y);
    if (
      distKing > width / 4 &&
      distRobe > width / 4 &&
      distScepter > width / 4
    ) {
      goalPos = pos;
      break;
    }
  }

  return { kingPos, robePos, scepterPos, goalPos };
}

// CONSENSUS-CRITICAL: cycle-injection ratio determines which extra walls are
// removed → packed-cell bytes → mazeHash. Fraction of remaining internal
// non-text walls to knock down after the spanning-tree maze is built,
// introducing cycles so multiple paths exist between any two cells (vs the
// single path a pure spanning tree gives).
const EXTRA_PATH_WALL_REMOVAL_RATIO = 0.02;

// Remove ~EXTRA_PATH_WALL_REMOVAL_RATIO of remaining internal walls between
// non-text cells to add path variety / cycles to the spanning-tree maze.
//
// Determinism: candidate walls are enumerated in canonical row-major order
// (south before east per cell), then selected via the same seeded RNG stream
// that drove generation. Same (seed, dimensions) → same selection. Outer-
// boundary (wraparound) walls and walls touching text cells are excluded.
export function removeExtraWallsForPathVariety(maze: MazeData, rng: Rng): void {
  const { width, height, cells } = maze;

  interface Candidate {
    x: number;
    y: number;
    direction: 'S' | 'E';
  }
  const candidates: Candidate[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];
      if (isTextCell(cell)) continue;

      // South wall — skip outer perimeter (wraps) and text-adjacent walls
      if (cell.southWall && y < height - 1 && !isTextCell(cells[y + 1][x])) {
        candidates.push({ x, y, direction: 'S' });
      }
      // East wall — skip outer perimeter (wraps) and text-adjacent walls
      if (cell.eastWall && x < width - 1 && !isTextCell(cells[y][x + 1])) {
        candidates.push({ x, y, direction: 'E' });
      }
    }
  }

  if (candidates.length === 0) return;

  const target = Math.max(
    1,
    Math.round(candidates.length * EXTRA_PATH_WALL_REMOVAL_RATIO)
  );

  const shuffled = rng.shuffle(candidates);
  for (let i = 0; i < target; i++) {
    const wall = shuffled[i];
    if (wall.direction === 'S') {
      cells[wall.y][wall.x].southWall = false;
    } else {
      cells[wall.y][wall.x].eastWall = false;
    }
  }
}

const DEBUG_WALL_REMOVAL_PROBABILITY = 0.66;

// Remove ~66% of remaining internal walls between non-text cells.
// Leaves wordmark/letter boundaries and outer perimeter intact so the maze
// still renders correctly but is trivial to solve.
export function debugRemoveInternalWalls(maze: MazeData, rng: Rng): void {
  const { width, height, cells } = maze;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];
      if (isTextCell(cell)) continue;

      // East wall — skip outer perimeter (rightmost column wraps around)
      if (cell.eastWall && x < width - 1) {
        const east = cells[y][x + 1];
        if (!isTextCell(east) && rng.next() < DEBUG_WALL_REMOVAL_PROBABILITY) {
          cell.eastWall = false;
        }
      }

      // South wall — skip outer perimeter (bottom row wraps around)
      if (cell.southWall && y < height - 1) {
        const south = cells[y + 1][x];
        if (!isTextCell(south) && rng.next() < DEBUG_WALL_REMOVAL_PROBABILITY) {
          cell.southWall = false;
        }
      }
    }
  }
}

export function canMove(
  maze: MazeData,
  from: Position,
  direction: 'up' | 'down' | 'left' | 'right'
): boolean {
  const { width, height, cells } = maze;
  const { x, y } = from;

  switch (direction) {
    case 'up': {
      const aboveY = (y - 1 + height) % height;
      return !cells[aboveY][x].southWall;
    }
    case 'down': {
      return !cells[y][x].southWall;
    }
    case 'left': {
      const leftX = (x - 1 + width) % width;
      return !cells[y][leftX].eastWall;
    }
    case 'right': {
      return !cells[y][x].eastWall;
    }
  }
}

export function getNewPosition(
  maze: MazeData,
  from: Position,
  direction: 'up' | 'down' | 'left' | 'right'
): Position {
  const { width, height } = maze;
  const { x, y } = from;

  switch (direction) {
    case 'up':
      return { x, y: (y - 1 + height) % height };
    case 'down':
      return { x, y: (y + 1) % height };
    case 'left':
      return { x: (x - 1 + width) % width, y };
    case 'right':
      return { x: (x + 1) % width, y };
  }
}
