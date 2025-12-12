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

    // Wall thickness
    const wallThickness = Math.max(2, cellSize * 0.1);

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

        // Draw walls
        const wallColor = cell.isTextCell ? colors.textWallColor : colors.wallColor;
        ctx.strokeStyle = wallColor;
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
          ctx.strokeStyle = northCell.isTextCell ? colors.textWallColor : colors.wallColor;
          ctx.beginPath();
          ctx.moveTo(cellX, cellY);
          ctx.lineTo(cellX + cellSize, cellY);
          ctx.stroke();
        }

        // West wall (wraps from right)
        const westCell = maze.cells[y][(x - 1 + maze.width) % maze.width];
        if (westCell.eastWall) {
          ctx.strokeStyle = westCell.isTextCell ? colors.textWallColor : colors.wallColor;
          ctx.beginPath();
          ctx.moveTo(cellX, cellY);
          ctx.lineTo(cellX, cellY + cellSize);
          ctx.stroke();
        }
      }
    }

    // Helper to draw a glowing highlight circle behind entities
    const drawGlow = (pos: Position, glowColor: string, radius: number) => {
      const cellX = pos.x * cellSize + cellSize / 2;
      const cellY = pos.y * cellSize + cellSize / 2;

      const gradient = ctx.createRadialGradient(
        cellX, cellY, 0,
        cellX, cellY, radius
      );
      gradient.addColorStop(0, glowColor);
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cellX, cellY, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    // Helper to draw emoji/icon centered in cell
    const drawIcon = (pos: Position, icon: string, scale = 0.65) => {
      const cellX = pos.x * cellSize;
      const cellY = pos.y * cellSize;
      const fontSize = cellSize * scale;

      ctx.font = `${fontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Draw with shadow for better visibility
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.fillText(icon, cellX + cellSize / 2, cellY + cellSize / 2);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    };

    // Draw treasure chest with enhanced glow
    const glowRadius = cellSize * 0.8;

    // Draw multiple glow layers for the treasure chest to make it stand out
    drawGlow(doorPos, colors.doorGlowColor, glowRadius * 2.0);
    drawGlow(doorPos, colors.doorGlowColor, glowRadius * 1.5);
    drawGlow(doorPos, colors.doorGlowColor, glowRadius);

    // Draw a colored square behind the treasure chest for extra visibility
    const doorCellX = doorPos.x * cellSize;
    const doorCellY = doorPos.y * cellSize;
    ctx.fillStyle = colors.doorGlowColor;
    ctx.fillRect(doorCellX + cellSize * 0.1, doorCellY + cellSize * 0.1, cellSize * 0.8, cellSize * 0.8);

    // Draw treasure chest icon
    drawIcon(doorPos, '💰', 0.8);

    // Draw key with glow (if not collected)
    if (keyPos !== null) {
      drawGlow(keyPos, colors.keyGlowColor, glowRadius);
      drawIcon(keyPos, '🔑', 0.65);
    }

    // Draw player (crown) with stronger glow
    drawGlow(playerPos, colors.playerGlowColor, glowRadius * 1.2);
    drawIcon(playerPos, '👑', 0.75);

    // Draw wraparound arrows at edges where passages exist
    // Each pair of matching arrows (top/bottom or left/right at same position) gets a unique color
    const arrowSize = cellSize * 0.35;

    // Generate distinct colors for arrow pairs based on position
    const getArrowColor = (index: number): string => {
      // Use golden ratio to distribute hues evenly
      // Darker colors (35% lightness) for better contrast
      const hue = (index * 137.508) % 360;
      return `hsla(${hue}, 85%, 35%, 0.95)`;
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

    // Draw top arrows (pointing up)
    for (const arrow of verticalArrows) {
      const cellX = arrow.x * cellSize + cellSize / 2;
      const cellY = arrowSize * 1.2;
      drawArrow(cellX, cellY, 'up', arrow.color);
    }

    // Draw bottom arrows (pointing down) with matching colors
    for (const arrow of verticalArrows) {
      const cellX = arrow.x * cellSize + cellSize / 2;
      const cellY = maze.height * cellSize - arrowSize * 1.2;
      drawArrow(cellX, cellY, 'down', arrow.color);
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

    // Draw left arrows (pointing left)
    for (const arrow of horizontalArrows) {
      const cellX = arrowSize * 1.2;
      const cellY = arrow.y * cellSize + cellSize / 2;
      drawArrow(cellX, cellY, 'left', arrow.color);
    }

    // Draw right arrows (pointing right) with matching colors
    for (const arrow of horizontalArrows) {
      const cellX = maze.width * cellSize - arrowSize * 1.2;
      const cellY = arrow.y * cellSize + cellSize / 2;
      drawArrow(cellX, cellY, 'right', arrow.color);
    }

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
