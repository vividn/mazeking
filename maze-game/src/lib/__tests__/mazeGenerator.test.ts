import { describe, it, expect } from 'vitest';
import { generateMaze, canMove } from '../mazeGenerator';
import type { MazeData, Position } from '../../types';

describe('generateMaze', () => {
  describe('determinism', () => {
    it('produces identical maze for same seed', () => {
      const result1 = generateMaze('test-seed-123');
      const result2 = generateMaze('test-seed-123');

      expect(result1.maze.width).toBe(result2.maze.width);
      expect(result1.maze.height).toBe(result2.maze.height);
      expect(result1.kingPos).toEqual(result2.kingPos);
      expect(result1.keyPos).toEqual(result2.keyPos);
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
        result1.keyPos.x !== result2.keyPos.x ||
        result1.keyPos.y !== result2.keyPos.y;

      let wallsDiffer = false;
      const minWidth = Math.min(result1.maze.width, result2.maze.width);
      const minHeight = Math.min(result1.maze.height, result2.maze.height);
      for (let y = 0; y < minHeight && !wallsDiffer; y++) {
        for (let x = 0; x < minWidth && !wallsDiffer; x++) {
          if (
            result1.maze.cells[y][x].southWall !== result2.maze.cells[y][x].southWall ||
            result1.maze.cells[y][x].eastWall !== result2.maze.cells[y][x].eastWall
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
        expect(result1.keyPos).toEqual(result2.keyPos);
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
        const directions: Array<'up' | 'down' | 'left' | 'right'> = ['up', 'down', 'left', 'right'];

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
          if (!maze.cells[y][x].isTextCell) {
            nonTextCount++;
          }
        }
      }

      // All non-text cells should be reachable (minus king's starting cell if it's text)
      // Actually, we need at least the non-text cells to be connected
      const reachableNonText = Array.from(reachable).filter(key => {
        const [x, y] = key.split(',').map(Number);
        return !maze.cells[y][x].isTextCell;
      }).length;

      expect(reachableNonText).toBe(nonTextCount);
    });

    it('key position is reachable from king position', () => {
      const result = generateMaze('key-reachable-test');
      const { maze, kingPos, keyPos } = result;

      const reachable = findReachableCells(maze, kingPos);
      const keyKey = `${keyPos.x},${keyPos.y}`;

      expect(reachable.has(keyKey)).toBe(true);
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
      const { maze, kingPos, keyPos, goalPos } = result;

      expect(kingPos.x).toBeGreaterThanOrEqual(0);
      expect(kingPos.x).toBeLessThan(maze.width);
      expect(kingPos.y).toBeGreaterThanOrEqual(0);
      expect(kingPos.y).toBeLessThan(maze.height);

      expect(keyPos.x).toBeGreaterThanOrEqual(0);
      expect(keyPos.x).toBeLessThan(maze.width);
      expect(keyPos.y).toBeGreaterThanOrEqual(0);
      expect(keyPos.y).toBeLessThan(maze.height);

      expect(goalPos.x).toBeGreaterThanOrEqual(0);
      expect(goalPos.x).toBeLessThan(maze.width);
      expect(goalPos.y).toBeGreaterThanOrEqual(0);
      expect(goalPos.y).toBeLessThan(maze.height);
    });

    it('king, key, and goal are at different positions', () => {
      const result = generateMaze('positions-test');
      const { kingPos, keyPos, goalPos } = result;

      const kingKey = `${kingPos.x},${kingPos.y}`;
      const keyKey = `${keyPos.x},${keyPos.y}`;
      const goalKey = `${goalPos.x},${goalPos.y}`;

      expect(kingKey).not.toBe(keyKey);
      expect(kingKey).not.toBe(goalKey);
      expect(keyKey).not.toBe(goalKey);
    });

    it('text cells are marked correctly', () => {
      const result = generateMaze('ABC');
      const { maze } = result;

      // There should be some text cells
      let textCellCount = 0;
      for (let y = 0; y < maze.height; y++) {
        for (let x = 0; x < maze.width; x++) {
          if (maze.cells[y][x].isTextCell) {
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
          if (!maze.cells[y][x].isTextCell) continue;

          // Check south neighbor
          const sy = (y + 1) % maze.height;
          if (!maze.cells[sy][x].isTextCell && !maze.cells[y][x].southWall) {
            entryPointsFound++;
          }

          // Check east neighbor
          const ex = (x + 1) % maze.width;
          if (!maze.cells[y][ex].isTextCell && !maze.cells[y][x].eastWall) {
            entryPointsFound++;
          }

          // Check north neighbor (via their south wall)
          const ny = (y - 1 + maze.height) % maze.height;
          if (!maze.cells[ny][x].isTextCell && !maze.cells[ny][x].southWall) {
            entryPointsFound++;
          }

          // Check west neighbor (via their east wall)
          const wx = (x - 1 + maze.width) % maze.width;
          if (!maze.cells[y][wx].isTextCell && !maze.cells[y][wx].eastWall) {
            entryPointsFound++;
          }
        }
      }

      // Should have multiple entry points (3-6 per letter, and we have 4 letters)
      expect(entryPointsFound).toBeGreaterThanOrEqual(4);
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
function findReachableCellsSimple(maze: MazeData, start: Position): Set<string> {
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
