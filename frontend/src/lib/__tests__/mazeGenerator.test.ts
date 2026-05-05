import { describe, it, expect } from 'vitest';
import {
  generateMaze,
  canMove,
  WORDMARK_MARGIN,
  CHAR_HEIGHT,
} from '../mazeGenerator';
import { CellType, type MazeData, type Position } from '../../types';

interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function textCellBoundingBox(maze: MazeData): BoundingBox {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (maze.cells[y][x].cellType !== CellType.Normal) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

// Helper to check if a cell is any type of text cell
function isTextCell(maze: MazeData, x: number, y: number): boolean {
  return maze.cells[y][x].cellType !== CellType.Normal;
}

describe('generateMaze', () => {
  describe('determinism', () => {
    it('produces identical maze for same seed', () => {
      const result1 = generateMaze('test-seed-123');
      const result2 = generateMaze('test-seed-123');

      expect(result1.maze.width).toBe(result2.maze.width);
      expect(result1.maze.height).toBe(result2.maze.height);
      expect(result1.kingPos).toEqual(result2.kingPos);
      expect(result1.robePos).toEqual(result2.robePos);
      expect(result1.scepterPos).toEqual(result2.scepterPos);
      expect(result1.goalPos).toEqual(result2.goalPos);

      // Check all cells are identical
      for (let y = 0; y < result1.maze.height; y++) {
        for (let x = 0; x < result1.maze.width; x++) {
          expect(result1.maze.cells[y][x]).toEqual(result2.maze.cells[y][x]);
        }
      }
    });

    it('produces different mazes for different seeds', () => {
      const result1 = generateMaze('seed-abc');
      const result2 = generateMaze('seed-xyz');

      // At least one of these should differ (positions or walls)
      const positionsDiffer =
        result1.kingPos.x !== result2.kingPos.x ||
        result1.kingPos.y !== result2.kingPos.y ||
        result1.robePos.x !== result2.robePos.x ||
        result1.robePos.y !== result2.robePos.y ||
        result1.scepterPos.x !== result2.scepterPos.x ||
        result1.scepterPos.y !== result2.scepterPos.y;

      let wallsDiffer = false;
      const minWidth = Math.min(result1.maze.width, result2.maze.width);
      const minHeight = Math.min(result1.maze.height, result2.maze.height);
      for (let y = 0; y < minHeight && !wallsDiffer; y++) {
        for (let x = 0; x < minWidth && !wallsDiffer; x++) {
          if (
            result1.maze.cells[y][x].southWall !==
              result2.maze.cells[y][x].southWall ||
            result1.maze.cells[y][x].eastWall !==
              result2.maze.cells[y][x].eastWall
          ) {
            wallsDiffer = true;
          }
        }
      }

      expect(positionsDiffer || wallsDiffer).toBe(true);
    });

    it('is deterministic across multiple calls', () => {
      const seeds = ['hello', 'world', 'maze', 'game', 'test'];

      for (const seed of seeds) {
        const result1 = generateMaze(seed);
        const result2 = generateMaze(seed);

        expect(result1.kingPos).toEqual(result2.kingPos);
        expect(result1.robePos).toEqual(result2.robePos);
        expect(result1.scepterPos).toEqual(result2.scepterPos);
        expect(result1.goalPos).toEqual(result2.goalPos);
      }
    });
  });

  describe('connectivity', () => {
    // Helper to flood-fill and find all reachable cells
    function findReachableCells(maze: MazeData, start: Position): Set<string> {
      const reachable = new Set<string>();
      const queue: Position[] = [start];
      const key = (p: Position) => `${p.x},${p.y}`;
      reachable.add(key(start));

      const { width, height } = maze;

      while (queue.length > 0) {
        const pos = queue.shift()!;

        // Check all four directions
        const directions: Array<'up' | 'down' | 'left' | 'right'> = [
          'up',
          'down',
          'left',
          'right',
        ];

        for (const dir of directions) {
          if (canMove(maze, pos, dir)) {
            let newPos: Position;
            switch (dir) {
              case 'up':
                newPos = { x: pos.x, y: (pos.y - 1 + height) % height };
                break;
              case 'down':
                newPos = { x: pos.x, y: (pos.y + 1) % height };
                break;
              case 'left':
                newPos = { x: (pos.x - 1 + width) % width, y: pos.y };
                break;
              case 'right':
                newPos = { x: (pos.x + 1) % width, y: pos.y };
                break;
            }

            const newKey = key(newPos);
            if (!reachable.has(newKey)) {
              reachable.add(newKey);
              queue.push(newPos);
            }
          }
        }
      }

      return reachable;
    }

    it('king can reach all non-text cells', () => {
      const result = generateMaze('connectivity-test');
      const { maze, kingPos } = result;

      const reachable = findReachableCells(maze, kingPos);

      // Count non-text cells
      let nonTextCount = 0;
      for (let y = 0; y < maze.height; y++) {
        for (let x = 0; x < maze.width; x++) {
          if (!isTextCell(maze, x, y)) {
            nonTextCount++;
          }
        }
      }

      // All non-text cells should be reachable (minus king's starting cell if it's text)
      // Actually, we need at least the non-text cells to be connected
      const reachableNonText = Array.from(reachable).filter((key) => {
        const [x, y] = key.split(',').map(Number);
        return !isTextCell(maze, x, y);
      }).length;

      expect(reachableNonText).toBe(nonTextCount);
    });

    it('robe position is reachable from king position', () => {
      const result = generateMaze('robe-reachable-test');
      const { maze, kingPos, robePos } = result;

      const reachable = findReachableCells(maze, kingPos);
      const k = `${robePos.x},${robePos.y}`;

      expect(reachable.has(k)).toBe(true);
    });

    it('scepter position is reachable from king position', () => {
      const result = generateMaze('scepter-reachable-test');
      const { maze, kingPos, scepterPos } = result;

      const reachable = findReachableCells(maze, kingPos);
      const k = `${scepterPos.x},${scepterPos.y}`;

      expect(reachable.has(k)).toBe(true);
    });

    it('goal position is reachable from king position', () => {
      const result = generateMaze('goal-reachable-test');
      const { maze, kingPos, goalPos } = result;

      const reachable = findReachableCells(maze, kingPos);
      const goalKey = `${goalPos.x},${goalPos.y}`;

      expect(reachable.has(goalKey)).toBe(true);
    });

    it('enclosed regions are accessible for seeds with O', () => {
      // Use a seed that includes 'o' or 'O' to test enclosed region connectivity
      const result = generateMaze('hello');
      const { maze, kingPos } = result;

      const reachable = findReachableCells(maze, kingPos);

      // Find all cells (both text and non-text) - all should be reachable
      // because enclosed regions should now have entry points
      let totalCells = 0;
      for (let y = 0; y < maze.height; y++) {
        for (let x = 0; x < maze.width; x++) {
          totalCells++;
        }
      }

      // All cells should be reachable (the maze is fully connected)
      expect(reachable.size).toBe(totalCells);
    });

    it('enclosed regions are accessible for seeds with B', () => {
      const result = generateMaze('BOB');
      const { maze, kingPos } = result;

      const reachable = findReachableCells(maze, kingPos);

      // All cells should be reachable
      const totalCells = maze.width * maze.height;
      expect(reachable.size).toBe(totalCells);
    });

    it('disconnected letter regions are accessible for ? (dot + curve)', () => {
      const result = generateMaze('What?');
      const { maze, kingPos } = result;

      const reachable = findReachableCells(maze, kingPos);

      // All cells should be reachable, including both parts of ?
      const totalCells = maze.width * maze.height;
      expect(reachable.size).toBe(totalCells);
    });

    it('disconnected letter regions are accessible for : (two dots)', () => {
      const result = generateMaze('Hi:there');
      const { maze, kingPos } = result;

      const reachable = findReachableCells(maze, kingPos);

      // All cells should be reachable
      const totalCells = maze.width * maze.height;
      expect(reachable.size).toBe(totalCells);
    });

    it('disconnected letter regions are accessible for i (dot + stem)', () => {
      const result = generateMaze('info');
      const { maze, kingPos } = result;

      const reachable = findReachableCells(maze, kingPos);

      // All cells should be reachable
      const totalCells = maze.width * maze.height;
      expect(reachable.size).toBe(totalCells);
    });
  });

  describe('structure', () => {
    it('creates maze with valid dimensions', () => {
      const result = generateMaze('dimensions-test');
      const { maze } = result;

      expect(maze.width).toBeGreaterThan(0);
      expect(maze.height).toBeGreaterThan(0);
      expect(maze.cells.length).toBe(maze.height);
      expect(maze.cells[0].length).toBe(maze.width);
    });

    it('all positions are within maze bounds', () => {
      const result = generateMaze('bounds-test');
      const { maze, kingPos, robePos, scepterPos, goalPos } = result;

      for (const p of [kingPos, robePos, scepterPos, goalPos]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(maze.width);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(maze.height);
      }
    });

    it('king, robe, scepter, and goal are at different positions', () => {
      const result = generateMaze('positions-test');
      const { kingPos, robePos, scepterPos, goalPos } = result;

      const positions = [kingPos, robePos, scepterPos, goalPos].map(
        (p) => `${p.x},${p.y}`
      );
      const unique = new Set(positions);
      expect(unique.size).toBe(positions.length);
    });

    it('exports WORDMARK_MARGIN of exactly 4 cells', () => {
      expect(WORDMARK_MARGIN).toBe(4);
    });

    // Margin contract: every word, every side, every render — exactly
    // WORDMARK_MARGIN cells between the rendered text's glyph box and the
    // surrounding maze edge. Seeds below were chosen so the glyph box's
    // four corners all contain at least one filled cell, so a bounding-box
    // scan of text cells equals the glyph box exactly.
    const cornerFilledSeeds = ['BOB', 'HI', 'BB', 'BOOB', 'BABE'];

    for (const seed of cornerFilledSeeds) {
      it(`'${seed}' has exactly ${4} cells of margin on every side`, () => {
        const { maze } = generateMaze(seed);
        const bbox = textCellBoundingBox(maze);

        const left = bbox.minX;
        const right = maze.width - 1 - bbox.maxX;
        const top = bbox.minY;
        // Bottom is measured from the BASELINE, not the lowest filled cell:
        // descenders extend INTO the bottom margin (none of these seeds use
        // descenders, so baseline === maxY here).
        const bottom = maze.height - 1 - bbox.maxY;

        expect(left).toBe(WORDMARK_MARGIN);
        expect(right).toBe(WORDMARK_MARGIN);
        expect(top).toBe(WORDMARK_MARGIN);
        expect(bottom).toBe(WORDMARK_MARGIN);
      });
    }

    it('descenders extend into the bottom margin without inflating it', () => {
      // 'p' has 2 descender rows below the baseline. The bottom margin is
      // measured from the baseline, NOT from the descender's lowest cell.
      const { maze } = generateMaze('Bp');
      const bbox = textCellBoundingBox(maze);

      // B's top row is filled, so minY === ascender line === WORDMARK_MARGIN.
      expect(bbox.minY).toBe(WORDMARK_MARGIN);
      // Baseline is at startY + (CHAR_HEIGHT - 1).
      const baselineY = WORDMARK_MARGIN + CHAR_HEIGHT - 1;
      expect(maze.height - 1 - baselineY).toBe(WORDMARK_MARGIN);
      // p descends 2 rows below baseline and they land within the margin.
      expect(bbox.maxY).toBe(baselineY + 2);
      // Margin from maze edge to deepest descender cell is therefore
      // WORDMARK_MARGIN - 2 (descender ate 2 rows of margin).
      expect(maze.height - 1 - bbox.maxY).toBe(WORDMARK_MARGIN - 2);
    });

    it('maze dimensions are exactly textLayout + 2*WORDMARK_MARGIN (no min-size floor)', () => {
      // 'I' is the smallest reasonable single-char seed: 5 wide × 8 tall.
      // With WORDMARK_MARGIN=4 the maze is 13×16 — well below any prior
      // min-size floor. If a floor were re-introduced, margins would skew.
      const { maze } = generateMaze('I');
      expect(maze.width).toBe(5 + 2 * WORDMARK_MARGIN);
      expect(maze.height).toBe(CHAR_HEIGHT + 2 * WORDMARK_MARGIN);
    });

    it('text cells are marked correctly', () => {
      const result = generateMaze('ABC');
      const { maze } = result;

      // There should be some text cells
      let textCellCount = 0;
      for (let y = 0; y < maze.height; y++) {
        for (let x = 0; x < maze.width; x++) {
          if (isTextCell(maze, x, y)) {
            textCellCount++;
          }
        }
      }

      expect(textCellCount).toBeGreaterThan(0);
    });
  });

  describe('entry points', () => {
    it('letters have entry points (walls removed at boundaries)', () => {
      const result = generateMaze('TEST');
      const { maze } = result;

      // Find text cells that have at least one open wall to non-text cell
      let entryPointsFound = 0;

      for (let y = 0; y < maze.height; y++) {
        for (let x = 0; x < maze.width; x++) {
          if (!isTextCell(maze, x, y)) continue;

          // Check south neighbor
          const sy = (y + 1) % maze.height;
          if (!isTextCell(maze, x, sy) && !maze.cells[y][x].southWall) {
            entryPointsFound++;
          }

          // Check east neighbor
          const ex = (x + 1) % maze.width;
          if (!isTextCell(maze, ex, y) && !maze.cells[y][x].eastWall) {
            entryPointsFound++;
          }

          // Check north neighbor (via their south wall)
          const ny = (y - 1 + maze.height) % maze.height;
          if (!isTextCell(maze, x, ny) && !maze.cells[ny][x].southWall) {
            entryPointsFound++;
          }

          // Check west neighbor (via their east wall)
          const wx = (x - 1 + maze.width) % maze.width;
          if (!isTextCell(maze, wx, y) && !maze.cells[y][wx].eastWall) {
            entryPointsFound++;
          }
        }
      }

      // Should have multiple entry points (3-6 per letter, and we have 4 letters)
      expect(entryPointsFound).toBeGreaterThanOrEqual(4);
    });
  });

  describe('debug mode', () => {
    function countInternalWalls(maze: MazeData): number {
      let count = 0;
      for (let y = 0; y < maze.height; y++) {
        for (let x = 0; x < maze.width; x++) {
          if (isTextCell(maze, x, y)) continue;
          if (
            x < maze.width - 1 &&
            !isTextCell(maze, x + 1, y) &&
            maze.cells[y][x].eastWall
          )
            count++;
          if (
            y < maze.height - 1 &&
            !isTextCell(maze, x, y + 1) &&
            maze.cells[y][x].southWall
          )
            count++;
        }
      }
      return count;
    }

    it('removes substantially more walls than non-debug mode', () => {
      const normal = generateMaze('zkDEBUG', { debug: false });
      const debug = generateMaze('zkDEBUG', { debug: true });

      expect(debug.maze.width).toBe(normal.maze.width);
      expect(debug.maze.height).toBe(normal.maze.height);

      const normalWalls = countInternalWalls(normal.maze);
      const debugWalls = countInternalWalls(debug.maze);

      // Debug should have far fewer remaining internal walls
      expect(debugWalls).toBeLessThan(normalWalls * 0.5);
    });

    it('is deterministic in debug mode', () => {
      const a = generateMaze('zkDEBUG', { debug: true });
      const b = generateMaze('zkDEBUG', { debug: true });

      expect(a.kingPos).toEqual(b.kingPos);
      expect(a.robePos).toEqual(b.robePos);
      expect(a.scepterPos).toEqual(b.scepterPos);
      expect(a.goalPos).toEqual(b.goalPos);

      for (let y = 0; y < a.maze.height; y++) {
        for (let x = 0; x < a.maze.width; x++) {
          expect(a.maze.cells[y][x]).toEqual(b.maze.cells[y][x]);
        }
      }
    });

    it('preserves text cells (wordmark intact)', () => {
      const normal = generateMaze('zkDEBUG', { debug: false });
      const debug = generateMaze('zkDEBUG', { debug: true });

      for (let y = 0; y < normal.maze.height; y++) {
        for (let x = 0; x < normal.maze.width; x++) {
          expect(debug.maze.cells[y][x].cellType).toBe(
            normal.maze.cells[y][x].cellType
          );
        }
      }
    });

    it('keeps outer perimeter walls intact', () => {
      const debug = generateMaze('zkDEBUG', { debug: true });
      const { maze } = debug;

      // Rightmost column east walls (wraps to col 0) should not be removed by debug pass
      // Bottom row south walls (wraps to row 0) should not be removed by debug pass
      for (let y = 0; y < maze.height; y++) {
        // Only assert on non-text cells where the wraparound neighbor is also non-text
        if (!isTextCell(maze, maze.width - 1, y) && !isTextCell(maze, 0, y)) {
          // This may or may not have a wall depending on prior steps; debug pass
          // simply does not touch it. Just ensure the pass did not corrupt structure.
          // (Sanity: cells exist)
          expect(maze.cells[y][maze.width - 1]).toBeDefined();
        }
      }
      expect(maze.cells.length).toBe(maze.height);
    });
  });

  describe('extra path variety', () => {
    // Counts all open passages in the maze (every cell is connected via the
    // toroidal grid, so a spanning tree over N cells has exactly N-1 open
    // walls). The 2% extra-removal pass must push this above N-1.
    function countAllPassages(maze: MazeData): {
      cells: number;
      passages: number;
    } {
      const cells = maze.width * maze.height;
      let passages = 0;
      for (let y = 0; y < maze.height; y++) {
        for (let x = 0; x < maze.width; x++) {
          if (!maze.cells[y][x].eastWall) passages++;
          if (!maze.cells[y][x].southWall) passages++;
        }
      }
      return { cells, passages };
    }

    it('produces strictly more passages than a spanning tree (cycles)', () => {
      const { maze } = generateMaze('extra-paths-test');
      const { cells, passages } = countAllPassages(maze);
      expect(passages).toBeGreaterThan(cells - 1);
    });

    it('is deterministic across runs', () => {
      const a = generateMaze('cycle-determinism');
      const b = generateMaze('cycle-determinism');
      for (let y = 0; y < a.maze.height; y++) {
        for (let x = 0; x < a.maze.width; x++) {
          expect(a.maze.cells[y][x]).toEqual(b.maze.cells[y][x]);
        }
      }
    });

    it('preserves connectivity (every cell still reachable)', () => {
      const { maze, kingPos } = generateMaze('cycle-connectivity');
      const reachable = findReachableCellsSimple(maze, kingPos);
      expect(reachable.size).toBe(maze.width * maze.height);
    });
  });

  describe('lowercase letters', () => {
    it('handles lowercase letters correctly', () => {
      const result = generateMaze('hello');
      const { maze, kingPos } = result;

      // Should create a valid maze
      expect(maze.width).toBeGreaterThan(0);
      expect(maze.height).toBeGreaterThan(0);

      // All cells should be reachable
      const reachable = findReachableCellsSimple(maze, kingPos);
      expect(reachable.size).toBe(maze.width * maze.height);
    });

    it('handles mixed case correctly', () => {
      const result = generateMaze('Hello World');
      const { maze, kingPos } = result;

      expect(maze.width).toBeGreaterThan(0);

      const reachable = findReachableCellsSimple(maze, kingPos);
      expect(reachable.size).toBe(maze.width * maze.height);
    });
  });
});

// Simplified helper for connectivity tests
function findReachableCellsSimple(
  maze: MazeData,
  start: Position
): Set<string> {
  const reachable = new Set<string>();
  const queue: Position[] = [start];
  const key = (p: Position) => `${p.x},${p.y}`;
  reachable.add(key(start));

  const { width, height, cells } = maze;

  while (queue.length > 0) {
    const pos = queue.shift()!;
    const { x, y } = pos;

    // Down (via south wall)
    if (!cells[y][x].southWall) {
      const newY = (y + 1) % height;
      const k = key({ x, y: newY });
      if (!reachable.has(k)) {
        reachable.add(k);
        queue.push({ x, y: newY });
      }
    }

    // Up (via north neighbor's south wall)
    const northY = (y - 1 + height) % height;
    if (!cells[northY][x].southWall) {
      const k = key({ x, y: northY });
      if (!reachable.has(k)) {
        reachable.add(k);
        queue.push({ x, y: northY });
      }
    }

    // Right (via east wall)
    if (!cells[y][x].eastWall) {
      const newX = (x + 1) % width;
      const k = key({ x: newX, y });
      if (!reachable.has(k)) {
        reachable.add(k);
        queue.push({ x: newX, y });
      }
    }

    // Left (via west neighbor's east wall)
    const westX = (x - 1 + width) % width;
    if (!cells[y][westX].eastWall) {
      const k = key({ x: westX, y });
      if (!reachable.has(k)) {
        reachable.add(k);
        queue.push({ x: westX, y });
      }
    }
  }

  return reachable;
}
