import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  CellType,
  type MazeData,
  type Position,
  type ColorScheme,
} from '../types';
import { drawArrow, drawCornerWarp, getArrowColor } from '../glyphs';
import { useGlyphImages } from '../glyphs/glyphImages';
import {
  drawPerson,
  drawRegalia,
  drawCrownGoal,
  CrownTier,
} from '../lib/spriteGlyphs';

interface MazeProps {
  maze: MazeData;
  playerPos: Position;
  keyPos: Position | null;
  goalPos: Position;
  hasKey: boolean;
  colors: ColorScheme;
  zoom: number;
  visited: Set<string>;
  showEntities?: boolean;
  /** Enable pinch-to-zoom and 1-finger pan via touch events (mobile). */
  enableTouchTransform?: boolean;
  /** Enable mouse-wheel zoom and click-drag pan (desktop). */
  enableMouseTransform?: boolean;
  /**
   * Render the player wearing the crown — reserved for the win moment
   * (WinModal thumbnail). Takes precedence over the regalia silhouette.
   */
  playerWearsCrown?: boolean;
  /**
   * Tier variant for the worn crown. Only used when `playerWearsCrown` is
   * true. Defaults to Plain (the un-tiered registered-solve crown).
   */
  crownTier?: CrownTier;
  /**
   * When true, render the regalia hint speech bubble above the player. Shown
   * when the player reaches the goal without regalia.
   */
  showKinglyHint?: boolean;
}

const MAX_USER_ZOOM = 6;
const DOUBLE_TAP_MS = 300;
const MOUSE_DRAG_THRESHOLD_PX = 5;
const WHEEL_ZOOM_STEP = 1.15;
const RESET_ANIM_MS = 150;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface MazeHandle {
  /** Snap (or animate) back to fit-to-viewport, centered. */
  resetView: () => void;
}

const KINGLY_HINT_TEXT =
  'Coronation is only for kings in full regalia. Find your robe and scepter first';

