import { createRng, type Rng } from './seededRandom';
import { getCharWidth, getTextDimensions, getCharPattern, getCharacterBoundaries, calculateEntryCount } from './pixelFont';
import type { Cell, MazeData, Position } from '../types';

const CHAR_HEIGHT = 8;
const CHAR_SPACING = 1;
const MARGIN_CHARS = 1.5; // 1.5 character-widths of margin

interface TextLayout {
  lines: string[];
  width: number;
  height: number;
}

// Track character positions for creating entry points
interface CharPlacement {
  char: string;
  startX: number;
  startY: number;
  width: number;
  height: number;
}

function layoutText(text: string, maxWidthChars: number): TextLayout {
  // Keep original case - we now support both uppercase and lowercase
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine === '') {
      currentLine = word;
    } else {
      const testLine = currentLine + ' ' + word;
      const testWidth = getTextDimensions(testLine).width;
      if (testWidth <= maxWidthChars * 6) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  let maxWidth = 0;
  for (const line of lines) {
    const dims = getTextDimensions(line);
    maxWidth = Math.max(maxWidth, dims.width);
  }

  return {
    lines,
    width: maxWidth,
    height: lines.length * (CHAR_HEIGHT + CHAR_SPACING) - CHAR_SPACING
  };
}

function calculateMazeDimensions(text: string): { width: number; height: number; textLayout: TextLayout } {
  const maxTextWidthChars = 20;
  const textLayout = layoutText(text, maxTextWidthChars);
  const marginCells = Math.ceil(MARGIN_CHARS * 6);
  const width = textLayout.width + marginCells * 2;
  const height = textLayout.height + marginCells * 2;
  const minSize = 20;

  return {
    width: Math.max(width, minSize),
    height: Math.max(height, minSize),
    textLayout
  };
}

function createEmptyMaze(width: number, height: number): MazeData {
  const cells: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      cells[y][x] = {
        southWall: true,
        eastWall: true,
        isTextCell: false,
        isZkCell: false
      };
    }
  }
  return { cells, width, height };
}

// Mark text cells and track character placements for connectivity
function embedTextCells(maze: MazeData, textLayout: TextLayout): CharPlacement[] {
  const { width, height, cells } = maze;
  const placements: CharPlacement[] = [];

  const startX = Math.floor((width - textLayout.width) / 2);
  const startY = Math.floor((height - textLayout.height) / 2);

  let currentY = startY;

  for (const line of textLayout.lines) {
    const lineDims = getTextDimensions(line);
    let currentX = startX + Math.floor((textLayout.width - lineDims.width) / 2);

    for (const char of line) {
      const charPattern = getCharPattern(char);
      if (!charPattern) {
        currentX += 4;
        continue;
      }

      const charWidth = getCharWidth(char);

      // Track this character's placement
      placements.push({
        char,
        startX: currentX,
        startY: currentY,
        width: charWidth,
        height: CHAR_HEIGHT
      });

      // Check if this is a Z or K letter (case-insensitive) for ZK highlight
      const isZkLetter = char.toUpperCase() === 'Z' || char.toUpperCase() === 'K';

      // Mark all filled cells as text cells
      for (let py = 0; py < charPattern.length; py++) {
        for (let px = 0; px < charPattern[py].length; px++) {
          const cellX = currentX + px;
          const cellY = currentY + py;

          if (cellX >= 0 && cellX < width && cellY >= 0 && cellY < height) {
            if (charPattern[py][px]) {
              cells[cellY][cellX].isTextCell = true;
              // Mark Z and K letters specially for zero-knowledge highlight
              if (isZkLetter) {
                cells[cellY][cellX].isZkCell = true;
              }
            }
          }
        }
      }

      currentX += charWidth + CHAR_SPACING;
    }

    currentY += CHAR_HEIGHT + CHAR_SPACING;
  }

  return placements;
}

// Create internal paths through each character using a simple spanning tree
function createInternalLetterPaths(maze: MazeData, placements: CharPlacement[], rng: Rng): void {
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

    function find(k: string): string {
      if (parent.get(k) !== k) {
        parent.set(k, find(parent.get(k)!));
      }
      return parent.get(k)!;
    }

    function union(a: string, b: string): boolean {
      const pa = find(a);
      const pb = find(b);
      if (pa === pb) return false;
      parent.set(pa, pb);
      return true;
    }

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
      if (textCells.some(c => c.x === southPos.x && c.y === southPos.y)) {
        walls.push({ from: cell, to: southPos, direction: 'S' });
      }
      // Check east neighbor
      const eastPos = { x: cell.x + 1, y: cell.y };
      if (textCells.some(c => c.x === eastPos.x && c.y === eastPos.y)) {
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
function createLetterBoundaryWalls(maze: MazeData): void {
  const { width, height, cells } = maze;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];

      if (cell.isTextCell) {
        // Check south - if neighbor is not text, ensure wall exists
        const sy = (y + 1) % height;
        if (!cells[sy][x].isTextCell) {
          cell.southWall = true;
        }

        // Check east - if neighbor is not text, ensure wall exists
        const ex = (x + 1) % width;
        if (!cells[y][ex].isTextCell) {
          cell.eastWall = true;
        }
      } else {
        // Non-text cell: check if neighbors are text cells
        const sy = (y + 1) % height;
        if (cells[sy][x].isTextCell) {
          cell.southWall = true;
        }

        const ex = (x + 1) % width;
        if (cells[y][ex].isTextCell) {
          cell.eastWall = true;
        }
      }
    }
  }
}

