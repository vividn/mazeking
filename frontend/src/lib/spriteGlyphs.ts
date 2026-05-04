// Pixel-art sprite glyphs for in-maze entities.
//
// Sprites are 2D bit-grids in the spirit of pixelFont.ts: '#' = filled pixel,
// '.' = empty. They render with a 1px dark outline so a single-color silhouette
// stays legible against any seed-derived palette and at small cell sizes
// (12-20px), which is the binding constraint here.
//
// Visual arc (ma-6cr.21):
//   - Plain person walks the maze.
//   - Picks up the REGALIA (robe + scepter) → silhouette gains cape + scepter.
//   - Reaches the CROWN (goal) wearing regalia → wins, becomes king.
//   - Win modal shows the person actually wearing the crown — that sprite is
//     reserved for the win moment (and tier-variant treatments later).

type SpritePattern = boolean[][];

function s(rows: string[]): SpritePattern {
  return rows.map((row) => row.split('').map((c) => c === '#'));
}

// Plain person (player before picking up regalia).
export const PERSON_NO_REGALIA: SpritePattern = s([
  '..####..',
  '..####..',
  '..####..',
  '.######.',
  '.######.',
  '.######.',
  '.##..##.',
  '.##..##.',
]);

// Person wearing robe + holding scepter (player after pickup).
// Cape silhouette flares wider than plain person; scepter pixel column on right.
export const PERSON_WITH_REGALIA: SpritePattern = s([
  '..####.#',
  '..####.#',
  '.#######',
  '.######.',
  '########',
  '########',
  '########',
  '.######.',
]);

// Person wearing the crown — reserved for the WIN moment (modal/NFT).
// Body identical to PERSON_NO_REGALIA so the crown band reads as the change.
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

// Just the crown rows of PERSON_WITH_CROWN, used to tint the worn crown
// in the win-modal sprite when crownColor differs from playerColor.
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

// Collectible regalia: scepter on the left, robe silhouette on the right.
// Reads as "royal vestments" without using a crown shape (crown is reserved
// for the goal / win moment).
export const REGALIA: SpritePattern = s([
  '##..####',
  '##.#####',
  '.#######',
  '.#######',
  '.#######',
  '.#######',
  '.######.',
  '.##..##.',
]);

// Crown at the goal position — zigzag-top jewelled band.
// Used both as the goal glyph and (by convention) as the symbol the player
// "claims" by reaching it with regalia.
export const CROWN: SpritePattern = s([
  '#.#.#.#.',
  '########',
  '#.#.#.#.',
  '########',
  '########',
  '.######.',
  '........',
  '........',
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

/**
 * Draw the player figure.
 *
 * - `wearingCrown` — render PERSON_WITH_CROWN with optional crown-color tint.
 *   Used for the win-modal/NFT moment.
 * - `wearingRegalia` (when not wearing crown) — render PERSON_WITH_REGALIA.
 * - Otherwise — plain PERSON_NO_REGALIA.
 *
 * The crown takes precedence over regalia: if both are true, the crown wins.
 */
export function drawPerson(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  wearingRegalia: boolean,
  regaliaColor?: string,
  wearingCrown: boolean = false,
  crownColor?: string
): void {
  if (wearingCrown) {
    if (crownColor && crownColor !== color) {
      drawSprite(ctx, x, y, size, PERSON_NO_REGALIA, color);
      drawSprite(ctx, x, y, size, PERSON_CROWN_OVERLAY, crownColor, {
        shadow: false,
      });
    } else {
      drawSprite(ctx, x, y, size, PERSON_WITH_CROWN, color);
    }
    return;
  }

  if (wearingRegalia) {
    if (regaliaColor && regaliaColor !== color) {
      // Two-pass would overlap the wider regalia silhouette over the body —
      // simpler to just paint the whole regalia figure in the player color
      // and ignore regaliaColor, since the regalia silhouette IS the body.
      // Keep the param to allow future styling without breaking callers.
    }
    drawSprite(ctx, x, y, size, PERSON_WITH_REGALIA, color);
    return;
  }

  drawSprite(ctx, x, y, size, PERSON_NO_REGALIA, color);
}

/** Draw the collectible regalia (robe + scepter) at the pickup position. */
export function drawRegalia(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  drawSprite(ctx, x, y, size, REGALIA, color);
}

/**
 * Draw the crown at the goal. When `playerHasRegalia`, the crown is rendered
 * with a faint glow underneath signaling "you can claim this now".
 */
export function drawCrownGoal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  playerHasRegalia: boolean,
  glowColor?: string
): void {
  if (playerHasRegalia && glowColor) {
    // Soft halo behind the crown so it pops once the player can win.
    ctx.save();
    const radius = size * 0.55;
    const grad = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
    grad.addColorStop(0, glowColor);
    grad.addColorStop(1, 'transparent');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawSprite(ctx, x, y, size, CROWN, color);
}
