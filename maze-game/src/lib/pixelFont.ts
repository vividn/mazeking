// 8-cell tall pixel font with traversible paths through each letter
// Each character is represented as a 2D boolean array where true = filled/wall cell
// Letters are designed with internal passages that can be walked through
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
// - Entry/exit points on edges for maze connectivity
export const PIXEL_FONT: Record<string, CharPattern> = {
  // A: Path goes up the left side, across the middle, down the right
  'A': p([
    '.###.',
    '#...#',
    '#...#',
    '#...#',
    '#####',
    '#...#',
    '#...#',
    '#...#',
  ]),
  // B: Path winds through the bumps
  'B': p([
    '####.',
    '#...#',
    '#...#',
    '####.',
    '#...#',
    '#...#',
    '#...#',
    '####.',
  ]),
  // C: Open path through the gap
  'C': p([
    '.####',
    '#....',
    '#....',
    '#....',
    '#....',
    '#....',
    '#....',
    '.####',
  ]),
  // D: Path around the curve
  'D': p([
    '####.',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
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
    '#....',
    '#....',
    '#..##',
    '#...#',
    '#...#',
    '#...#',
    '.####',
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
  // I: Vertical path with top/bottom bars
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
  // J: Path curves at bottom
  'J': p([
    '.####',
    '...#.',
    '...#.',
    '...#.',
    '...#.',
    '#..#.',
    '#..#.',
    '.##..',
  ]),
  // K: Paths through diagonal sections
  'K': p([
    '#...#',
    '#..#.',
    '#.#..',
    '##...',
    '##...',
    '#.#..',
    '#..#.',
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
  // M: Paths through the peaks
  'M': p([
    '#...#',
    '##.##',
    '#.#.#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
  ]),
  // N: Diagonal path through
  'N': p([
    '#...#',
    '##..#',
    '#.#.#',
    '#..##',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
  ]),
  // O: Path around the ring
  'O': p([
    '.###.',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '.###.',
  ]),
  // P: Path through top loop, open bottom
  'P': p([
    '####.',
    '#...#',
    '#...#',
    '####.',
    '#....',
    '#....',
    '#....',
    '#....',
  ]),
  // Q: O with tail
  'Q': p([
    '.###.',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#.#.#',
    '#..#.',
    '.##.#',
  ]),
  // R: Like P but with leg
  'R': p([
    '####.',
    '#...#',
    '#...#',
    '####.',
    '#.#..',
    '#..#.',
    '#...#',
    '#...#',
  ]),
  // S: Winding path
  'S': p([
    '.####',
    '#....',
    '#....',
    '.###.',
    '....#',
    '....#',
    '....#',
    '####.',
  ]),
  // T: Path down the center
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
    '#...#',
    '.###.',
  ]),
  // V: Paths converge at bottom
  'V': p([
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '.#.#.',
    '.#.#.',
    '..#..',
  ]),
  // W: Paths through the valleys
  'W': p([
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#.#.#',
    '#.#.#',
    '##.##',
    '#...#',
  ]),
  // X: Paths cross in middle
  'X': p([
    '#...#',
    '.#.#.',
    '.#.#.',
    '..#..',
    '..#..',
    '.#.#.',
    '.#.#.',
    '#...#',
  ]),
  // Y: Paths merge then go down
  'Y': p([
    '#...#',
    '#...#',
    '.#.#.',
    '.#.#.',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
  ]),
  // Z: Diagonal path
  'Z': p([
    '#####',
    '....#',
    '...#.',
    '..#..',
    '.#...',
    '#....',
    '#....',
    '#####',
  ]),
  // Numbers with traversible paths
  '0': p([
    '.###.',
    '#...#',
    '#..##',
    '#.#.#',
    '##..#',
    '#...#',
    '#...#',
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
    '.###.',
  ]),
  '2': p([
    '.###.',
    '#...#',
    '....#',
    '...#.',
    '..#..',
    '.#...',
    '#....',
    '#####',
  ]),
  '3': p([
    '.###.',
    '#...#',
    '....#',
    '..##.',
    '....#',
    '....#',
    '#...#',
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
    '####.',
    '....#',
    '....#',
    '#...#',
    '.###.',
  ]),
  '6': p([
    '.###.',
    '#....',
    '#....',
    '####.',
    '#...#',
    '#...#',
    '#...#',
    '.###.',
  ]),
  '7': p([
    '#####',
    '....#',
    '....#',
    '...#.',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
  ]),
  '8': p([
    '.###.',
    '#...#',
    '#...#',
    '.###.',
    '#...#',
    '#...#',
    '#...#',
    '.###.',
  ]),
  '9': p([
    '.###.',
    '#...#',
    '#...#',
    '.####',
    '....#',
    '....#',
    '....#',
    '.###.',
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
    '..',
    '.#',
    '#.',
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
    '#...#',
    '....#',
    '...#.',
    '..#..',
    '..#..',
    '.....',
    '..#..',
  ]),
  "'": p([
    '##',
    '##',
    '#.',
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
};

// Entry/exit points for each character (edges where paths can connect)
// Format: array of {x, y, side: 'top'|'bottom'|'left'|'right'}
export interface EntryPoint {
  x: number;
  y: number;
  side: 'top' | 'bottom' | 'left' | 'right';
}

// Pre-computed entry points for better maze connectivity
export const CHAR_ENTRY_POINTS: Record<string, EntryPoint[]> = {
  'A': [
    { x: 0, y: 0, side: 'top' }, { x: 4, y: 0, side: 'top' },
    { x: 0, y: 7, side: 'bottom' }, { x: 4, y: 7, side: 'bottom' },
  ],
  'B': [
    { x: 0, y: 0, side: 'top' },
    { x: 0, y: 7, side: 'bottom' },
    { x: 4, y: 1, side: 'right' }, { x: 4, y: 5, side: 'right' },
  ],
  'C': [
    { x: 1, y: 0, side: 'top' }, { x: 1, y: 7, side: 'bottom' },
    { x: 0, y: 1, side: 'left' }, { x: 0, y: 6, side: 'left' },
  ],
  // Default entry points for unspecified chars
};

export function getCharWidth(char: string): number {
  const pattern = PIXEL_FONT[char.toUpperCase()];
  if (!pattern || pattern.length === 0) return 3;
  return pattern[0].length;
}

export function getTextDimensions(text: string): { width: number; height: number } {
  const upperText = text.toUpperCase();
  let width = 0;

  for (let i = 0; i < upperText.length; i++) {
    const char = upperText[i];
    width += getCharWidth(char);
    if (i < upperText.length - 1) {
      width += 1; // spacing between characters
    }
  }

  return { width, height: 8 };
}

// Get entry points for a character, or default edge points
export function getEntryPoints(char: string): EntryPoint[] {
  const upperChar = char.toUpperCase();
  if (CHAR_ENTRY_POINTS[upperChar]) {
    return CHAR_ENTRY_POINTS[upperChar];
  }

  // Generate default entry points based on the pattern
  const pattern = PIXEL_FONT[upperChar];
  if (!pattern) return [];

  const points: EntryPoint[] = [];
  const height = pattern.length;
  const width = pattern[0]?.length || 0;

  // Find edge cells that are filled (text cells)
  // Top edge
  for (let x = 0; x < width; x++) {
    if (pattern[0][x]) {
      points.push({ x, y: 0, side: 'top' });
    }
  }
  // Bottom edge
  for (let x = 0; x < width; x++) {
    if (pattern[height - 1][x]) {
      points.push({ x, y: height - 1, side: 'bottom' });
    }
  }
  // Left edge
  for (let y = 0; y < height; y++) {
    if (pattern[y][0]) {
      points.push({ x: 0, y, side: 'left' });
    }
  }
  // Right edge
  for (let y = 0; y < height; y++) {
    if (pattern[y][width - 1]) {
      points.push({ x: width - 1, y, side: 'right' });
    }
  }

  return points;
}
