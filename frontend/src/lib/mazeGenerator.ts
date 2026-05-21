/**
 * ⚠️ CONSENSUS-CRITICAL FILE — see ma-5yi
 *
 * Orchestrator. The step order in `generateMaze` below drives the RNG draw
 * sequence; reordering steps 1–5b (or inserting/removing any rng.* call)
 * shifts the entire maze layout for every seed, even if the underlying
 * functions in `mazeLayout.ts` / `wordmarkPlacement.ts` are unchanged. The
 * debug branch (5c) is gated on `opts.debug` and only runs for debug-mode
 * seeds.
 *
 * Companion modules:
 *   - `wordmarkPlacement.ts` — pixel-font glyph positioning + WORDMARK_MARGIN
 *   - `mazeLayout.ts`        — wall carving, entry points, item placement
 *
 * Post-mainnet edits require a coordinated migration plan AND a
 * `consensus-critical-change: <bead-id>` line in the commit body.
 * Pre-mainnet edits must regenerate Pedersen fixtures
 * (`just regen-pedersen-fixtures`) and re-run the full test suite.
 *
 * The lint gate `just check-consensus-critical` enforces marker presence
 * and commit-message acks for changes to this file.
 */
import { createRng } from './seededRandom';
import { calculateMazeDimensions, embedTextCells } from './wordmarkPlacement';
import {
  createEmptyMaze,
  createInternalLetterPaths,
  createLetterBoundaryWalls,
  createLetterEntryPoints,
  generateNonTextMazePaths,
  removeExtraWallsForPathVariety,
  debugRemoveInternalWalls,
  findValidPositions,
} from './mazeLayout';
import type { MazeData, Position } from '../types';

export interface GeneratedMaze {
  maze: MazeData;
  kingPos: Position;
  robePos: Position;
  scepterPos: Position;
  goalPos: Position;
}

export interface GenerateOptions {
  debug?: boolean;
}

// CONSENSUS-CRITICAL: step order below drives RNG draw order. Reordering steps
// 1–5b (or inserting/removing any rng.* call) shifts the entire maze layout
// for every seed, even if individual functions are unchanged. The debug branch
// (5c) is gated on `opts.debug` and only runs for debug-mode seeds.
export function generateMaze(
  seed: string,
  opts: GenerateOptions = {}
): GeneratedMaze {
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

  // 5b. Add ~2% extra wall removals for path variety (cycles)
  removeExtraWallsForPathVariety(maze, rng);

  // 5c. Debug mode: blow out most non-text internal walls for fast testing
  if (opts.debug) {
    debugRemoveInternalWalls(maze, rng);
  }

  // 6. Find positions for king, robe, scepter, goal
  const { kingPos, robePos, scepterPos, goalPos } = findValidPositions(
    maze,
    rng
  );

  return { maze, kingPos, robePos, scepterPos, goalPos };
}