// Create entry points connecting letters to the maze (external boundaries)
// and connecting letter cells to enclosed regions (internal boundaries)
function createLetterEntryPoints(maze: MazeData, placements: CharPlacement[], rng: Rng): void {
  const { width, height, cells } = maze;

  for (const placement of placements) {
    const boundaries = getCharacterBoundaries(placement.char);

    // External entries: proportional to external boundary size (3-6 entries)
    const numExternal = calculateEntryCount(boundaries.external.length, false);
    const selectedExternal = rng.shuffle(boundaries.external).slice(0, numExternal);

    for (const entry of selectedExternal) {
      const cellX = placement.startX + entry.x;
      const cellY = placement.startY + entry.y;

      if (cellX < 0 || cellX >= width || cellY < 0 || cellY >= height) continue;

      // Remove the wall in the direction specified by the entry point
      removeWallForEntry(cells, cellX, cellY, entry.side, width, height, false);
    }

    // Internal entries: 1-2 per enclosed region
    // These connect letter cells TO enclosed empty regions (like inside 'o' or 'B')
    for (const region of boundaries.internal) {
      const numInternal = calculateEntryCount(region.length, true);
      const selectedInternal = rng.shuffle(region).slice(0, numInternal);

      for (const entry of selectedInternal) {
        const cellX = placement.startX + entry.x;
        const cellY = placement.startY + entry.y;

        if (cellX < 0 || cellX >= width || cellY < 0 || cellY >= height) continue;

        // Remove wall between letter cell and enclosed region
        removeWallForEntry(cells, cellX, cellY, entry.side, width, height, true);
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
        if (isInternal || !cells[aboveY][cellX].isTextCell) {
          cells[aboveY][cellX].southWall = false;
        }
      }
      break;
    }
    case 'bottom': {
      // Remove this cell's south wall
      const belowY = (cellY + 1) % height;
      if (isInternal || !cells[belowY][cellX].isTextCell) {
        cells[cellY][cellX].southWall = false;
      }
      break;
    }
    case 'left': {
      // Remove wall from cell to left (its east wall)
      const leftX = cellX - 1;
      if (leftX >= 0) {
        if (isInternal || !cells[cellY][leftX].isTextCell) {
          cells[cellY][leftX].eastWall = false;
        }
      }
      break;
    }
    case 'right': {
      // Remove this cell's east wall
      const rightX = (cellX + 1) % width;
      if (isInternal || !cells[cellY][rightX].isTextCell) {
        cells[cellY][cellX].eastWall = false;
      }
      break;
    }
  }
}

// Generate maze paths for non-text areas using Kruskal's algorithm
function generateNonTextMazePaths(maze: MazeData, rng: Rng): void {
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
      if (cell.isTextCell) continue; // Skip text cells

      // South wall
      const sy = (y + 1) % height;
      if (!cells[sy][x].isTextCell && cell.southWall) {
        walls.push({ x, y, direction: 'S' });
      }

      // East wall
      const ex = (x + 1) % width;
      if (!cells[y][ex].isTextCell && cell.eastWall) {
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

function findValidPositions(maze: MazeData, rng: Rng): { kingPos: Position; keyPos: Position; doorPos: Position } {
  const { width, height, cells } = maze;

  const candidates: Position[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!cells[y][x].isTextCell) {
        candidates.push({ x, y });
      }
    }
  }

  const pool = candidates.length >= 3 ? candidates :
    Array.from({ length: width * height }, (_, i) => ({ x: i % width, y: Math.floor(i / width) }));

  const shuffled = rng.shuffle(pool);

  const kingPos = shuffled[0];

  let keyPos = shuffled[1];
  for (const pos of shuffled.slice(1)) {
    const dist = Math.abs(pos.x - kingPos.x) + Math.abs(pos.y - kingPos.y);
    if (dist > width / 3) {
      keyPos = pos;
      break;
    }
  }

  let doorPos = shuffled[2];
  for (const pos of shuffled.slice(2)) {
    const distKing = Math.abs(pos.x - kingPos.x) + Math.abs(pos.y - kingPos.y);
    const distKey = Math.abs(pos.x - keyPos.x) + Math.abs(pos.y - keyPos.y);
    if (distKing > width / 4 && distKey > width / 4) {
      doorPos = pos;
      break;
    }
  }

  return { kingPos, keyPos, doorPos };
}

export interface GeneratedMaze {
  maze: MazeData;
  kingPos: Position;
  keyPos: Position;
  doorPos: Position;
}

export function generateMaze(seed: string): GeneratedMaze {
  const rng = createRng(seed);

  const { width, height, textLayout } = calculateMazeDimensions(seed);
  const maze = createEmptyMaze(width, height);

  // 1. Mark text cells and get character placements
  const placements = embedTextCells(maze, textLayout);

  // 2. Create internal paths through each letter
  createInternalLetterPaths(maze, placements, rng);

  // 3. Set up boundary walls around letters
  createLetterBoundaryWalls(maze);

  // 4. Create entry points connecting letters to the maze
  createLetterEntryPoints(maze, placements, rng);

  // 5. Generate maze paths for non-text areas
  generateNonTextMazePaths(maze, rng);

  // 6. Find positions for king, key, door
  const { kingPos, keyPos, doorPos } = findValidPositions(maze, rng);

  return { maze, kingPos, keyPos, doorPos };
}

export function canMove(maze: MazeData, from: Position, direction: 'up' | 'down' | 'left' | 'right'): boolean {
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

export function getNewPosition(maze: MazeData, from: Position, direction: 'up' | 'down' | 'left' | 'right'): Position {
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
