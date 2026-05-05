/**
 * Local BFS solver - computes optimal (minimum) move count to win.
 *
 * Mirrors the on-chain DefaultBadgeAwarder thresholds so the win-modal can
 * pick a crown tier before the NFT mint round-trips: shows the player what
 * they earned the moment they win, not seconds later.
 *
 * State space is (x, y, hasRobe, hasScepter) so the BFS naturally enforces
 * the "must collect both regalia pieces before reaching crown" rule. The
 * maze is toroidal, so neighbour expansion uses canMove / getNewPosition
 * from mazeGenerator.
 */

import { canMove, getNewPosition } from './mazeGenerator';
import { CrownTier } from './spriteGlyphs';
import { MAX_MOVES } from './mazeConstants.generated';
import type { MazeData, Position } from '../types';

const DIRS = ['up', 'right', 'down', 'left'] as const;

/**
 * Returns the minimum move count to collect both regalia pieces and reach
 * the crown, or `null` if no winning path exists.
 */
export function computeOptimalMoves(
  maze: MazeData,
  start: Position,
  robe: Position,
  scepter: Position,
  goal: Position
): number | null {
  const W = maze.width;
  // Pack (x, y, hasRobe, hasScepter) into a single integer for visited set.
  const stateKey = (x: number, y: number, hasRobe: 0 | 1, hasScepter: 0 | 1) =>
    ((y * W + x) << 2) | (hasRobe << 1) | hasScepter;

  const startHasRobe: 0 | 1 = start.x === robe.x && start.y === robe.y ? 1 : 0;
  const startHasScepter: 0 | 1 =
    start.x === scepter.x && start.y === scepter.y ? 1 : 0;
  const visited = new Set<number>();
  visited.add(stateKey(start.x, start.y, startHasRobe, startHasScepter));

  type Node = {
    x: number;
    y: number;
    hasRobe: 0 | 1;
    hasScepter: 0 | 1;
    dist: number;
  };
  const queue: Node[] = [
    {
      x: start.x,
      y: start.y,
      hasRobe: startHasRobe,
      hasScepter: startHasScepter,
      dist: 0,
    },
  ];

  let head = 0;
  while (head < queue.length) {
    const node = queue[head++];
    if (
      node.hasRobe === 1 &&
      node.hasScepter === 1 &&
      node.x === goal.x &&
      node.y === goal.y
    ) {
      return node.dist;
    }
    for (const dir of DIRS) {
      if (!canMove(maze, { x: node.x, y: node.y }, dir)) continue;
      const next = getNewPosition(maze, { x: node.x, y: node.y }, dir);
      const nextHasRobe: 0 | 1 =
        node.hasRobe === 1 || (next.x === robe.x && next.y === robe.y) ? 1 : 0;
      const nextHasScepter: 0 | 1 =
        node.hasScepter === 1 || (next.x === scepter.x && next.y === scepter.y)
          ? 1
          : 0;
      const k = stateKey(next.x, next.y, nextHasRobe, nextHasScepter);
      if (visited.has(k)) continue;
      visited.add(k);
      queue.push({
        x: next.x,
        y: next.y,
        hasRobe: nextHasRobe,
        hasScepter: nextHasScepter,
        dist: node.dist + 1,
      });
    }
  }

  return null;
}

/**
 * Map a solve outcome to a CrownTier using the same thresholds as
 * contracts/src/DefaultBadgeAwarder.sol - keep them in sync.
 *
 * Tier ladder: Stone -> Plain -> Copper -> Silver -> Gold -> Robot.
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
