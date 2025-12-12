import React, { useEffect, useRef } from 'react';
import type { MazeData, Position, ColorScheme } from '../types';

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

    // Generate distinct colors for arrow pairs based on position
    const getArrowColor = (index: number): string => {
      // Use golden ratio to distribute hues evenly
      // Brighter colors (60% lightness) for better visibility
      const hue = (index * 137.508) % 360;
      return `hsla(${hue}, 90%, 60%, 1.0)`;
    };

    // Helper to draw a small arrow with high visibility
    const drawArrow = (x: number, y: number, direction: 'up' | 'down' | 'left' | 'right', color: string) => {
      ctx.save();
      ctx.translate(x, y);

      // Rotate based on direction
      const rotations = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
      ctx.rotate(rotations[direction]);

      // Draw arrow pointing up (will be rotated)
      // White outer glow for visibility
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -arrowSize / 2);
      ctx.lineTo(arrowSize / 2, arrowSize / 2);
      ctx.lineTo(-arrowSize / 2, arrowSize / 2);
      ctx.closePath();
      ctx.stroke();

      // Dark inner stroke
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Fill with the unique color
      ctx.fillStyle = color;
      ctx.fill();

      ctx.restore();
    };

    // Helper to draw a corner warp indicator (4-way star/cross shape)
    const drawCornerWarp = (x: number, y: number, vColor: string, hColor: string) => {
      ctx.save();
      ctx.translate(x, y);
      const size = arrowSize * 0.9;

      // Draw a 4-pointed star shape with both colors
      // White outer glow
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 3;

      // Vertical arrows (up and down)
      ctx.beginPath();
      // Up arrow
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.4, -size * 0.3);
      ctx.lineTo(-size * 0.4, -size * 0.3);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = vColor;
      ctx.fill();

      // Down arrow
      ctx.beginPath();
      ctx.moveTo(0, size);
      ctx.lineTo(size * 0.4, size * 0.3);
      ctx.lineTo(-size * 0.4, size * 0.3);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = vColor;
      ctx.fill();

      // Horizontal arrows (left and right)
      // Left arrow
      ctx.beginPath();
      ctx.moveTo(-size, 0);
      ctx.lineTo(-size * 0.3, size * 0.4);
      ctx.lineTo(-size * 0.3, -size * 0.4);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = hColor;
      ctx.fill();

      // Right arrow
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(size * 0.3, size * 0.4);
      ctx.lineTo(size * 0.3, -size * 0.4);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = hColor;
      ctx.fill();

      ctx.restore();
    };

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
      drawCornerWarp(arrowSize * 1.2, arrowSize * 1.2, topLeftCornerV.color, topLeftCornerH.color);
    }
    if (topRightCornerV && topRightCornerH) {
      drawCornerWarp(maze.width * cellSize - arrowSize * 1.2, arrowSize * 1.2, topRightCornerV.color, topRightCornerH.color);
    }
    if (bottomLeftCornerV && bottomLeftCornerH) {
      drawCornerWarp(arrowSize * 1.2, maze.height * cellSize - arrowSize * 1.2, bottomLeftCornerV.color, bottomLeftCornerH.color);
    }
    if (bottomRightCornerV && bottomRightCornerH) {
      drawCornerWarp(maze.width * cellSize - arrowSize * 1.2, maze.height * cellSize - arrowSize * 1.2, bottomRightCornerV.color, bottomRightCornerH.color);
    }

    // Draw top arrows (pointing up) - skip corners that have both warps
    for (const arrow of verticalArrows) {
      const isCorner = (arrow.x === 0 && topLeftCornerH) || (arrow.x === maze.width - 1 && topRightCornerH);
      if (!isCorner) {
        const cellX = arrow.x * cellSize + cellSize / 2;
        const cellY = arrowSize * 1.2;
        drawArrow(cellX, cellY, 'up', arrow.color);
      }
    }

    // Draw bottom arrows (pointing down) - skip corners that have both warps
    for (const arrow of verticalArrows) {
      const isCorner = (arrow.x === 0 && bottomLeftCornerH) || (arrow.x === maze.width - 1 && bottomRightCornerH);
      if (!isCorner) {
        const cellX = arrow.x * cellSize + cellSize / 2;
        const cellY = maze.height * cellSize - arrowSize * 1.2;
        drawArrow(cellX, cellY, 'down', arrow.color);
      }
    }

    // Draw left arrows (pointing left) - skip corners that have both warps
    for (const arrow of horizontalArrows) {
      const isCorner = (arrow.y === 0 && topLeftCornerV) || (arrow.y === maze.height - 1 && bottomLeftCornerV);
      if (!isCorner) {
        const cellX = arrowSize * 1.2;
        const cellY = arrow.y * cellSize + cellSize / 2;
        drawArrow(cellX, cellY, 'left', arrow.color);
      }
    }

    // Draw right arrows (pointing right) - skip corners that have both warps
    for (const arrow of horizontalArrows) {
      const isCorner = (arrow.y === 0 && topRightCornerV) || (arrow.y === maze.height - 1 && bottomRightCornerV);
      if (!isCorner) {
        const cellX = maze.width * cellSize - arrowSize * 1.2;
        const cellY = arrow.y * cellSize + cellSize / 2;
        drawArrow(cellX, cellY, 'right', arrow.color);
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

    // Helper to draw a custom locked treasure chest
    const drawLockedChest = (pos: Position, scale: number) => {
      const cellX = pos.x * cellSize + cellSize / 2;
      const cellY = pos.y * cellSize + cellSize / 2;
      const size = cellSize * scale;

      ctx.save();
      ctx.translate(cellX, cellY);

      // Shadow for depth
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      const woodMain = '#8B4513';
      const woodDark = '#5D2E0C';
      const woodLight = '#A0522D';
      const metalDark = '#2a2a2a';
      const metalLight = '#5a5a5a';
      const outline = '#1a0a00';

      // Chest body dimensions
      const chestWidth = size * 0.8;
      const chestHeight = size * 0.5;
      const chestX = -chestWidth / 2;
      const chestY = -chestHeight / 2 + size * 0.12;

      // Body outline
      ctx.strokeStyle = outline;
      ctx.lineWidth = 3;
      ctx.strokeRect(chestX, chestY, chestWidth, chestHeight);

      // Body fill with gradient
      const bodyGrad = ctx.createLinearGradient(chestX, chestY, chestX, chestY + chestHeight);
      bodyGrad.addColorStop(0, woodLight);
      bodyGrad.addColorStop(0.5, woodMain);
      bodyGrad.addColorStop(1, woodDark);
      ctx.fillStyle = bodyGrad;
      ctx.fillRect(chestX, chestY, chestWidth, chestHeight);

      // Chest lid (curved top)
      const lidHeight = size * 0.22;
      ctx.beginPath();
      ctx.moveTo(chestX - size * 0.03, chestY);
      ctx.lineTo(chestX + chestWidth + size * 0.03, chestY);
      ctx.lineTo(chestX + chestWidth, chestY - lidHeight * 0.4);
      ctx.quadraticCurveTo(chestX + chestWidth / 2, chestY - lidHeight, chestX, chestY - lidHeight * 0.4);
      ctx.closePath();
      ctx.strokeStyle = outline;
      ctx.lineWidth = 3;
      ctx.stroke();
      const lidGrad = ctx.createLinearGradient(0, chestY - lidHeight, 0, chestY);
      lidGrad.addColorStop(0, woodDark);
      lidGrad.addColorStop(0.5, woodMain);
      lidGrad.addColorStop(1, woodLight);
      ctx.fillStyle = lidGrad;
      ctx.fill();

      // Metal bands with outlines
      ctx.fillStyle = metalDark;
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.5;

      // Top band
      ctx.fillRect(chestX, chestY, chestWidth, size * 0.045);
      ctx.strokeRect(chestX, chestY, chestWidth, size * 0.045);
      // Bottom band
      ctx.fillRect(chestX, chestY + chestHeight - size * 0.045, chestWidth, size * 0.045);
      ctx.strokeRect(chestX, chestY + chestHeight - size * 0.045, chestWidth, size * 0.045);
      // Vertical bands
      ctx.fillRect(chestX + chestWidth * 0.12, chestY, size * 0.04, chestHeight);
      ctx.strokeRect(chestX + chestWidth * 0.12, chestY, size * 0.04, chestHeight);
      ctx.fillRect(chestX + chestWidth * 0.84, chestY, size * 0.04, chestHeight);
      ctx.strokeRect(chestX + chestWidth * 0.84, chestY, size * 0.04, chestHeight);

      // Metal highlights
      ctx.fillStyle = metalLight;
      ctx.fillRect(chestX + chestWidth * 0.12, chestY, size * 0.015, chestHeight);
      ctx.fillRect(chestX + chestWidth * 0.84, chestY, size * 0.015, chestHeight);

      // Lock (golden padlock)
      const lockSize = size * 0.18;
      const lockY = chestY + chestHeight * 0.35;
      const goldMain = '#FFD700';
      const goldDark = '#B8860B';
      const goldLight = '#FFF8DC';

      // Lock shackle outline and fill
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, lockY, lockSize * 0.38, Math.PI, 0, false);
      ctx.stroke();
      ctx.strokeStyle = goldMain;
      ctx.lineWidth = size * 0.045;
      ctx.beginPath();
      ctx.arc(0, lockY, lockSize * 0.38, Math.PI, 0, false);
      ctx.stroke();

      // Lock body outline
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.strokeRect(-lockSize / 2, lockY, lockSize, lockSize * 0.75);
      // Lock body fill
      const lockGrad = ctx.createLinearGradient(-lockSize / 2, lockY, lockSize / 2, lockY);
      lockGrad.addColorStop(0, goldDark);
      lockGrad.addColorStop(0.3, goldMain);
      lockGrad.addColorStop(0.5, goldLight);
      lockGrad.addColorStop(0.7, goldMain);
      lockGrad.addColorStop(1, goldDark);
      ctx.fillStyle = lockGrad;
      ctx.fillRect(-lockSize / 2, lockY, lockSize, lockSize * 0.75);

      // Keyhole
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(0, lockY + lockSize * 0.3, lockSize * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-lockSize * 0.05, lockY + lockSize * 0.35, lockSize * 0.1, lockSize * 0.25);

      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.restore();
    };

    // Helper to draw a custom ornate key
    const drawKey = (pos: Position, scale: number) => {
      const cellX = pos.x * cellSize + cellSize / 2;
      const cellY = pos.y * cellSize + cellSize / 2;
      const size = cellSize * scale;

      ctx.save();
      ctx.translate(cellX, cellY);
      ctx.rotate(-Math.PI / 4); // Rotate 45 degrees for dynamic look

      // Shadow for depth
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      const goldMain = '#FFD700';
      const goldDark = '#B8860B';
      const goldLight = '#FFF8DC';
      const outline = '#4a3000';

      // Key shaft (the long part)
      const shaftLength = size * 0.55;
      const shaftWidth = size * 0.12;

      // Draw outline first (slightly larger)
      ctx.strokeStyle = outline;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Shaft outline
      ctx.beginPath();
      ctx.roundRect(-shaftWidth / 2, -size * 0.1, shaftWidth, shaftLength, 2);
      ctx.stroke();

      // Shaft fill with gradient
      const shaftGrad = ctx.createLinearGradient(-shaftWidth / 2, 0, shaftWidth / 2, 0);
      shaftGrad.addColorStop(0, goldDark);
      shaftGrad.addColorStop(0.3, goldMain);
      shaftGrad.addColorStop(0.5, goldLight);
      shaftGrad.addColorStop(0.7, goldMain);
      shaftGrad.addColorStop(1, goldDark);
      ctx.fillStyle = shaftGrad;
      ctx.beginPath();
      ctx.roundRect(-shaftWidth / 2, -size * 0.1, shaftWidth, shaftLength, 2);
      ctx.fill();

      // Key bow (the decorative round part at top)
      const bowRadius = size * 0.22;
      const bowY = -size * 0.1 - bowRadius * 0.7;

      // Bow outline
      ctx.strokeStyle = outline;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, bowY, bowRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Bow fill with gradient
      const bowGrad = ctx.createRadialGradient(
        -bowRadius * 0.3, bowY - bowRadius * 0.3, 0,
        0, bowY, bowRadius
      );
      bowGrad.addColorStop(0, goldLight);
      bowGrad.addColorStop(0.4, goldMain);
      bowGrad.addColorStop(1, goldDark);
      ctx.fillStyle = bowGrad;
      ctx.beginPath();
      ctx.arc(0, bowY, bowRadius, 0, Math.PI * 2);
      ctx.fill();

      // Inner hole in bow (decorative)
      ctx.fillStyle = '#1a1a1a';
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, bowY, bowRadius * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Key teeth (the bits at the end)
      const teethY = -size * 0.1 + shaftLength;
      const toothWidth = size * 0.08;
      const toothHeight = size * 0.12;

      // Tooth 1 (left)
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-shaftWidth / 2 - toothWidth, teethY - toothHeight, toothWidth, toothHeight);
      ctx.stroke();
      ctx.fillStyle = goldMain;
      ctx.fill();

      // Tooth 2 (bottom left)
      ctx.beginPath();
      ctx.rect(-shaftWidth / 2 - toothWidth * 0.7, teethY - toothHeight * 0.5, toothWidth * 0.7, toothHeight * 0.5);
      ctx.stroke();
      ctx.fillStyle = goldDark;
      ctx.fill();

      // Notch in shaft (decorative detail)
      ctx.fillStyle = goldDark;
      ctx.fillRect(-shaftWidth / 2, teethY - toothHeight * 1.8, shaftWidth, size * 0.04);

      // Highlight line on shaft
      ctx.strokeStyle = goldLight;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.05);
      ctx.lineTo(0, teethY - toothHeight * 2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.restore();
    };

    // Helper to draw a custom royal crown
    const drawCrown = (pos: Position, scale: number) => {
      const cellX = pos.x * cellSize + cellSize / 2;
      const cellY = pos.y * cellSize + cellSize / 2;
      const size = cellSize * scale;

      ctx.save();
      ctx.translate(cellX, cellY);

      // Shadow for depth
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      const goldMain = '#FFD700';
      const goldDark = '#B8860B';
      const goldLight = '#FFF8DC';
      const outline = '#4a3000';
      const gemRed = '#DC143C';

      // Crown dimensions - wider and bolder
      const baseWidth = size * 0.9;
      const baseHeight = size * 0.2;
      const baseY = size * 0.15;
      const crownHeight = size * 0.5;

      // Draw crown body with 3 bold points (simpler, more readable)
      ctx.beginPath();
      ctx.moveTo(-baseWidth / 2, baseY);
      // Left point
      ctx.lineTo(-baseWidth * 0.35, baseY - crownHeight * 0.7);
      // Left valley
      ctx.lineTo(-baseWidth * 0.17, baseY - crownHeight * 0.3);
      // Center point (tallest)
      ctx.lineTo(0, baseY - crownHeight);
      // Right valley
      ctx.lineTo(baseWidth * 0.17, baseY - crownHeight * 0.3);
      // Right point
      ctx.lineTo(baseWidth * 0.35, baseY - crownHeight * 0.7);
      ctx.lineTo(baseWidth / 2, baseY);
      ctx.closePath();

      // Crown outline - thicker for visibility
      ctx.strokeStyle = outline;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Crown fill with gradient
      const crownGrad = ctx.createLinearGradient(0, baseY - crownHeight, 0, baseY);
      crownGrad.addColorStop(0, goldLight);
      crownGrad.addColorStop(0.4, goldMain);
      crownGrad.addColorStop(1, goldDark);
      ctx.fillStyle = crownGrad;
      ctx.fill();

      // Base band outline and fill
      ctx.strokeStyle = outline;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-baseWidth / 2, baseY, baseWidth, baseHeight, 3);
      ctx.stroke();

      const baseGrad = ctx.createLinearGradient(-baseWidth / 2, baseY, baseWidth / 2, baseY);
      baseGrad.addColorStop(0, goldDark);
      baseGrad.addColorStop(0.3, goldMain);
      baseGrad.addColorStop(0.5, goldLight);
      baseGrad.addColorStop(0.7, goldMain);
      baseGrad.addColorStop(1, goldDark);
      ctx.fillStyle = baseGrad;
      ctx.fill();

      // Large center gem (ruby) - more visible
      const gemSize = size * 0.1;
      ctx.fillStyle = gemRed;
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, baseY - crownHeight + gemSize * 2, gemSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Gem highlight
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(-gemSize * 0.3, baseY - crownHeight + gemSize * 1.7, gemSize * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // Base band center gem
      ctx.fillStyle = gemRed;
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, baseY + baseHeight / 2, gemSize * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.restore();
    };

    // Draw treasure chest with accessible square highlights
    // Chest color: red when locked, green when unlocked
    const chestColor = hasKey ? { r: 100, g: 200, b: 100 } : { r: 200, g: 60, b: 60 };
    drawAccessibleHighlight(doorPos, chestColor, 2);

    // Draw custom locked treasure chest icon
    drawLockedChest(doorPos, 0.9);

    // Draw key with gold accessible square highlights (if not collected)
    if (keyPos !== null) {
      const keyColor = { r: 255, g: 200, b: 50 };
      drawAccessibleHighlight(keyPos, keyColor, 2);
      drawKey(keyPos, 0.85);
    }

    // Draw player (crown)
    drawCrown(playerPos, 0.85);

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