// Greedy word-wrap to a max pixel width using the currently set ctx.font.
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Draw a speech bubble carrying the anti-shortcut hint near the player.
 * `anchorY` is the cell edge the bubble's tail points toward — top edge by
 * default, bottom edge when `below` is true (used when the player is in the
 * top row and there's no room above).
 *
 * `maxWidth` caps bubble width (in canvas px). The text wraps to multiple
 * lines if a single line would exceed it.
 */
function drawKinglyHint(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  anchorY: number,
  cellSize: number,
  below: boolean = false,
  maxWidth: number = Infinity
): void {
  // Font size scales with cell size, with a comfortable readable floor.
  const fontPx = Math.max(11, Math.min(16, cellSize * 0.42));
  const padX = fontPx * 0.7;
  const padY = fontPx * 0.4;
  const lineGap = fontPx * 0.25;

  ctx.save();
  ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  const innerMax = Math.max(fontPx * 6, maxWidth - padX * 2);
  const lines = wrapText(ctx, KINGLY_HINT_TEXT, innerMax);
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const bubbleW = textW + padX * 2;
  const bubbleH =
    fontPx * lines.length + lineGap * (lines.length - 1) + padY * 2;
  const tailH = fontPx * 0.4;
  const gap = Math.max(2, cellSize * 0.08);

  // Edge of the bubble nearest the player (i.e. the side the tail comes off).
  const bubbleNear = below ? anchorY + gap + tailH : anchorY - gap - tailH;
  const bubbleFar = below ? bubbleNear + bubbleH : bubbleNear - bubbleH;
  const bubbleTop = Math.min(bubbleNear, bubbleFar);
  const bubbleBottom = Math.max(bubbleNear, bubbleFar);
  const bubbleLeft = centerX - bubbleW / 2;
  const bubbleRight = centerX + bubbleW / 2;
  const radius = Math.min(bubbleH / 2, fontPx * 0.55);

  // Drop shadow under the bubble.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = Math.max(2, fontPx * 0.3);
  ctx.shadowOffsetY = 2;

  ctx.fillStyle = '#fefcf2';
  ctx.beginPath();
  ctx.moveTo(bubbleLeft + radius, bubbleTop);
  // Top edge — break for upward tail when bubble sits below the player.
  if (below) {
    const tailHalfW = fontPx * 0.4;
    ctx.lineTo(centerX - tailHalfW, bubbleTop);
    ctx.lineTo(centerX, bubbleTop - tailH);
    ctx.lineTo(centerX + tailHalfW, bubbleTop);
  }
  ctx.lineTo(bubbleRight - radius, bubbleTop);
  ctx.quadraticCurveTo(bubbleRight, bubbleTop, bubbleRight, bubbleTop + radius);
  ctx.lineTo(bubbleRight, bubbleBottom - radius);
  ctx.quadraticCurveTo(
    bubbleRight,
    bubbleBottom,
    bubbleRight - radius,
    bubbleBottom
  );
  // Bottom edge — break for downward tail when bubble sits above the player.
  if (!below) {
    const tailHalfW = fontPx * 0.4;
    ctx.lineTo(centerX + tailHalfW, bubbleBottom);
    ctx.lineTo(centerX, bubbleBottom + tailH);
    ctx.lineTo(centerX - tailHalfW, bubbleBottom);
  }
  ctx.lineTo(bubbleLeft + radius, bubbleBottom);
  ctx.quadraticCurveTo(
    bubbleLeft,
    bubbleBottom,
    bubbleLeft,
    bubbleBottom - radius
  );
  ctx.lineTo(bubbleLeft, bubbleTop + radius);
  ctx.quadraticCurveTo(bubbleLeft, bubbleTop, bubbleLeft + radius, bubbleTop);
  ctx.closePath();
  ctx.fill();

  // Disable shadow for the border + text passes.
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#1a1a1a';
  ctx.stroke();

  ctx.fillStyle = '#1a1a1a';
  const lineH = fontPx + lineGap;
  const firstLineY = bubbleTop + padY + fontPx / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], centerX, firstLineY + i * lineH);
  }

  ctx.restore();
}

/**
 * Maze renderer component that displays the toroidal maze with player, key, and goal.
 * Uses Canvas for performant rendering with zoom support centered on player.
 */
