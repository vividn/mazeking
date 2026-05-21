/**
 * ⚠️ CONSENSUS-CRITICAL FILE — see ma-5yi
 *
 * Pixel-font wordmark placement: line wrap, glyph-box geometry, the wordmark
 * margin, and where text cells land in the maze grid. The constants and
 * geometry here feed maze width/height and the positions of every text cell,
 * which in turn feed `mazeHash` (see `tokenId.ts`). Any change to
 * WORDMARK_MARGIN, CHAR_HEIGHT, CHAR_SPACING, LINE_SPACING, WRAP_WIDTH_CELLS,
 * or the embedding offset math silently re-mints every existing seed under a
 * new tokenID.
 *
 * Post-mainnet edits require a coordinated migration plan AND a
 * `consensus-critical-change: <bead-id>` line in the commit body.
 * Pre-mainnet edits must regenerate Pedersen fixtures
 * (`just regen-pedersen-fixtures`) and re-run the full test suite.
 *
 * The lint gate `just check-consensus-critical` enforces marker presence
 * and commit-message acks for changes to this file.
 */
import {
  getCharWidth,
  getTextDimensions,
  getTextTopRow,
  getCharPattern,
} from './pixelFont';
import { CellType, type MazeData } from '../types';

// CONSENSUS-CRITICAL: changing any layout constant below changes mazeHash → tokenID for every seed.
// Pixel font geometry: 8 cells from ascender line (row 0) to baseline (row 7).
// Descender characters (g, j, p, q, y) extend 2 rows below baseline; layout
// treats CHAR_HEIGHT as the canonical line height so descenders draw into the
// bottom margin instead of inflating maze size.
export const CHAR_HEIGHT = 8;
const CHAR_SPACING = 1;
const LINE_SPACING = 3;

// CONSENSUS-CRITICAL: wordmark margin. Bishop tightened this 3× (ma-kj9, ma-1mv,
// ma-kwb) chasing visual balance; each change silently changed mint identity for
// the same seed. Exactly 4 cells of breathing room around the rendered text.
// - Top: 4 cells above the topmost filled cell of the first line. For words
//   with ascenders ('high'), that's row 0 (ascender line). For x-height-only
//   words ('snow'), the line shifts up so the visible cap-/x-height row sits
//   exactly WORDMARK_MARGIN below the maze top — no phantom ascender padding.
// - Bottom: 4 cells below the baseline (descenders extend into this margin).
// - Left/Right: 4 cells past the leftmost/rightmost glyph-box edge of the widest line.
// Margin is computed as integer cells from the start — no rounding, no minimum-size
// floor — so every render produces identical, verifiable counts.
export const WORDMARK_MARGIN = 4;

// CONSENSUS-CRITICAL: line-wrap threshold drives lines[] arrangement → maze height.
const WRAP_WIDTH_CELLS = 50;

export interface TextLayout {
  lines: string[];
  width: number;
  height: number;
  // Topmost filled row of the first line's glyphs (0 if any glyph fills the
  // ascender line). Drives the top-margin tightening for x-height-only words.
  topOffset: number;
}

// Track character positions for creating entry points
export interface CharPlacement {
  char: string;
  startX: number;
  startY: number;
  width: number;
  height: number;
}

function layoutText(text: string): TextLayout {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine === '') {
      currentLine = word;
    } else {
      const testLine = currentLine + ' ' + word;
      const testWidth = getTextDimensions(testLine).width;
      if (testWidth <= WRAP_WIDTH_CELLS) {
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
    height: lines.length * (CHAR_HEIGHT + LINE_SPACING) - LINE_SPACING,
    topOffset: lines.length > 0 ? getTextTopRow(lines[0]) : 0,
  };
}

export function calculateMazeDimensions(text: string): {
  width: number;
  height: number;
  textLayout: TextLayout;
} {
  const textLayout = layoutText(text);
  // textLayout.width is the measured rendered width (sum of per-char cell widths + spacing).
  // textLayout.height spans the ascender line of the first line to the baseline of the last
  // line — descenders are intentionally excluded so they extend into the bottom margin.
  // Maze dimensions are textLayout + 2*WORDMARK_MARGIN exactly. No min-size floor: a
  // floor would force asymmetric centering (e.g. text width 9 → maze 20 → 5+6 split)
  // and break the "exactly N cells on every side" contract.
  // topOffset trims the empty rows above the first line's tallest glyph so x-height-only
  // words sit flush with the top margin rather than carrying phantom ascender padding.
  return {
    width: textLayout.width + WORDMARK_MARGIN * 2,
    height: textLayout.height - textLayout.topOffset + WORDMARK_MARGIN * 2,
    textLayout,
  };
}

// Mark text cells and track character placements for connectivity.
// Mutates `maze` in place; returned placements drive downstream wall carving.
export function embedTextCells(
  maze: MazeData,
  textLayout: TextLayout
): CharPlacement[] {
  const { width, height, cells } = maze;
  const placements: CharPlacement[] = [];

  const startX = Math.floor((width - textLayout.width) / 2);
  // startY places pattern-row 0 of the first line above the top margin by
  // exactly textLayout.topOffset rows, so the first line's topmost FILLED
  // pattern-row lands at maze row WORDMARK_MARGIN.
  const startY = WORDMARK_MARGIN - textLayout.topOffset;

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
        height: CHAR_HEIGHT,
      });

      // Determine cell type based on character
      const upperChar = char.toUpperCase();
      const isZkLetter = upperChar === 'Z' || upperChar === 'K';
      const isCrown = char === '♚';
      const cellType = isCrown
        ? CellType.CrownText
        : isZkLetter
          ? CellType.ZkText
          : CellType.Text;

      // Mark all filled cells with appropriate type
      for (let py = 0; py < charPattern.length; py++) {
        for (let px = 0; px < charPattern[py].length; px++) {
          const cellX = currentX + px;
          const cellY = currentY + py;

          if (cellX >= 0 && cellX < width && cellY >= 0 && cellY < height) {
            if (charPattern[py][px]) {
              cells[cellY][cellX].cellType = cellType;
            }
          }
        }
      }

      currentX += charWidth + CHAR_SPACING;
    }

    currentY += CHAR_HEIGHT + LINE_SPACING;
  }

  return placements;
}
