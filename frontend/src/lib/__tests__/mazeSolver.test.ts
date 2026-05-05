import { describe, it, expect } from 'vitest';
import {
  computeOptimalMoves,
  findOptimalPath,
  tierFromMoveCount,
} from '../mazeSolver';
import { generateMaze } from '../mazeGenerator';
import { validatePath } from '../zkSerialize';
import { CrownTier } from '../spriteGlyphs';
import { CellType, Move, type MazeData } from '../../types';
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
  it('returns total path length when both regalia are collected en-route', () => {
    const maze = openMaze(5, 5);
    // start (0,0) → robe (1,0) → scepter (3,0) → goal (4,0): 4 moves total.
    const optimal = computeOptimalMoves(
      maze,
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 }
    );
    expect(optimal).toBe(4);
  });

  it('detours through both pickups when off the direct path', () => {
    const maze = openMaze(5, 5);
    // start (0,0) → robe (0,2) → scepter (0,1) → goal (4,0).
    // Optimal: D D U U then wrap-left → 5 moves.
    const optimal = computeOptimalMoves(
      maze,
      { x: 0, y: 0 },
      { x: 0, y: 2 },
      { x: 0, y: 1 },
      { x: 4, y: 0 }
    );
    expect(optimal).toBe(5);
  });

  it('treats start === robe as already-collected', () => {
    const maze = openMaze(5, 5);
    // Start on robe (0,0), need scepter at (0,1), goal at (3,0).
    // Path: D, U, wrap-left twice = 4. Or D U L L = 4. BFS should find 4.
    const optimal = computeOptimalMoves(
      maze,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 3, y: 0 }
    );
    expect(optimal).toBe(4);
  });

  it('treats start === both pickups as fully equipped', () => {
    const maze = openMaze(5, 5);
    // Start on both robe and scepter, just need to reach goal.
    const optimal = computeOptimalMoves(
      maze,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 3, y: 0 }
    );
    expect(optimal).toBe(2); // wrap-left twice
  });

  it('exploits toroidal wraparound for shorter paths', () => {
    const maze = openMaze(10, 1);
    // Start on both robe and scepter (0,0), goal at (9,0): 1 wrap-left.
    const optimal = computeOptimalMoves(
      maze,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 9, y: 0 }
    );
    expect(optimal).toBe(1);
  });

  it('returns a valid solution for a real generated maze', () => {
    const { maze, kingPos, robePos, scepterPos, goalPos } =
      generateMaze('solver-test');
    const optimal = computeOptimalMoves(
      maze,
      kingPos,
      robePos,
      scepterPos,
      goalPos
    );
    expect(optimal).not.toBeNull();
    expect(optimal).toBeGreaterThan(0);
  });
});

describe('findOptimalPath', () => {
  it('returns a path whose length matches computeOptimalMoves', () => {
    const maze = openMaze(5, 5);
    const start = { x: 0, y: 0 };
    const robe = { x: 1, y: 0 };
    const scepter = { x: 3, y: 0 };
    const goal = { x: 4, y: 0 };

    const optimalLen = computeOptimalMoves(maze, start, robe, scepter, goal);
    const path = findOptimalPath(maze, start, robe, scepter, goal);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(optimalLen);
  });

  it('produces a path that validatePath accepts', () => {
    const maze = openMaze(5, 5);
    const start = { x: 0, y: 0 };
    const robe = { x: 0, y: 2 };
    const scepter = { x: 0, y: 1 };
    const goal = { x: 4, y: 0 };
    const path = findOptimalPath(maze, start, robe, scepter, goal);
    expect(path).not.toBeNull();
    expect(validatePath(maze, start, robe, scepter, goal, path!)).toEqual({
      valid: true,
    });
  });

  it('solves a real generated maze with a valid path', () => {
    const { maze, kingPos, robePos, scepterPos, goalPos } =
      generateMaze('solver-path-test');
    const path = findOptimalPath(maze, kingPos, robePos, scepterPos, goalPos);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);
    expect(
      validatePath(maze, kingPos, robePos, scepterPos, goalPos, path!)
    ).toEqual({ valid: true });
  });

  it('handles starting on a regalia piece', () => {
    const maze = openMaze(5, 5);
    const start = { x: 0, y: 0 };
    const robe = { x: 0, y: 0 }; // start on robe
    const scepter = { x: 2, y: 0 };
    const goal = { x: 4, y: 0 };
    const path = findOptimalPath(maze, start, robe, scepter, goal);
    expect(path).not.toBeNull();
    // No detour needed: just R R R R
    expect(path).toEqual([Move.Right, Move.Right, Move.Right, Move.Right]);
  });

  it('returns null when goal is unreachable without both regalia', () => {
    // Walled-off scepter: 2x1 maze with east wall between (0,0) and (1,0).
    const cells = [
      [
        { southWall: true, eastWall: true, cellType: CellType.Normal },
        { southWall: true, eastWall: true, cellType: CellType.Normal },
      ],
    ];
    // 2x1 toroidal grid with both walls means no neighbor reachable.
    const maze: MazeData = { width: 2, height: 1, cells };
    const path = findOptimalPath(
      maze,
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 }
    );
    expect(path).toBeNull();
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
    expect(tierFromMoveCount(49, 50)).toBe(CrownTier.Robot);
  });

  it('returns Gold below 1.05x optimal', () => {
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