export const Maze = forwardRef<MazeHandle, MazeProps>(function Maze(
  {
    maze,
    playerPos,
    keyPos,
    goalPos,
    hasKey,
    colors,
    zoom,
    visited,
    showEntities = true,
    enableTouchTransform = false,
    enableMouseTransform = false,
    playerWearsCrown = false,
    crownTier = CrownTier.Plain,
    showKinglyHint = false,
  },
  ref
) {
  // Lower bound such that the maze never shrinks past fit-to-viewport.
  // baseCellSize = min(viewport/maze) which is the exact-fit cell size at
  // totalZoom=1. So minUserZoom = 1 / zoom keeps totalZoom >= 1.
  const minUserZoom = 1 / zoom;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Bitmap glyphs (peasant/regalia/king + pickup). Null until loaded — the
  // sprite helpers fall back to the procedural patterns until then.
  const glyphImages = useGlyphImages();

  // Per-user transform applied on top of the base centering / zoom prop.
  const [userZoom, setUserZoom] = useState(1);
  const [userPan, setUserPan] = useState({ x: 0, y: 0 });
  const lastTapRef = useRef<number>(0);

  // Reset user transform when the maze identity changes
  const mazeKey = `${maze.width}x${maze.height}`;
  const lastMazeKeyRef = useRef(mazeKey);
  useEffect(() => {
    if (lastMazeKeyRef.current !== mazeKey) {
      lastMazeKeyRef.current = mazeKey;
      setUserZoom(minUserZoom);
      setUserPan({ x: 0, y: 0 });
    }
  }, [mazeKey, minUserZoom]);

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
    const totalZoom = zoom * userZoom;
    const cellSize = baseCellSize * totalZoom;

    // Calculate viewport offset. When the user has applied any pinch/pan,
    // we use neutral (maze-centered) framing and stack their transform on top —
    // this keeps pinch anchoring math stable. Otherwise honor the prop zoom's
    // player-centered behavior (the desktop 1x/2x toggle).
    let offsetX = 0;
    let offsetY = 0;

    const userActive = userZoom !== 1 || userPan.x !== 0 || userPan.y !== 0;

    if (zoom > 1 && !userActive) {
      const playerScreenX = playerPos.x * cellSize;
      const playerScreenY = playerPos.y * cellSize;
      offsetX = rect.width / 2 - playerScreenX - cellSize / 2;
      offsetY = rect.height / 2 - playerScreenY - cellSize / 2;
    } else {
      offsetX = (rect.width - maze.width * cellSize) / 2;
      offsetY = (rect.height - maze.height * cellSize) / 2;
    }
    offsetX += userPan.x;
    offsetY += userPan.y;

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

        // Determine cell background color based on cell type
        let bgColor: string;
        switch (cell.cellType) {
          case CellType.CrownText:
            bgColor = isVisited
              ? colors.crownVisitedColor
              : colors.crownBackgroundColor;
            break;
          case CellType.ZkText:
            bgColor = isVisited
              ? colors.zkVisitedColor
              : colors.zkBackgroundColor;
            break;
          case CellType.Text:
            bgColor = isVisited
              ? colors.textVisitedColor
              : colors.textBackgroundColor;
            break;
          default:
            bgColor = isVisited
              ? colors.visitedColor
              : colors.mazeBackgroundColor;
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
    const topLeftCornerV = verticalArrows.find((a) => a.x === 0);
    const topLeftCornerH = horizontalArrows.find((a) => a.y === 0);
    const topRightCornerV = verticalArrows.find((a) => a.x === maze.width - 1);
    const topRightCornerH = horizontalArrows.find((a) => a.y === 0);
    const bottomLeftCornerV = verticalArrows.find((a) => a.x === 0);
    const bottomLeftCornerH = horizontalArrows.find(
      (a) => a.y === maze.height - 1
    );
    const bottomRightCornerV = verticalArrows.find(
      (a) => a.x === maze.width - 1
    );
    const bottomRightCornerH = horizontalArrows.find(
      (a) => a.y === maze.height - 1
    );

    // Draw corner warps with special 4-way indicator
    if (topLeftCornerV && topLeftCornerH) {
      drawCornerWarp(
        ctx,
        arrowSize * 1.2,
        arrowSize * 1.2,
        topLeftCornerV.color,
        topLeftCornerH.color,
        arrowSize
      );
    }
    if (topRightCornerV && topRightCornerH) {
      drawCornerWarp(
        ctx,
        maze.width * cellSize - arrowSize * 1.2,
        arrowSize * 1.2,
        topRightCornerV.color,
        topRightCornerH.color,
        arrowSize
      );
    }
    if (bottomLeftCornerV && bottomLeftCornerH) {
      drawCornerWarp(
        ctx,
        arrowSize * 1.2,
        maze.height * cellSize - arrowSize * 1.2,
        bottomLeftCornerV.color,
        bottomLeftCornerH.color,
        arrowSize
      );
    }
    if (bottomRightCornerV && bottomRightCornerH) {
      drawCornerWarp(
        ctx,
        maze.width * cellSize - arrowSize * 1.2,
        maze.height * cellSize - arrowSize * 1.2,
        bottomRightCornerV.color,
        bottomRightCornerH.color,
        arrowSize
      );
    }

    // Draw top arrows (pointing up) - skip corners that have both warps
    for (const arrow of verticalArrows) {
      const isCorner =
        (arrow.x === 0 && topLeftCornerH) ||
        (arrow.x === maze.width - 1 && topRightCornerH);
      if (!isCorner) {
        const cellX = arrow.x * cellSize + cellSize / 2;
        const cellY = arrowSize * 1.2;
        drawArrow(ctx, cellX, cellY, 'up', arrow.color, arrowSize);
      }
    }

    // Draw bottom arrows (pointing down) - skip corners that have both warps
    for (const arrow of verticalArrows) {
      const isCorner =
        (arrow.x === 0 && bottomLeftCornerH) ||
        (arrow.x === maze.width - 1 && bottomRightCornerH);
      if (!isCorner) {
        const cellX = arrow.x * cellSize + cellSize / 2;
        const cellY = maze.height * cellSize - arrowSize * 1.2;
        drawArrow(ctx, cellX, cellY, 'down', arrow.color, arrowSize);
      }
    }

    // Draw left arrows (pointing left) - skip corners that have both warps
    for (const arrow of horizontalArrows) {
      const isCorner =
        (arrow.y === 0 && topLeftCornerV) ||
        (arrow.y === maze.height - 1 && bottomLeftCornerV);
      if (!isCorner) {
        const cellX = arrowSize * 1.2;
        const cellY = arrow.y * cellSize + cellSize / 2;
        drawArrow(ctx, cellX, cellY, 'left', arrow.color, arrowSize);
      }
    }

    // Draw right arrows (pointing right) - skip corners that have both warps
    for (const arrow of horizontalArrows) {
      const isCorner =
        (arrow.y === 0 && topRightCornerV) ||
        (arrow.y === maze.height - 1 && bottomRightCornerV);
      if (!isCorner) {
        const cellX = maze.width * cellSize - arrowSize * 1.2;
        const cellY = arrow.y * cellSize + cellSize / 2;
        drawArrow(ctx, cellX, cellY, 'right', arrow.color, arrowSize);
      }
    }

    // Helper to check if movement from one cell to another is blocked by a wall
    const canMove = (
      fromX: number,
      fromY: number,
      toX: number,
      toY: number
    ): boolean => {
      const dx = toX - fromX;
      const dy = toY - fromY;

      // Check movement direction and corresponding wall
      if (dx === 1 || dx === -(maze.width - 1)) {
        // Moving east (or wrapping from right edge to left)
        return !maze.cells[fromY][fromX].eastWall;
      } else if (dx === -1 || dx === maze.width - 1) {
        // Moving west (or wrapping from left edge to right)
        return !maze.cells[fromY][(fromX - 1 + maze.width) % maze.width]
          .eastWall;
      } else if (dy === 1 || dy === -(maze.height - 1)) {
        // Moving south (or wrapping from bottom to top)
        return !maze.cells[fromY][fromX].southWall;
      } else if (dy === -1 || dy === maze.height - 1) {
        // Moving north (or wrapping from top to bottom)
        return !maze.cells[(fromY - 1 + maze.height) % maze.height][fromX]
          .southWall;
      }
      return false;
    };

    // BFS to find accessible cells within distance, respecting walls
    const getAccessibleCells = (
      startX: number,
      startY: number,
      maxDist: number
    ): Map<string, number> => {
      const distances = new Map<string, number>();
      const queue: { x: number; y: number; dist: number }[] = [
        { x: startX, y: startY, dist: 0 },
      ];
      distances.set(`${startX},${startY}`, 0);

      while (queue.length > 0) {
        const { x, y, dist } = queue.shift()!;
        if (dist >= maxDist) continue;

        // Check all 4 directions
        const dirs = [
          { dx: 0, dy: -1 }, // north
          { dx: 1, dy: 0 }, // east
          { dx: 0, dy: 1 }, // south
          { dx: -1, dy: 0 }, // west
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
    const drawAccessibleHighlight = (
      pos: Position,
      baseColor: { r: number; g: number; b: number },
      maxDist: number
    ) => {
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

    if (showEntities) {
      // Crown goal — green-tinted accessible halo once regalia is collected,
      // red while locked. Crown is THE win condition glyph.
      // Skip when the player is wearing the crown (win-modal thumbnail) —
      // the crown has been claimed; rendering it on the goal cell too would
      // double up at the same position.
      if (!playerWearsCrown) {
        const goalHalo = hasKey
          ? { r: 100, g: 200, b: 100 }
          : { r: 200, g: 60, b: 60 };
        drawAccessibleHighlight(goalPos, goalHalo, 2);
        drawCrownGoal(
          ctx,
          goalPos.x * cellSize + cellSize / 2,
          goalPos.y * cellSize + cellSize / 2,
          cellSize * 0.9,
          colors.goalColor,
          hasKey,
          colors.goalGlowColor,
          glyphImages ?? undefined
        );
      }

      // Regalia collectible — only visible until picked up.
      if (keyPos !== null) {
        const regaliaHalo = { r: 255, g: 200, b: 50 };
        drawAccessibleHighlight(keyPos, regaliaHalo, 2);
        drawRegalia(
          ctx,
          keyPos.x * cellSize + cellSize / 2,
          keyPos.y * cellSize + cellSize / 2,
          cellSize * 0.85,
          colors.keyColor,
          glyphImages ?? undefined
        );
      }

      // Player figure. Win-modal context renders person-wearing-crown; in-game
      // the player wears regalia (robe+scepter) once collected.
      drawPerson(
        ctx,
        playerPos.x * cellSize + cellSize / 2,
        playerPos.y * cellSize + cellSize / 2,
        cellSize * 0.85,
        colors.playerColor,
        hasKey,
        colors.keyColor,
        playerWearsCrown,
        colors.keyColor,
        crownTier,
        glyphImages ?? undefined
      );

      // Anti-shortcut hint: speech bubble above the player when they reach
      // the crown without regalia. Tells first-time players why nothing
      // happened — they need the regalia to claim the throne.
      // Flip the bubble below the player when there's no room above (top row).
      if (showKinglyHint) {
        const playerCenterX = playerPos.x * cellSize + cellSize / 2;
        const flipBelow = playerPos.y === 0;
        const anchorY = flipBelow
          ? (playerPos.y + 1) * cellSize
          : playerPos.y * cellSize;
        // Cap bubble width so the long hint doesn't run offscreen on small
        // viewports — wrap to multiple lines instead.
        const maxBubbleW = Math.min(
          maze.width * cellSize * 0.9,
          cellSize * 14
        );
        drawKinglyHint(
          ctx,
          playerCenterX,
          anchorY,
          cellSize,
          flipBelow,
          maxBubbleW
        );
      }
    }

    ctx.restore();
  }, [
    maze,
    playerPos,
    keyPos,
    goalPos,
    hasKey,
    colors,
    zoom,
    visited,
    showEntities,
    userZoom,
    userPan,
    playerWearsCrown,
    crownTier,
    showKinglyHint,
    glyphImages,
  ]);

  // Handle window resize - force re-render by changing a counter
  const [, setResizeCount] = React.useState(0);
  useEffect(() => {
    const handleResize = () => {
      setResizeCount((c) => c + 1);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Touch gesture handling: 1-finger pan, 2-finger pinch zoom, double-tap to reset
  const gestureRef = useRef<{
    mode: 'pan' | 'pinch' | null;
    last?: { x: number; y: number };
    startDist?: number;
    startTotalZoom?: number;
    startUserZoom?: number;
    startMid?: { x: number; y: number };
    startOffset?: { x: number; y: number };
    startPan?: { x: number; y: number };
    centerOffsetFn?: (z: number) => { x: number; y: number };
  }>({ mode: null });

  const computeNeutralOffset = useCallback(
    (totalZoom: number) => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      const baseCellSize = Math.min(
        rect.width / maze.width,
        rect.height / maze.height
      );
      const cellSize = baseCellSize * totalZoom;
      return {
        x: (rect.width - maze.width * cellSize) / 2,
        y: (rect.height - maze.height * cellSize) / 2,
      };
    },
    [maze.width, maze.height]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enableTouchTransform) return;
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const now = Date.now();
        // Double-tap to reset transform
        if (now - lastTapRef.current < DOUBLE_TAP_MS) {
          setUserZoom(minUserZoom);
          setUserPan({ x: 0, y: 0 });
          lastTapRef.current = 0;
          gestureRef.current = { mode: null };
          return;
        }
        lastTapRef.current = now;
        gestureRef.current = {
          mode: 'pan',
          last: { x: t.clientX, y: t.clientY },
        };
      } else if (e.touches.length === 2) {
        const container = containerRef.current;
        const rect = container?.getBoundingClientRect();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        const dist = Math.hypot(dx, dy);
        const midScreenX = (t1.clientX + t2.clientX) / 2;
        const midScreenY = (t1.clientY + t2.clientY) / 2;
        // Convert mid to canvas-local coords
        const midX = rect ? midScreenX - rect.left : midScreenX;
        const midY = rect ? midScreenY - rect.top : midScreenY;

        const startTotalZoom = zoom * userZoom;
        const neutral = computeNeutralOffset(startTotalZoom);
        const startOffsetX = neutral.x + userPan.x;
        const startOffsetY = neutral.y + userPan.y;

        gestureRef.current = {
          mode: 'pinch',
          startDist: dist,
          startTotalZoom,
          startUserZoom: userZoom,
          startMid: { x: midX, y: midY },
          startOffset: { x: startOffsetX, y: startOffsetY },
          startPan: { ...userPan },
        };
      }
    },
    [
      enableTouchTransform,
      zoom,
      userZoom,
      userPan,
      minUserZoom,
      computeNeutralOffset,
    ]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enableTouchTransform) return;
      const g = gestureRef.current;
      if (g.mode === 'pan' && e.touches.length === 1 && g.last) {
        const t = e.touches[0];
        const dx = t.clientX - g.last.x;
        const dy = t.clientY - g.last.y;
        g.last = { x: t.clientX, y: t.clientY };
        setUserPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        e.preventDefault();
      } else if (
        g.mode === 'pinch' &&
        e.touches.length === 2 &&
        g.startDist &&
        g.startUserZoom !== undefined &&
        g.startMid &&
        g.startOffset &&
        g.startTotalZoom !== undefined
      ) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        const dist = Math.hypot(dx, dy);
        const ratio = dist / g.startDist;
        const newUserZoom = clamp(
          g.startUserZoom * ratio,
          minUserZoom,
          MAX_USER_ZOOM
        );
        setUserZoom(newUserZoom);
        if (newUserZoom <= minUserZoom) {
          // At fit-to-viewport: lock the maze centered.
          setUserPan({ x: 0, y: 0 });
        } else {
          // Effective applied ratio after clamping
          const k = (zoom * newUserZoom) / g.startTotalZoom;
          // New offset that anchors midpoint
          const newOffsetX =
            g.startMid.x - (g.startMid.x - g.startOffset.x) * k;
          const newOffsetY =
            g.startMid.y - (g.startMid.y - g.startOffset.y) * k;
          // Convert back to userPan: newPan = newOffset - centerOffset(newTotalZoom)
          const neutral = computeNeutralOffset(zoom * newUserZoom);
          setUserPan({ x: newOffsetX - neutral.x, y: newOffsetY - neutral.y });
        }
        e.preventDefault();
      }
    },
    [enableTouchTransform, zoom, minUserZoom, computeNeutralOffset]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enableTouchTransform) return;
      if (e.touches.length === 0) {
        gestureRef.current = { mode: null };
      } else if (
        e.touches.length === 1 &&
        gestureRef.current.mode === 'pinch'
      ) {
        // Switch to pan with the remaining finger
        const t = e.touches[0];
        gestureRef.current = {
          mode: 'pan',
          last: { x: t.clientX, y: t.clientY },
        };
      }
    },
    [enableTouchTransform]
  );

  // Animated reset back to fit-to-viewport, centered. Snaps under
  // prefers-reduced-motion. Cancels any in-flight reset via a generation token.
  const resetAnimRef = useRef(0);
  const resetView = useCallback(() => {
    const targetZoom = minUserZoom;
    const targetPan = { x: 0, y: 0 };
    resetAnimRef.current += 1;
    const myGen = resetAnimRef.current;

    if (prefersReducedMotion()) {
      setUserZoom(targetZoom);
      setUserPan(targetPan);
      return;
    }

    const fromZoom = userZoom;
    const fromPan = userPan;
    if (fromZoom === targetZoom && fromPan.x === 0 && fromPan.y === 0) return;

    const start = performance.now();
    const ease = (t: number) =>
      t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const step = (now: number) => {
      if (resetAnimRef.current !== myGen) return; // superseded
      const t = Math.min(1, (now - start) / RESET_ANIM_MS);
      const k = ease(t);
      setUserZoom(fromZoom + (targetZoom - fromZoom) * k);
      setUserPan({
        x: fromPan.x + (targetPan.x - fromPan.x) * k,
        y: fromPan.y + (targetPan.y - fromPan.y) * k,
      });
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [minUserZoom, userZoom, userPan]);

  useImperativeHandle(ref, () => ({ resetView }), [resetView]);

  // Mouse drag pan: a small threshold prevents an accidental click from
  // counting as a pan; once exceeded, deltas update userPan directly.
  const mouseDragRef = useRef<{
    startX: number;
    startY: number;
    startPan: { x: number; y: number };
    isDragging: boolean;
  } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!enableMouseTransform) return;
      // Middle-click: reset transform to fit-to-viewport. Don't start a drag.
      if (e.button === 1) {
        e.preventDefault();
        resetView();
        return;
      }
      if (e.button !== 0) return;
      mouseDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPan: userPan,
        isDragging: false,
      };
    },
    [enableMouseTransform, userPan, resetView]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = mouseDragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.isDragging) {
      if (Math.hypot(dx, dy) < MOUSE_DRAG_THRESHOLD_PX) return;
      drag.isDragging = true;
    }
    setUserPan({ x: drag.startPan.x + dx, y: drag.startPan.y + dy });
  }, []);

  const handleMouseUp = useCallback(() => {
    mouseDragRef.current = null;
  }, []);

  // Wheel handler is attached via addEventListener so we can opt out of the
  // passive default and call preventDefault — keeps the page from scrolling
  // while the user wheels-zooms over the maze.
  useEffect(() => {
    if (!enableMouseTransform) return;
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const startTotalZoom = zoom * userZoom;
      const neutral = computeNeutralOffset(startTotalZoom);
      const startOffsetX = neutral.x + userPan.x;
      const startOffsetY = neutral.y + userPan.y;

      const factor = e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
      const newUserZoom = clamp(userZoom * factor, minUserZoom, MAX_USER_ZOOM);
      if (newUserZoom === userZoom) return;

      setUserZoom(newUserZoom);
      if (newUserZoom <= minUserZoom) {
        // At fit-to-viewport: lock centered, no panning makes sense.
        setUserPan({ x: 0, y: 0 });
        return;
      }
      const k = (zoom * newUserZoom) / startTotalZoom;
      const newOffsetX = cursorX - (cursorX - startOffsetX) * k;
      const newOffsetY = cursorY - (cursorY - startOffsetY) * k;
      const newNeutral = computeNeutralOffset(zoom * newUserZoom);
      setUserPan({
        x: newOffsetX - newNeutral.x,
        y: newOffsetY - newNeutral.y,
      });
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [
    enableMouseTransform,
    zoom,
    userZoom,
    userPan,
    minUserZoom,
    computeNeutralOffset,
  ]);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1a1a',
        overflow: 'hidden',
        position: 'relative',
        touchAction: enableTouchTransform ? 'none' : 'auto',
        cursor: enableMouseTransform ? 'grab' : 'default',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          imageRendering: 'crisp-edges',
        }}
        aria-label={`Maze grid ${maze.width} by ${maze.height}. Player at ${playerPos.x}, ${playerPos.y}. ${hasKey ? 'Regalia collected' : `Regalia at ${keyPos?.x}, ${keyPos?.y}`}. Crown at ${goalPos.x}, ${goalPos.y}.`}
        role="img"
      />
    </div>
  );
});
