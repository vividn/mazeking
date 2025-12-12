import React, { useEffect, useRef } from 'react';
import type { MazeData, Position, ColorScheme } from '../types';
import { drawCrown, drawKey, drawChest, drawArrow, drawCornerWarp, getArrowColor } from '../glyphs';

interface MazeProps {
  maze: MazeData;
  playerPos: Position;
  keyPos: Position | null;
  doorPos: Position;
  hasKey: boolean;
  colors: ColorScheme;
  zoom: number;
  visited: Set<string>;
}

/**
 * Maze renderer component that displays the toroidal maze with player, key, and door.
 * Uses Canvas for performant rendering with zoom support centered on player.
 */
export const Maze: React.FC<MazeProps> = ({
  maze,
  playerPos,
  keyPos,
  doorPos,
  hasKey,
  colors,
  zoom,
  visited
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match container
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    // Calculate cell size to fit maze in available space
    const baseCellSize = Math.min(
      rect.width / maze.width,
      rect.height / maze.height
    );
    const cellSize = baseCellSize * zoom;

    // Calculate viewport offset to center on player when zoomed
    let offsetX = 0;
    let offsetY = 0;

    if (zoom > 1) {
      // Center on player
      const playerScreenX = playerPos.x * cellSize;
      const playerScreenY = playerPos.y * cellSize;
      offsetX = rect.width / 2 - playerScreenX - cellSize / 2;
      offsetY = rect.height / 2 - playerScreenY - cellSize / 2;
    } else {
      // Center maze in viewport when not zoomed
      offsetX = (rect.width - maze.width * cellSize) / 2;
      offsetY = (rect.height - maze.height * cellSize) / 2;
    }

    // Clear canvas with dark background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // Wall thickness - slightly thicker for outer perimeter
    const wallThickness = Math.max(2, cellSize * 0.1);
    const perimeterWallThickness = Math.max(3, cellSize * 0.13);

    // Draw all cells
    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        const cell = maze.cells[y][x];
        const cellX = x * cellSize;
        const cellY = y * cellSize;
        const isVisited = visited.has(`${x},${y}`);

        // Determine cell background color
        let bgColor: string;
        if (cell.isZkCell) {
          // Z and K letters get special purple/magenta highlight for zero-knowledge
          bgColor = isVisited ? colors.zkVisitedColor : colors.zkBackgroundColor;
        } else if (cell.isTextCell) {
          // Other text cells show visited state with a different shade
          bgColor = isVisited ? colors.textVisitedColor : colors.textBackgroundColor;
        } else if (isVisited) {
          bgColor = colors.visitedColor;
        } else {
          bgColor = colors.mazeBackgroundColor;
        }

        // Fill cell background
        ctx.fillStyle = bgColor;
        ctx.fillRect(cellX, cellY, cellSize, cellSize);

        // Draw walls - use same color for all walls
        ctx.strokeStyle = colors.wallColor;
        ctx.lineWidth = wallThickness;
        ctx.lineCap = 'square';

        // South wall
        if (cell.southWall) {
          ctx.beginPath();
          ctx.moveTo(cellX, cellY + cellSize);
          ctx.lineTo(cellX + cellSize, cellY + cellSize);
          ctx.stroke();
        }

        // East wall
        if (cell.eastWall) {
          ctx.beginPath();
          ctx.moveTo(cellX + cellSize, cellY);
          ctx.lineTo(cellX + cellSize, cellY + cellSize);
          ctx.stroke();
        }

        // North wall (wraps from bottom)
        const northCell = maze.cells[(y - 1 + maze.height) % maze.height][x];
        if (northCell.southWall) {
          ctx.beginPath();
          ctx.moveTo(cellX, cellY);
          ctx.lineTo(cellX + cellSize, cellY);
          ctx.stroke();
        }

        // West wall (wraps from right)
        const westCell = maze.cells[y][(x - 1 + maze.width) % maze.width];
        if (westCell.eastWall) {
          ctx.beginPath();
          ctx.moveTo(cellX, cellY);
          ctx.lineTo(cellX, cellY + cellSize);
          ctx.stroke();
        }
      }
    }

    // Draw thicker outer perimeter walls (inside the playing field, skipping warp passages)
    ctx.strokeStyle = colors.wallColor;
    ctx.lineWidth = perimeterWallThickness;
    ctx.lineCap = 'square';
    const perimeterInset = perimeterWallThickness / 2;

    // Top perimeter - draw segments, skipping warp passages
    for (let x = 0; x < maze.width; x++) {
      // Check if there's a wall at the top (north wall of top row = south wall of bottom row)
      const bottomCell = maze.cells[maze.height - 1][x];
      if (bottomCell.southWall) {
        ctx.beginPath();
        ctx.moveTo(x * cellSize, perimeterInset);
        ctx.lineTo((x + 1) * cellSize, perimeterInset);
        ctx.stroke();
      }
    }

    // Bottom perimeter - draw segments, skipping warp passages
    for (let x = 0; x < maze.width; x++) {
      const bottomCell = maze.cells[maze.height - 1][x];
      if (bottomCell.southWall) {
        ctx.beginPath();
        ctx.moveTo(x * cellSize, maze.height * cellSize - perimeterInset);
        ctx.lineTo((x + 1) * cellSize, maze.height * cellSize - perimeterInset);
        ctx.stroke();
      }
    }

    // Left perimeter - draw segments, skipping warp passages
    for (let y = 0; y < maze.height; y++) {
      // Check if there's a wall on the left (west wall of left column = east wall of right column)
      const rightCell = maze.cells[y][maze.width - 1];
      if (rightCell.eastWall) {
        ctx.beginPath();
        ctx.moveTo(perimeterInset, y * cellSize);
        ctx.lineTo(perimeterInset, (y + 1) * cellSize);
        ctx.stroke();
      }
    }

    // Right perimeter - draw segments, skipping warp passages
    for (let y = 0; y < maze.height; y++) {
      const rightCell = maze.cells[y][maze.width - 1];
      if (rightCell.eastWall) {
        ctx.beginPath();
        ctx.moveTo(maze.width * cellSize - perimeterInset, y * cellSize);
        ctx.lineTo(maze.width * cellSize - perimeterInset, (y + 1) * cellSize);
        ctx.stroke();
      }
    }

    // Draw wraparound arrows at edges where passages exist (BEFORE icons so icons render on top)
    // Each pair of matching arrows (top/bottom or left/right at same position) gets a unique color
    const arrowSize = cellSize * 0.35;

    // Collect vertical wraparound passages and assign colors
    let verticalIndex = 0;
    const verticalArrows: { x: number; color: string }[] = [];
    for (let x = 0; x < maze.width; x++) {
      const bottomCell = maze.cells[maze.height - 1][x];
      if (!bottomCell.southWall) {
        const color = getArrowColor(verticalIndex);
        verticalArrows.push({ x, color });
        verticalIndex++;
      }
    }

    // Collect horizontal wraparound passages and assign colors
    let horizontalIndex = 0;
    const horizontalArrows: { y: number; color: string }[] = [];
    for (let y = 0; y < maze.height; y++) {
      const rightCell = maze.cells[y][maze.width - 1];
      if (!rightCell.eastWall) {
        // Offset the starting hue to differentiate from vertical arrows
        const color = getArrowColor(horizontalIndex + 50);
        horizontalArrows.push({ y, color });
        horizontalIndex++;
      }
    }

    // Identify corner positions (where both vertical and horizontal warps exist)
    const topLeftCornerV = verticalArrows.find(a => a.x === 0);
    const topLeftCornerH = horizontalArrows.find(a => a.y === 0);
    const topRightCornerV = verticalArrows.find(a => a.x === maze.width - 1);
    const topRightCornerH = horizontalArrows.find(a => a.y === 0);
    const bottomLeftCornerV = verticalArrows.find(a => a.x === 0);
    const bottomLeftCornerH = horizontalArrows.find(a => a.y === maze.height - 1);
    const bottomRightCornerV = verticalArrows.find(a => a.x === maze.width - 1);
    const bottomRightCornerH = horizontalArrows.find(a => a.y === maze.height - 1);

    // Draw corner warps with special 4-way indicator
    if (topLeftCornerV && topLeftCornerH) {
      drawCornerWarp(ctx, arrowSize * 1.2, arrowSize * 1.2, topLeftCornerV.color, topLeftCornerH.color, arrowSize);
    }
    if (topRightCornerV && topRightCornerH) {
      drawCornerWarp(ctx, maze.width * cellSize - arrowSize * 1.2, arrowSize * 1.2, topRightCornerV.color, topRightCornerH.color, arrowSize);
    }
    if (bottomLeftCornerV && bottomLeftCornerH) {
      drawCornerWarp(ctx, arrowSize * 1.2, maze.height * cellSize - arrowSize * 1.2, bottomLeftCornerV.color, bottomLeftCornerH.color, arrowSize);
    }
    if (bottomRightCornerV && bottomRightCornerH) {
      drawCornerWarp(ctx, maze.width * cellSize - arrowSize * 1.2, maze.height * cellSize - arrowSize * 1.2, bottomRightCornerV.color, bottomRightCornerH.color, arrowSize);
    }

    // Draw top arrows (pointing up) - skip corners that have both warps
    for (const arrow of verticalArrows) {
      const isCorner = (arrow.x === 0 && topLeftCornerH) || (arrow.x === maze.width - 1 && topRightCornerH);
      if (!isCorner) {
        const cellX = arrow.x * cellSize + cellSize / 2;
        const cellY = arrowSize * 1.2;
        drawArrow(ctx, cellX, cellY, 'up', arrow.color, arrowSize);
      }
    }

    // Draw bottom arrows (pointing down) - skip corners that have both warps
    for (const arrow of verticalArrows) {
      const isCorner = (arrow.x === 0 && bottomLeftCornerH) || (arrow.x === maze.width - 1 && bottomRightCornerH);
      if (!isCorner) {
        const cellX = arrow.x * cellSize + cellSize / 2;
        const cellY = maze.height * cellSize - arrowSize * 1.2;
        drawArrow(ctx, cellX, cellY, 'down', arrow.color, arrowSize);
      }
    }

    // Draw left arrows (pointing left) - skip corners that have both warps
    for (const arrow of horizontalArrows) {
      const isCorner = (arrow.y === 0 && topLeftCornerV) || (arrow.y === maze.height - 1 && bottomLeftCornerV);
      if (!isCorner) {
        const cellX = arrowSize * 1.2;
        const cellY = arrow.y * cellSize + cellSize / 2;
        drawArrow(ctx, cellX, cellY, 'left', arrow.color, arrowSize);
      }
    }

    // Draw right arrows (pointing right) - skip corners that have both warps
    for (const arrow of horizontalArrows) {
      const isCorner = (arrow.y === 0 && topRightCornerV) || (arrow.y === maze.height - 1 && bottomRightCornerV);
      if (!isCorner) {
        const cellX = maze.width * cellSize - arrowSize * 1.2;
        const cellY = arrow.y * cellSize + cellSize / 2;
        drawArrow(ctx, cellX, cellY, 'right', arrow.color, arrowSize);
      }
    }

    // Helper to check if movement from one cell to another is blocked by a wall
    const canMove = (fromX: number, fromY: number, toX: number, toY: number): boolean => {
      const dx = toX - fromX;
      const dy = toY - fromY;

      // Check movement direction and corresponding wall
      if (dx === 1 || (dx === -(maze.width - 1))) {
        // Moving east (or wrapping from right edge to left)
        return !maze.cells[fromY][fromX].eastWall;
      } else if (dx === -1 || (dx === maze.width - 1)) {
        // Moving west (or wrapping from left edge to right)
        return !maze.cells[fromY][(fromX - 1 + maze.width) % maze.width].eastWall;
      } else if (dy === 1 || (dy === -(maze.height - 1))) {
        // Moving south (or wrapping from bottom to top)
        return !maze.cells[fromY][fromX].southWall;
      } else if (dy === -1 || (dy === maze.height - 1)) {
        // Moving north (or wrapping from top to bottom)
        return !maze.cells[(fromY - 1 + maze.height) % maze.height][fromX].southWall;
      }
      return false;
    };

    // BFS to find accessible cells within distance, respecting walls
    const getAccessibleCells = (startX: number, startY: number, maxDist: number): Map<string, number> => {
      const distances = new Map<string, number>();
      const queue: { x: number; y: number; dist: number }[] = [{ x: startX, y: startY, dist: 0 }];
      distances.set(`${startX},${startY}`, 0);

      while (queue.length > 0) {
        const { x, y, dist } = queue.shift()!;
        if (dist >= maxDist) continue;

        // Check all 4 directions
        const dirs = [
          { dx: 0, dy: -1 }, // north
          { dx: 1, dy: 0 },  // east
          { dx: 0, dy: 1 },  // south
          { dx: -1, dy: 0 }  // west
        ];

        for (const { dx, dy } of dirs) {
          const nx = (x + dx + maze.width) % maze.width;
          const ny = (y + dy + maze.height) % maze.height;
          const key = `${nx},${ny}`;

          if (!distances.has(key) && canMove(x, y, x + dx, y + dy)) {
            distances.set(key, dist + 1);
            queue.push({ x: nx, y: ny, dist: dist + 1 });
          }
        }
      }

      return distances;
    };

    // Helper to draw colored square under an entity with distance-based transparency
    const drawAccessibleHighlight = (pos: Position, baseColor: { r: number; g: number; b: number }, maxDist: number) => {
      const accessible = getAccessibleCells(pos.x, pos.y, maxDist);

      for (const [key, dist] of accessible) {
        const [x, y] = key.split(',').map(Number);
        const cellX = x * cellSize;
        const cellY = y * cellSize;

        // Opacity decreases with distance: 0.5 for dist 0, 0.3 for dist 1, 0.15 for dist 2
        const opacity = dist === 0 ? 0.5 : dist === 1 ? 0.3 : 0.15;
        ctx.fillStyle = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${opacity})`;
        ctx.fillRect(cellX, cellY, cellSize, cellSize);
      }
    };

    // Draw treasure chest with accessible square highlights
    // Chest color: red when locked, green when unlocked
    const chestColor = hasKey ? { r: 100, g: 200, b: 100 } : { r: 200, g: 60, b: 60 };
    drawAccessibleHighlight(doorPos, chestColor, 2);

    // Draw treasure chest icon (open with gold when player has key)
    drawChest(ctx, doorPos.x * cellSize + cellSize / 2, doorPos.y * cellSize + cellSize / 2, cellSize * 0.9, hasKey);

    // Draw key with gold accessible square highlights (if not collected)
    if (keyPos !== null) {
      const keyColor = { r: 255, g: 200, b: 50 };
      drawAccessibleHighlight(keyPos, keyColor, 2);
      drawKey(ctx, keyPos.x * cellSize + cellSize / 2, keyPos.y * cellSize + cellSize / 2, cellSize * 0.85);
    }

    // Draw player (crown)
    drawCrown(ctx, playerPos.x * cellSize + cellSize / 2, playerPos.y * cellSize + cellSize / 2, cellSize * 0.85);

    ctx.restore();
  }, [maze, playerPos, keyPos, doorPos, hasKey, colors, zoom, visited]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      // Trigger re-render by updating canvas
      const canvas = canvasRef.current;
      if (canvas) {
        // Force re-draw on next frame
        requestAnimationFrame(() => {
          const event = new Event('resize');
          window.dispatchEvent(event);
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1a1a',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          imageRendering: 'crisp-edges'
        }}
        aria-label={`Maze grid ${maze.width} by ${maze.height}. Player at ${playerPos.x}, ${playerPos.y}. ${hasKey ? 'Key collected' : `Key at ${keyPos?.x}, ${keyPos?.y}`}. Door at ${doorPos.x}, ${doorPos.y}.`}
        role="img"
      />
    </div>
  );
};
