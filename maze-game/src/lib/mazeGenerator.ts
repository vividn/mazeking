import { createRng, type Rng } from './seededRandom';
import { PIXEL_FONT, getCharWidth, getTextDimensions } from './pixelFont';
import type { Cell, MazeData, Position } from '../types';

const CHAR_HEIGHT = 8;
const CHAR_SPACING = 1;
const MARGIN_CHARS = 3; // 3 character-widths of margin

interface TextLayout {
  lines: string[];
  width: number;
  height: number;
}

function layoutText(text: string, maxWidthChars: number): TextLayout {
  const words = text.toUpperCase().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine === '') {
      currentLine = word;
    } else {
      const testLine = currentLine + ' ' + word;
      const testWidth = getTextDimensions(testLine).width;
      if (testWidth <= maxWidthChars * 6) { // approx 6 cells per char
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

  // Calculate actual dimensions
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
  // Start with a reasonable max width for text
  const maxTextWidthChars = 20;
  const textLayout = layoutText(text, maxTextWidthChars);

  // Add margins (in cells, not characters)
  const marginCells = MARGIN_CHARS * 6; // ~6 cells per character width

  const width = textLayout.width + marginCells * 2;
  const height = textLayout.height + marginCells * 2;

  // Ensure minimum size for complexity
  const minSize = 30;

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
        isTextCell: false
      };
    }
  }
  return { cells, width, height };
}

function embedTextInMaze(maze: MazeData, textLayout: TextLayout): void {
  const { width, height, cells } = maze;

  // Calculate where to place text (centered)
  const startX = Math.floor((width - textLayout.width) / 2);
  const startY = Math.floor((height - textLayout.height) / 2);

  let currentY = startY;

  for (const line of textLayout.lines) {
    // Center each line
    const lineDims = getTextDimensions(line);
    let currentX = startX + Math.floor((textLayout.width - lineDims.width) / 2);

    for (const char of line) {
      const charPattern = PIXEL_FONT[char];
      if (!charPattern) {
        currentX += 4; // space for unknown chars
        continue;
      }

      const charWidth = getCharWidth(char);

      // Draw the character
      for (let py = 0; py < charPattern.length; py++) {
        for (let px = 0; px < charPattern[py].length; px++) {
          const cellX = currentX + px;
          const cellY = currentY + py;

          if (cellX >= 0 && cellX < width && cellY >= 0 && cellY < height) {
            if (charPattern[py][px]) {
              cells[cellY][cellX].isTextCell = true;
            }
          }
        }
      }

      currentX += charWidth + CHAR_SPACING;
    }

    currentY += CHAR_HEIGHT + CHAR_SPACING;
  }
}

// Modified Kruskal's algorithm for maze generation with wraparound
function generateMazePaths(maze: MazeData, rng: Rng): void {
  const { width, height, cells } = maze;

  // Union-Find data structure
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

  // Create list of all walls (edges)
  interface Wall {
    x: number;
    y: number;
    direction: 'S' | 'E';
  }

  const walls: Wall[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // South wall (wraps to top)
      walls.push({ x, y, direction: 'S' });
      // East wall (wraps to left)
      walls.push({ x, y, direction: 'E' });
    }
  }

  // Shuffle walls
  const shuffledWalls = rng.shuffle(walls);

  // Process walls
  for (const wall of shuffledWalls) {
    const { x, y, direction } = wall;
    const idx1 = cellIndex(x, y);

    let nx: number, ny: number;
    if (direction === 'S') {
      nx = x;
      ny = (y + 1) % height; // Wrap around
    } else {
      nx = (x + 1) % width; // Wrap around
      ny = y;
    }

    const idx2 = cellIndex(nx, ny);

    // If removing this wall would connect two different components, remove it
    if (union(idx1, idx2)) {
      if (direction === 'S') {
        cells[y][x].southWall = false;
      } else {
        cells[y][x].eastWall = false;
      }
    }
  }
}

// Add extra passages through text cells to ensure connectivity
function ensureTextAccessibility(maze: MazeData, rng: Rng): void {
  const { width, height, cells } = maze;

  // Find text cell clusters and add some passages through them
  const textWalls: Array<{ x: number; y: number; direction: 'S' | 'E' }> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x].isTextCell) {
        if (cells[y][x].southWall) {
          textWalls.push({ x, y, direction: 'S' });
        }
        if (cells[y][x].eastWall) {
          textWalls.push({ x, y, direction: 'E' });
        }
      }
    }
  }

  // Remove some walls in text areas to create passages (about 20%)
  const shuffled = rng.shuffle(textWalls);
  const toRemove = Math.floor(shuffled.length * 0.2);

  for (let i = 0; i < toRemove; i++) {
    const wall = shuffled[i];
    if (wall.direction === 'S') {
      cells[wall.y][wall.x].southWall = false;
    } else {
      cells[wall.y][wall.x].eastWall = false;
    }
  }
}

function findValidPositions(maze: MazeData, rng: Rng): { kingPos: Position; keyPos: Position; doorPos: Position } {
  const { width, height, cells } = maze;

  // Get all non-text cells as candidates
  const candidates: Position[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!cells[y][x].isTextCell) {
        candidates.push({ x, y });
      }
    }
  }

  // If not enough non-text cells, use all cells
  const pool = candidates.length >= 3 ? candidates :
    Array.from({ length: width * height }, (_, i) => ({ x: i % width, y: Math.floor(i / width) }));

  const shuffled = rng.shuffle(pool);

  // Pick 3 positions that are reasonably spread apart
  const kingPos = shuffled[0];

  // Find key position far from king
  let keyPos = shuffled[1];
  for (const pos of shuffled.slice(1)) {
    const dist = Math.abs(pos.x - kingPos.x) + Math.abs(pos.y - kingPos.y);
    if (dist > width / 3) {
      keyPos = pos;
      break;
    }
  }

  // Find door position far from both
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

  // Calculate dimensions based on text
  const { width, height, textLayout } = calculateMazeDimensions(seed);

  // Create empty maze with all walls
  const maze = createEmptyMaze(width, height);

  // Embed text into maze (mark text cells)
  embedTextInMaze(maze, textLayout);

  // Generate maze paths using modified Kruskal's
  generateMazePaths(maze, rng);

  // Ensure text areas are accessible
  ensureTextAccessibility(maze, rng);

  // Find positions for king, key, door
  const { kingPos, keyPos, doorPos } = findValidPositions(maze, rng);

  return { maze, kingPos, keyPos, doorPos };
}

// Check if movement is possible (considering wraparound)
export function canMove(maze: MazeData, from: Position, direction: 'up' | 'down' | 'left' | 'right'): boolean {
  const { width, height, cells } = maze;
  const { x, y } = from;

  switch (direction) {
    case 'up': {
      // Going up means crossing the south wall of the cell above
      const aboveY = (y - 1 + height) % height;
      return !cells[aboveY][x].southWall;
    }
    case 'down': {
      // Going down means crossing our south wall
      return !cells[y][x].southWall;
    }
    case 'left': {
      // Going left means crossing the east wall of the cell to the left
      const leftX = (x - 1 + width) % width;
      return !cells[y][leftX].eastWall;
    }
    case 'right': {
      // Going right means crossing our east wall
      return !cells[y][x].eastWall;
    }
  }
}

// Get new position after move (with wraparound)
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
