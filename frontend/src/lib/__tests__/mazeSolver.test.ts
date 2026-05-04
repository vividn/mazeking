import { describe, it, expect } from 'vitest';
import { computeOptimalMoves, tierFromMoveCount } from '../mazeSolver';
import { generateMaze } from '../mazeGenerator';
import { CrownTier } from '../spriteGlyphs';
import { CellType, type MazeData } from '../../types';
import { MAX_MOVES } from '../mazeConstants.generated';

// Builds a fully-open W×H grid with no walls — useful for asserting BFS
// distances against straight-line Manhattan/wraparound moves.
function openMaze(width: number, height: number): MazeData {
  const cells = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push({
        southWall: false,
        eastWall: false,
        cellType: CellType.Normal,
      });
    }
    cells.push(row);
  }
  return { width, height, cells };
}

describe('computeOptimalMoves', () => {
  it('returns total path length when key is collected en-route to goal', () => {
    const maze = openMaze(5, 5);
    // start (0,0) → key (2,0) → goal (4,0): straight line, 4 moves total.
    const optimal = computeOptimalMoves(
      maze,
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 4, y: 0 }
    );
    expect(optimal).toBe(4);
  });

  it('detours through key when key is off the direct path', () => {
    const maze = openMaze(5, 5);
    // start (0,0) → key (0,2) → goal (4,0). On a 5x5 torus the cheapest route
    // is (0,0)→(0,1)→(0,2) then (0,2)→(0,1)→(0,0)→wrap-left→(4,0) = 5 moves.
    const optimal = computeOptimalMoves(
      maze,
      { x: 0, y: 0 },
      { x: 0, y: 2 },
      { x: 4, y: 0 }
    );
    expect(optimal).toBe(5);
  });

  it('treats start === key as already-collected (hasKey at dist 0)', () => {
    const maze = openMaze(5, 5);
    // (0,0) → (3,0) on a 5-wide torus: wrap-left twice (0→4→3) = 2 moves.
    const optimal = computeOptimalMoves(
      maze,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 3, y: 0 }
    );
    expect(optimal).toBe(2);
  });

  it('exploits toroidal wraparound for shorter paths', () => {
    const maze = openMaze(10, 1);
    // (0,0) → goal (9,0). Wrapping left: 1 step. Forward: 9 steps. BFS picks 1.
    const optimal = computeOptimalMoves(
      maze,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 9, y: 0 }
    );
    expect(optimal).toBe(1);
  });

  it('returns a valid solution for a real generated maze', () => {
    const { maze, kingPos, keyPos, goalPos } = generateMaze('solver-test');
    const optimal = computeOptimalMoves(maze, kingPos, keyPos, goalPos);
    expect(optimal).not.toBeNull();
    expect(optimal).toBeGreaterThan(0);
  });
});

describe('tierFromMoveCount', () => {
  it('returns Stone when moveCount hits MAX_MOVES regardless of optimal', () => {
    expect(tierFromMoveCount(MAX_MOVES, 50)).toBe(CrownTier.Stone);
    expect(tierFromMoveCount(MAX_MOVES, null)).toBe(CrownTier.Stone);
  });

  it('returns Plain when optimal is unknown and moveCount is finite', () => {
    expect(tierFromMoveCount(42, null)).toBe(CrownTier.Plain);
    expect(tierFromMoveCount(42, 0)).toBe(CrownTier.Plain);
  });

  it('returns Robot for an exactly-optimal solve', () => {
    expect(tierFromMoveCount(50, 50)).toBe(CrownTier.Robot);
  });

  it('returns Robot when moveCount is below claimed optimal (defensive)', () => {
    // Should never happen with a sound optimal, but the badge spec treats
    // "<= optimal" as the perfect bucket — match it.
    expect(tierFromMoveCount(49, 50)).toBe(CrownTier.Robot);
  });

  it('returns Gold below 1.05x optimal', () => {
    // optimal=100, < 105 moves → Gold
    expect(tierFromMoveCount(101, 100)).toBe(CrownTier.Gold);
    expect(tierFromMoveCount(104, 100)).toBe(CrownTier.Gold);
  });

  it('returns Silver in [1.05x, 1.15x) optimal', () => {
    expect(tierFromMoveCount(105, 100)).toBe(CrownTier.Silver);
    expect(tierFromMoveCount(114, 100)).toBe(CrownTier.Silver);
  });

  it('returns Copper in [1.15x, 1.25x) optimal', () => {
    expect(tierFromMoveCount(115, 100)).toBe(CrownTier.Copper);
    expect(tierFromMoveCount(124, 100)).toBe(CrownTier.Copper);
  });

  it('returns Plain at or above 1.25x optimal but below MAX_MOVES', () => {
    expect(tierFromMoveCount(125, 100)).toBe(CrownTier.Plain);
    expect(tierFromMoveCount(500, 100)).toBe(CrownTier.Plain);
  });
});
