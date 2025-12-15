// 8-cell tall pixel font with traversible paths through each letter
// Each character is represented as a 2D boolean array where true = filled/wall cell
// Letters are designed with internal passages that can be walked through
// IMPORTANT: All filled pixels connect orthogonally (no diagonal jumps)
// Entry/exit points are on edges to connect with the maze

type CharPattern = boolean[][];

// Helper to convert string patterns to boolean arrays
// '#' = filled (text cell), '.' = empty (path cell)
function p(rows: string[]): CharPattern {
  return rows.map(row => row.split('').map(c => c === '#'));
}

// Font designed with paths through letters:
// - Each letter has at least one traversible path
// - Paths are connected internally
// - All filled pixels connect orthogonally (no diagonal jumps!)
// - Entry/exit points on edges for maze connectivity
export const PIXEL_FONT: Record<string, CharPattern> = {
  // A: Path goes up the left side, across the middle, down the right
  'A': p([
    '.###.',
    '##.##',
    '#...#',
    '#...#',
    '#####',
    '#...#',
    '#...#',
    '#...#',
  ]),
  // B: Path winds through the bumps
  'B': p([
    '#####',
    '#...#',
    '#..##',
    '####.',
    '#..##',
    '#...#',
    '#...#',
    '#####',
  ]),
  // C: Open path through the gap
  'C': p([
    '.###.',
    '##...',
    '#....',
    '#....',
    '#....',
    '#....',
    '##...',
    '.###.',
  ]),
  // D: Path around the curve
  'D': p([
    '####.',
    '#..##',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#..##',
    '####.',
  ]),
  // E: Paths through the horizontal bars
  'E': p([
    '#####',
    '#....',
    '#....',
    '####.',
    '#....',
    '#....',
    '#....',
    '#####',
  ]),
  // F: Similar to E but open bottom
  'F': p([
    '#####',
    '#....',
    '#....',
    '####.',
    '#....',
    '#....',
    '#....',
    '#....',
  ]),
  // G: Path through the notch
  'G': p([
    '.####',
    '##...',
    '#....',
    '#....',
    '#.###',
    '#...#',
    '#..##',
    '####.',
  ]),
  // H: Clear path through the middle bar
  'H': p([
    '#...#',
    '#...#',
    '#...#',
    '#####',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
  ]),
  // I: Vertical path with top/bottom bars - connected orthogonally
  'I': p([
    '#####',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '#####',
  ]),
  // J: Path curves at bottom - connected orthogonally
  'J': p([
    '#####',
    '....#',
    '....#',
    '....#',
    '....#',
    '#...#',
    '##.##',
    '.###.',
  ]),
  // K: Fixed to avoid diagonal - fully connected
  'K': p([
    '#...#',
    '#..##',
    '#.##.',
    '###..',
    '###..',
    '#.##.',
    '#..##',
    '#...#',
  ]),
  // L: Simple L shape with open right
  'L': p([
    '#....',
    '#....',
    '#....',
    '#....',
    '#....',
    '#....',
    '#....',
    '#####',
  ]),
  // M: Fixed to avoid diagonal - connected peaks
  'M': p([
    '#...#',
    '##.##',
    '#####',
    '#.#.#',
    '#.#.#',
    '#...#',
    '#...#',
    '#...#',
  ]),
  // N: Fixed to avoid diagonal - uses stepped pattern
  'N': p([
    '#...#',
    '##..#',
    '###.#',
    '#.#.#',
    '#.#.#',
    '#.###',
    '#..##',
    '#...#',
  ]),
  // O: Path around the ring
  'O': p([
    '.###.',
    '##.##',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '##.##',
    '.###.',
  ]),
  // P: Path through top loop, open bottom
  'P': p([
    '#####',
    '#...#',
    '#...#',
    '#..##',
    '####.',
    '#....',
    '#....',
    '#....',
  ]),
  // Q: O with orthogonal tail
  'Q': p([
    '.###.',
    '##.##',
    '#...#',
    '#...#',
    '#.#.#',
    '#.###',
    '##.##',
    '.####',
  ]),
  // R: Like P but with orthogonal leg - fully connected
  'R': p([
    '#####',
    '#...#',
    '#...#',
    '####.',
    '###..',
    '#.##.',
    '#..##',
    '#...#',
  ]),
  // S: Winding path
  'S': p([
    '#####',
    '#....',
    '##...',
    '.####',
    '....#',
    '....#',
    '#...#',
    '#####',
  ]),
  // T: Path down the center - connected orthogonally
  'T': p([
    '#####',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
  ]),
  // U: Path around the bottom
  'U': p([
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '##.##',
    '.###.',
  ]),
  // V: Fixed to avoid diagonal - stepped convergence
  'V': p([
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '##.##',
    '.###.',
    '..#..',
  ]),
  // W: Fixed to avoid diagonal - connected valleys
  'W': p([
    '#...#',
    '#...#',
    '#...#',
    '#.#.#',
    '#.#.#',
    '#.#.#',
    '#####',
    '.#.#.',
  ]),
  // X: Fixed to avoid diagonal - fully connected cross
  'X': p([
    '#...#',
    '##.##',
    '.###.',
    '..#..',
    '..#..',
    '.###.',
    '##.##',
    '#...#',
  ]),
  // Y: Fixed to avoid diagonal - fully connected merge
  'Y': p([
    '#...#',
    '#...#',
    '##.##',
    '.###.',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
  ]),
  // Z: Fixed to avoid diagonal - stepped pattern
  'Z': p([
    '#####',
    '....#',
    '...##',
    '..##.',
    '.##..',
    '##...',
    '#....',
    '#####',
  ]),
  // Numbers with traversible paths - all fixed for orthogonal connections
  '0': p([
    '.###.',
    '##.##',
    '#...#',
    '#.#.#',
    '#.#.#',
    '#...#',
    '##.##',
    '.###.',
  ]),
  '1': p([
    '..#..',
    '.##..',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '#####',
  ]),
  '2': p([
    '.###.',
    '##.##',
    '....#',
    '..###',
    '.##..',
    '##...',
    '#....',
    '#####',
  ]),
  '3': p([
    '.###.',
    '##.##',
    '....#',
    '..###',
    '....#',
    '....#',
    '##.##',
    '.###.',
  ]),
  '4': p([
    '#...#',
    '#...#',
    '#...#',
    '#####',
    '....#',
    '....#',
    '....#',
    '....#',
  ]),
  '5': p([
    '#####',
    '#....',
    '#....',
    '#####',
    '....#',
    '....#',
    '##.##',
    '.###.',
  ]),
  '6': p([
    '.####',
    '##..#',
    '#....',
    '####.',
    '#..##',
    '#...#',
    '##.##',
    '.###.',
  ]),
  '7': p([
    '#####',
    '....#',
    '....#',
    '...##',
    '..##.',
    '..#..',
    '..#..',
    '..#..',
  ]),
  '8': p([
    '.###.',
    '##.##',
    '#...#',
    '##.##',
    '#####',
    '#...#',
    '##.##',
    '.###.',
  ]),
  '9': p([
    '.###.',
    '##.##',
    '#...#',
    '##.##',
    '.####',
    '....#',
    '#..##',
    '####.',
  ]),
  // Punctuation
  ' ': p([
    '...',
    '...',
    '...',
    '...',
    '...',
    '...',
    '...',
    '...',
  ]),
  '.': p([
    '..',
    '..',
    '..',
    '..',
    '..',
    '..',
    '##',
    '##',
  ]),
  ',': p([
    '..',
    '..',
    '..',
    '..',
    '..',
    '##',
    '.#',
    '.#',
  ]),
  '!': p([
    '##',
    '##',
    '##',
    '##',
    '##',
    '..',
    '##',
    '##',
  ]),
  '?': p([
    '.###.',
    '##.##',
    '....#',
    '..###',
    '..#..',
    '..#..',
    '.....',
    '..#..',
  ]),
  "'": p([
    '##',
    '##',
    '##',
    '..',
    '..',
    '..',
    '..',
    '..',
  ]),
  '-': p([
    '....',
    '....',
    '....',
    '####',
    '....',
    '....',
    '....',
    '....',
  ]),
  ':': p([
    '..',
    '##',
    '##',
    '..',
    '..',
    '##',
    '##',
    '..',
  ]),
  // Lowercase letters - same height, different style
  'a': p([
    '.....',
    '.....',
    '.####',
    '....#',
    '.####',
    '##..#',
    '#...#',
    '#####',
  ]),
  'b': p([
    '#....',
    '#....',
    '#....',
    '#####',
    '#...#',
    '#...#',
    '#..##',
    '####.',
  ]),
  'c': p([
    '.....',
    '.....',
    '.###.',
    '##...',
    '#....',
    '#....',
    '##...',
    '.###.',
  ]),
  'd': p([
    '....#',
    '....#',
    '....#',
    '.####',
    '##..#',
    '#...#',
    '##.##',
    '.####',
  ]),
  'e': p([
    '.....',
    '.....',
    '####.',
    '#..##',
    '#..##',
    '####.',
    '#....',
    '####.',
  ]),
  'f': p([
    '.###.',
    '.#.#.',
    '.#...',
    '###..',
    '.#...',
    '.#...',
    '.#...',
    '.#...',
  ]),
  'g': p([
    '.....',
    '.....',
    '#####',
    '#...#',
    '##..#',
    '.####',
    '....#',
    '.####',
  ]),
  'h': p([
    '#....',
    '#....',
    '#....',
    '####.',
    '#..##',
    '#...#',
    '#...#',
    '#...#',
  ]),
  'i': p([
    '..#..',
    '.....',
    '.##..',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '.###.',
  ]),
  'j': p([
    '...#.',
    '.....',
    '..###',
    '...#.',
    '...#.',
    '...#.',
    '..##.',
    '.##..',
  ]),
  'k': p([
    '#....',
    '#....',
    '#..#.',
    '#.##.',
    '###..',
    '#.##.',
    '#..#.',
    '#..#.',
  ]),
  'l': p([
    '##...',
    '.#...',
    '.#...',
    '.#...',
    '.#...',
    '.#...',
    '.#.#.',
    '.###.',
  ]),
  'm': p([
    '.....',
    '.....',
    '#####',
    '#.#.#',
    '#.#.#',
    '#.#.#',
    '#...#',
    '#...#',
  ]),
  'n': p([
    '.....',
    '.....',
    '.###.',
    '##.##',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
  ]),
  'o': p([
    '.....',
    '.....',
    '.###.',
    '##.##',
    '#...#',
    '#...#',
    '##.##',
    '.###.',
  ]),
  'p': p([
    '.....',
    '.....',
    '#####',
    '#...#',
    '#..##',
    '####.',
    '#....',
    '#....',
  ]),
  'q': p([
    '.....',
    '.....',
    '#####',
    '#...#',
    '##..#',
    '.####',
    '....#',
    '....#',
  ]),
  'r': p([
    '....',
    '....',
    '.##.',
    '####',
    '#..#',
    '#...',
    '#...',
    '#...',
  ]),
  's': p([
    '.....',
    '.....',
    '####.',
    '#....',
    '#####',
    '....#',
    '#...#',
    '#####',
  ]),
  't': p([
    '.#...',
    '.#...',
    '####.',
    '.#...',
    '.#...',
    '.#...',
    '.##..',
    '..##.',
  ]),
  'u': p([
    '.....',
    '.....',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '##..#',
    '.####',
  ]),
  'v': p([
    '.....',
    '.....',
    '#...#',
    '#...#',
    '#...#',
    '##.##',
    '.###.',
    '..#..',
  ]),
  'w': p([
    '.....',
    '.....',
    '#...#',
    '#...#',
    '#.#.#',
    '#.#.#',
    '#####',
    '.#.#.',
  ]),
  'x': p([
    '.....',
    '.....',
    '#...#',
    '##.##',
    '.###.',
    '##.##',
    '#...#',
    '#...#',
  ]),
  'y': p([
    '.....',
    '.....',
    '#...#',
    '#...#',
    '##..#',
    '.####',
    '....#',
    '.####',
  ]),
  'z': p([
    '.....',
    '.....',
    '#####',
    '....#',
    '..###',
    '###..',
    '#....',
    '#####',
  ]),
};

