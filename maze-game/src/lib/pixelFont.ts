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
    '.....',
    '.....',
    '.##..',
    '####.',
    '#..#.',
    '#....',
    '#....',
    '#....',
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

// Get entry points for a character based on filled edge cells
export function getEntryPoints(char: string): EntryPoint[] {
  let pattern = PIXEL_FONT[char];
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
