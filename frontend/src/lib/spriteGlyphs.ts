// Pixel-art sprite glyphs for in-maze entities (player/crown/castle).
//
// Sprites are 2D bit-grids in the spirit of pixelFont.ts: '#' = filled pixel,
// '.' = empty. They render with a 1px dark outline so a single-color silhouette
// stays legible against any seed-derived palette and at small cell sizes
// (12-20px), which is the binding constraint here.

type SpritePattern = boolean[][];

function s(rows: string[]): SpritePattern {
  return rows.map((row) => row.split('').map((c) => c === '#'));
}

// Person silhouette (player without crown).
export const PERSON_NO_CROWN: SpritePattern = s([
  '..####..',
  '..####..',
  '..####..',
  '.######.',
  '.######.',
  '.######.',
  '.##..##.',
  '.##..##.',
]);

// Person silhouette wearing the crown (player after pickup).
export const PERSON_WITH_CROWN: SpritePattern = s([
  '#.#.#.#.',
  '########',
  '..####..',
  '.######.',
  '.######.',
  '.######.',
  '.##..##.',
  '.##..##.',
]);

// Collectible crown that lives at the key position.
export const CROWN: SpritePattern = s([
  '........',
  '#.#.#.#.',
  '########',
  '#.#.#.#.',
  '########',
  '.######.',
  '........',
  '........',
]);

// Castle goal: battlemented walls with a central gate.
export const CASTLE: SpritePattern = s([
  '#.#.#.#.',
  '########',
  '##.##.##',
  '########',
  '##....##',
  '##....##',
  '##....##',
  '########',
]);

interface DrawSpriteOptions {
  /** 1px dark outline around the silhouette. Defaults to true. */
  outline?: boolean;
  /** Drop shadow under the sprite. Defaults to true. */
  shadow?: boolean;
}

/**
 * Draws a sprite pattern centered at (x, y) within a `size`x`size` box.
 * Pixels snap to integer coordinates so silhouettes stay crisp.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  pattern: SpritePattern,
  color: string,
  options: DrawSpriteOptions = {}
): void {
  const { outline = true, shadow = true } = options;
  const rows = pattern.length;
  const cols = pattern[0].length;
  const pixel = size / Math.max(rows, cols);
  const startX = x - (cols * pixel) / 2;
  const startY = y - (rows * pixel) / 2;

  ctx.save();

  if (shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = Math.max(1, pixel * 0.4);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(1, pixel * 0.15);
  }

  // Outline pass: each filled pixel painted slightly larger in dark.
  // Adjacent filled pixels overlap, producing a unified 1px border once the
  // colored pass paints over the interior.
  if (outline) {
    ctx.fillStyle = '#1a1a1a';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!pattern[r][c]) continue;
        const px = Math.round(startX + c * pixel) - 1;
        const py = Math.round(startY + r * pixel) - 1;
        const pxNext = Math.round(startX + (c + 1) * pixel) + 1;
        const pyNext = Math.round(startY + (r + 1) * pixel) + 1;
        ctx.fillRect(px, py, pxNext - px, pyNext - py);
      }
    }
    // Disable shadow for the color pass so the outline alone owns the shadow.
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  ctx.fillStyle = color;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!pattern[r][c]) continue;
      const px = Math.round(startX + c * pixel);
      const py = Math.round(startY + r * pixel);
      const pxNext = Math.round(startX + (c + 1) * pixel);
      const pyNext = Math.round(startY + (r + 1) * pixel);
      ctx.fillRect(px, py, pxNext - px, pyNext - py);
    }
  }

  ctx.restore();
}

/** Draw the player figure, with or without crown. */
export function drawPerson(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  hasCrown: boolean,
  crownColor?: string
): void {
  if (hasCrown && crownColor && crownColor !== color) {
    // Two-pass: body in player color, crown rows in crown color.
    drawSprite(ctx, x, y, size, PERSON_NO_CROWN, color);
    drawSprite(ctx, x, y, size, PERSON_CROWN_OVERLAY, crownColor, {
      shadow: false,
    });
  } else {
    drawSprite(
      ctx,
      x,
      y,
      size,
      hasCrown ? PERSON_WITH_CROWN : PERSON_NO_CROWN,
      color
    );
  }
}

// Just the crown rows of PERSON_WITH_CROWN, used to tint the worn crown.
const PERSON_CROWN_OVERLAY: SpritePattern = s([
  '#.#.#.#.',
  '########',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
]);

/** Draw the collectible crown at the key position. */
export function drawCrown(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  drawSprite(ctx, x, y, size, CROWN, color);
}

/** Draw the castle goal. When `playerHasCrown`, the gate glows with `glowColor`. */
export function drawCastle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  playerHasCrown: boolean,
  glowColor?: string
): void {
  drawSprite(ctx, x, y, size, CASTLE, color);

  if (playerHasCrown && glowColor) {
    // Light the gate aperture (the empty cells at rows 4-6, cols 2-5 of CASTLE).
    const rows = CASTLE.length;
    const cols = CASTLE[0].length;
    const pixel = size / Math.max(rows, cols);
    const startX = x - (cols * pixel) / 2;
    const startY = y - (rows * pixel) / 2;

    ctx.save();
    ctx.fillStyle = glowColor;
    ctx.globalAlpha = 0.85;
    for (let r = 4; r <= 6; r++) {
      for (let c = 2; c <= 5; c++) {
        if (CASTLE[r][c]) continue;
        const px = Math.round(startX + c * pixel);
        const py = Math.round(startY + r * pixel);
        const pxNext = Math.round(startX + (c + 1) * pixel);
        const pyNext = Math.round(startY + (r + 1) * pixel);
        ctx.fillRect(px, py, pxNext - px, pyNext - py);
      }
    }
    ctx.restore();
  }
}