// Entry/exit points for each character (edges where paths can connect)
// Format: array of {x, y, side: 'top'|'bottom'|'left'|'right'}
export interface EntryPoint {
  x: number;
  y: number;
  side: 'top' | 'bottom' | 'left' | 'right';
}

// Character boundaries including external and internal (enclosed) regions
export interface CharacterBoundaries {
  external: EntryPoint[];        // All filled cells bordering external empty space
  internal: EntryPoint[][];      // Array of enclosed regions, each with boundary cells
}

export function getCharWidth(char: string): number {
  // Try exact match first (for lowercase)
  let pattern = PIXEL_FONT[char];
  if (!pattern) {
    // Fall back to uppercase
    pattern = PIXEL_FONT[char.toUpperCase()];
  }
  if (!pattern || pattern.length === 0) return 3;
  return pattern[0].length;
}

export function getTextDimensions(text: string): { width: number; height: number } {
  let width = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    width += getCharWidth(char);
    if (i < text.length - 1) {
      width += 1; // spacing between characters
    }
  }

  return { width, height: 8 };
}

// Get pattern for a character, supporting both cases
export function getCharPattern(char: string): CharPattern | undefined {
  // Try exact match first
  let pattern = PIXEL_FONT[char];
  if (!pattern) {
    // Fall back to uppercase
    pattern = PIXEL_FONT[char.toUpperCase()];
  }
  return pattern;
}

