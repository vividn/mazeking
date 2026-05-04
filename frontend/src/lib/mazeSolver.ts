/**
 * Local BFS solver — computes optimal (minimum) move count to win.
 *
 * Mirrors the on-chain DefaultBadgeAwarder thresholds so the win-modal can
 * pick a crown tier before the NFT mint round-trips: shows the player what
 * they earned the moment they win, not seconds later.
 *
 * State space is (x, y, hasRegalia) so the BFS naturally enforces the
 * "must collect regalia before reaching crown" rule. The maze is toroidal,
 * so neighbour expansion uses canMove / getNewPosition from mazeGenerator.
 */

import { canMove, getNewPosition } from './mazeGenerator';
import { CrownTier } from './spriteGlyphs';
import { MAX_MOVES } from './mazeConstants.generated';
import type { MazeData, Position } from '../types';

const DIRS = ['up', 'right', 'down', 'left'] as const;

/**
 * Returns the minimum move count to collect the regalia and reach the crown,
 * or `null` if no winning path exists.
 */
export function computeOptimalMoves(
  maze: MazeData,
  start: Position,
  key: Position,
  goal: Position
): number | null {
  const W = maze.width;
  const stateKey = (x: number, y: number, hasKey: 0 | 1) =>
    (((y * W + x) << 1) | hasKey);

  const startHasKey: 0 | 1 = start.x === key.x && start.y === key.y ? 1 : 0;
  const visited = new Set<number>();
  visited.add(stateKey(start.x, start.y, startHasKey));

  type Node = { x: number; y: number; hasKey: 0 | 1; dist: number };
  const queue: Node[] = [
    { x: start.x, y: start.y, hasKey: startHasKey, dist: 0 },
  ];

  let head = 0;
  while (head < queue.length) {
    const node = queue[head++];
    if (node.hasKey === 1 && node.x === goal.x && node.y === goal.y) {
      return node.dist;
    }
    for (const dir of DIRS) {
      if (!canMove(maze, { x: node.x, y: node.y }, dir)) continue;
      const next = getNewPosition(maze, { x: node.x, y: node.y }, dir);
      const nextHasKey: 0 | 1 =
        node.hasKey === 1 || (next.x === key.x && next.y === key.y) ? 1 : 0;
      const k = stateKey(next.x, next.y, nextHasKey);
      if (visited.has(k)) continue;
      visited.add(k);
      queue.push({ x: next.x, y: next.y, hasKey: nextHasKey, dist: node.dist + 1 });
    }
  }

  return null;
}

/**
 * Map a solve outcome to a CrownTier using the same thresholds as
 * contracts/src/DefaultBadgeAwarder.sol — keep them in sync.
 *
 * Tier ladder: Stone → Plain → Copper → Silver → Gold → Robot.
 *  - Stone: hit MAX_MOVES (worst-case sentinel).
 *  - Robot: matched optimal exactly (perfect solve).
 *  - Gold/Silver/Copper: within 5% / 15% / 25% of optimal.
 *  - Plain: solved (registered) but no medal threshold met, or optimal unknown.
 */
export function tierFromMoveCount(
  moveCount: number,
  optimal: number | null
): CrownTier {
  if (moveCount >= MAX_MOVES) return CrownTier.Stone;
  if (optimal === null || optimal <= 0) return CrownTier.Plain;
  if (moveCount <= optimal) return CrownTier.Robot;

  const scaled = moveCount * 100;
  const base = optimal;
  if (scaled < base * 105) return CrownTier.Gold;
  if (scaled < base * 115) return CrownTier.Silver;
  if (scaled < base * 125) return CrownTier.Copper;
  return CrownTier.Plain;
}