// Cache for character boundaries (computed once per character)
const boundariesCache = new Map<string, CharacterBoundaries>();

/**
 * Get all boundary cells for a character using flood-fill detection.
 * Returns both external boundaries (cells bordering outside empty space)
 * and internal boundaries (cells bordering enclosed regions like inside 'o' or 'B').
 */
export function getCharacterBoundaries(char: string): CharacterBoundaries {
  // Check cache first
  const cached = boundariesCache.get(char);
  if (cached) return cached;

  const pattern = PIXEL_FONT[char];
  if (!pattern || pattern.length === 0) {
    const empty: CharacterBoundaries = { external: [], internal: [] };
    boundariesCache.set(char, empty);
    return empty;
  }

  const height = pattern.length;
  const width = pattern[0].length;

  // Create padded grid (add 1-cell border of empty space around the pattern)
  // This ensures we can flood-fill from corners to reach all external empty cells
  const paddedH = height + 2;
  const paddedW = width + 2;
  const padded: boolean[][] = [];
  for (let y = 0; y < paddedH; y++) {
    padded[y] = [];
    for (let x = 0; x < paddedW; x++) {
      // Check if this is within the original pattern bounds (offset by 1)
      if (y >= 1 && y <= height && x >= 1 && x <= width) {
        padded[y][x] = pattern[y - 1][x - 1];
      } else {
        padded[y][x] = false; // Border padding is empty
      }
    }
  }

  // Mark external empty cells using BFS flood-fill from corner (0,0)
  const external: boolean[][] = [];
  for (let y = 0; y < paddedH; y++) {
    external[y] = new Array(paddedW).fill(false);
  }

  // BFS queue - start from top-left corner which is always empty (padding)
  const queue: [number, number][] = [[0, 0]];
  external[0][0] = true;

  // Direction offsets: N, E, S, W (consistent order for determinism)
  const dirs = [[-1, 0], [0, 1], [1, 0], [0, -1]];

  while (queue.length > 0) {
    const [cy, cx] = queue.shift()!;
    for (const [dy, dx] of dirs) {
      const ny = cy + dy;
      const nx = cx + dx;
      if (ny >= 0 && ny < paddedH && nx >= 0 && nx < paddedW) {
        // Only flood through empty cells, and only if not already visited
        if (!padded[ny][nx] && !external[ny][nx]) {
          external[ny][nx] = true;
          queue.push([ny, nx]);
        }
      }
    }
  }

  // Find external boundary cells: filled cells adjacent to external empty cells
  const externalBoundary: EntryPoint[] = [];
  const sideMap: [number, number, 'top' | 'bottom' | 'left' | 'right'][] = [
    [-1, 0, 'top'],    // N neighbor means entry from top
    [0, 1, 'right'],   // E neighbor means entry from right
    [1, 0, 'bottom'],  // S neighbor means entry from bottom
    [0, -1, 'left'],   // W neighbor means entry from left
  ];

  // Iterate in consistent order (row-major) for determinism
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pattern[y][x]) {
        // This is a filled cell - check if any neighbor is external empty
        const py = y + 1; // Padded coordinates
        const px = x + 1;

        for (const [dy, dx, side] of sideMap) {
          const ny = py + dy;
          const nx = px + dx;
          if (external[ny][nx]) {
            // This filled cell borders external empty space on this side
            externalBoundary.push({ x, y, side });
          }
        }
      }
    }
  }

  // Find enclosed regions: empty cells NOT marked as external
  // Each enclosed region becomes a separate array of internal boundary cells
  const internalRegions: EntryPoint[][] = [];
  const regionAssigned: number[][] = [];
  for (let y = 0; y < paddedH; y++) {
    regionAssigned[y] = new Array(paddedW).fill(-1);
  }

  let regionId = 0;
  for (let y = 1; y <= height; y++) {
    for (let x = 1; x <= width; x++) {
      // Look for empty cells that are not external (enclosed)
      if (!padded[y][x] && !external[y][x] && regionAssigned[y][x] === -1) {
        // Found a new enclosed region - flood-fill to find all cells in it
        const regionCells: [number, number][] = [];
        const regionQueue: [number, number][] = [[y, x]];
        regionAssigned[y][x] = regionId;

        while (regionQueue.length > 0) {
          const [cy, cx] = regionQueue.shift()!;
          regionCells.push([cy, cx]);

          for (const [dy, dx] of dirs) {
            const ny = cy + dy;
            const nx = cx + dx;
            if (ny >= 1 && ny <= height && nx >= 1 && nx <= width) {
              if (!padded[ny][nx] && !external[ny][nx] && regionAssigned[ny][nx] === -1) {
                regionAssigned[ny][nx] = regionId;
                regionQueue.push([ny, nx]);
              }
            }
          }
        }

        // Find all filled cells adjacent to this enclosed region
        const regionBoundary: EntryPoint[] = [];
        const addedCells = new Set<string>();

        for (const [cy, cx] of regionCells) {
          for (const [dy, dx, side] of sideMap) {
            const ny = cy + dy;
            const nx = cx + dx;
            // Check if neighbor is a filled cell (in padded coords)
            if (ny >= 1 && ny <= height && nx >= 1 && nx <= width && padded[ny][nx]) {
              // Convert back to original coords
              const origY = ny - 1;
              const origX = nx - 1;
              const key = `${origX},${origY},${side}`;
              if (!addedCells.has(key)) {
                addedCells.add(key);
                // The side indicates direction FROM the filled cell TO the enclosed region
                // We need to flip it: if empty is north of filled, entry is 'top' on the filled cell
                const flippedSide = side === 'top' ? 'bottom' : side === 'bottom' ? 'top' : side === 'left' ? 'right' : 'left';
                regionBoundary.push({ x: origX, y: origY, side: flippedSide });
              }
            }
          }
        }

        if (regionBoundary.length > 0) {
          internalRegions.push(regionBoundary);
        }
        regionId++;
      }
    }
  }

  const result: CharacterBoundaries = {
    external: externalBoundary,
    internal: internalRegions,
  };

  boundariesCache.set(char, result);
  return result;
}

/**
 * Calculate the number of entry points to create based on boundary size.
 * External: 3-6 entries (scales with perimeter)
 * Internal: 1-2 entries per region
 */
export function calculateEntryCount(boundarySize: number, isInternal: boolean): number {
  if (boundarySize === 0) return 0;

  if (isInternal) {
    // 1-2 entries per enclosed region
    return Math.min(2, Math.max(1, Math.floor(boundarySize / 6)));
  } else {
    // 3-6 entries for external boundary, roughly 1 per 4 boundary cells
    return Math.min(6, Math.max(3, Math.floor(boundarySize / 4)));
  }
}
