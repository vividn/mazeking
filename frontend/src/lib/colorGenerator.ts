import { createRng } from './seededRandom';
import { canonicalPaletteFromHash } from './paletteRecipe.generated';
import { computeMazeHash } from './mazeIdentity';
import { layoutBytesForSeed } from './tokenId';

export interface ColorScheme {
  wallColor: string;
  pathColor: string;
  mazeBackgroundColor: string; // Background for non-text maze areas
  visitedColor: string; // Slightly different color for visited squares
  textWallColor: string;
  textBackgroundColor: string;
  textVisitedColor: string; // Visited color for text cells
  zkBackgroundColor: string; // Special background for Z/K letters (zero-knowledge highlight)
  zkVisitedColor: string; // Visited color for Z/K letters
  crownBackgroundColor: string; // Golden background for crown emoji cells
  crownVisitedColor: string; // Visited color for crown emoji cells
  playerColor: string;
  keyColor: string;
  goalColor: string;
  uiAccentColor: string;
  // Highlight colors for entities
  playerGlowColor: string;
  keyGlowColor: string;
  goalGlowColor: string;
  // Page-level chrome — share wallHue so header/page/modals tint with the seed
  pageBackgroundColor: string;
  headerBackgroundColor: string;
  modalOverlayColor: string;
}

export interface GenerateColorSchemeOptions {
  /**
   * Pedersen hash of the canonical maze layout (hex `0x...`). When supplied,
   * the eight canonical palette fields (wall, mazeBg, textBg, zkBg, crownBg,
   * player, key, goal) are derived from `mazeHash` via the codegen'd
   * `canonicalPaletteFromHash` (paletteRecipe.generated.ts), which shares
   * its single source of truth (`palette/paletteRecipe.json`) with
   * `contracts/src/MazePalette.sol`. The remaining "richer" fields
   * (visited tints, glow, chrome, ui accent) are still seed-derived so the
   * live game keeps its visual variety; they are computed as offsets from
   * the canonical hues so everything still reads as one palette.
   *
   * When omitted, the function preserves the original seed-only behavior.
   */
  mazeHash?: string;
}

// Match the on-chain renderer's no-space format so structural fields are
// byte-identical between TS and `MazePalette.sol`. CSS parses both forms;
// keeping a single format avoids accidental drift between live/render.
const hsl = (h: number, s: number, l: number) => `hsl(${h},${s}%,${l}%)`;
const hsla = (h: number, s: number, l: number, a: number) =>
  `hsla(${h},${s}%,${l}%,${a})`;

// `CanonicalPalette` and `canonicalPaletteFromHash` live in
// `paletteRecipe.generated.ts`, which is regenerated from
// `palette/paletteRecipe.json` and kept byte-aligned with
// `contracts/src/MazePalette.sol`. See ma-fy3.

/**
 * Generates a deterministic color palette.
 *
 * Two derivation modes share this entry point:
 *
 *   1. Seed-only (legacy): rich rng-derived HSL palette. Used for
 *      previews/before the maze hash is known.
 *
 *   2. Hash-aligned (when `options.mazeHash` is provided): the eight
 *      canonical fields are computed from `mazeHash` to match the on-chain
 *      SVG byte-for-byte. The remaining fields are derived from the seed
 *      rng but anchored to the canonical hues so the palette still feels
 *      cohesive.
 */
export function generateColorScheme(
  seed: string,
  options: GenerateColorSchemeOptions = {}
): ColorScheme {
  const { mazeHash } = options;
  const rng = createRng(seed);

  if (mazeHash) {
    return paletteFromHashAndSeed(mazeHash, rng);
  }
  return paletteFromSeedOnly(rng);
}

/**
 * Hash-aligned palette: the eight canonical fields match Solidity exactly;
 * the rest stay rng-derived but are anchored to the canonical hues.
 */
function paletteFromHashAndSeed(
  mazeHash: string,
  rng: { next: () => number }
): ColorScheme {
  const c = canonicalPaletteFromHash(mazeHash);

  // Structural fields (wall/mazeBg/textBg/zkBg/crownBg) — byte-for-byte
  // aligned with MazeRenderer.sol. Entity fields (player/key/goal) are
  // frontend-only; see canonicalPaletteFromHash.
  const wallColor = hsl(c.wall.h, c.wall.s, c.wall.l);
  const mazeBackgroundColor = hsl(c.mazeBg.h, c.mazeBg.s, c.mazeBg.l);
  const textBackgroundColor = hsl(c.textBg.h, c.textBg.s, c.textBg.l);
  const zkBackgroundColor = hsl(c.zkBg.h, c.zkBg.s, c.zkBg.l);
  const crownBackgroundColor = hsl(c.crownBg.h, c.crownBg.s, c.crownBg.l);
  const playerColor = hsl(c.player.h, c.player.s, c.player.l);
  const keyColor = hsl(c.key.h, c.key.s, c.key.l);
  const goalColor = hsl(c.goal.h, c.goal.s, c.goal.l);

  // Remaining "live game" fields — derived from canonical hues + a sprinkle
  // of rng so the experience stays varied without breaking on-chain alignment.
  // Path: a touch lighter than mazeBg using the same hue.
  const pathColor = hsl(
    c.mazeBg.h,
    Math.max(c.mazeBg.s - 12, 0),
    Math.min(c.mazeBg.l + 4, 95)
  );

  // Visited (maze): a hair darker / more saturated than mazeBg.
  const visitedColor = hsl(
    c.mazeBg.h,
    Math.min(c.mazeBg.s + 12, 100),
    Math.max(c.mazeBg.l - 8, 0)
  );

  // Visited (text/zk/crown): same hue, darker version.
  const textVisitedColor = hsl(
    c.textBg.h,
    Math.max(c.textBg.s - 20, 0),
    Math.max(c.textBg.l - 18, 0)
  );
  const zkVisitedColor = hsl(
    c.zkBg.h,
    Math.max(c.zkBg.s - 20, 0),
    Math.max(c.zkBg.l - 20, 0)
  );
  const crownVisitedColor = hsl(
    c.crownBg.h,
    Math.max(c.crownBg.s - 15, 0),
    Math.max(c.crownBg.l - 15, 0)
  );

  // Text wall: contrasts with text bg; keep the original textWall recipe.
  const textWallColor = hsl(
    c.textBg.h,
    50 + rng.next() * 25,
    25 + rng.next() * 10
  );

  // UI accent: distinct vibrant hue, anchored to baseHue + 210.
  const uiHue = (c.baseHue + 210 + (rng.next() * 60 - 30) + 360) % 360;
  const uiAccentColor = hsl(uiHue, 75 + rng.next() * 20, 55 + rng.next() * 10);

  // Glow colors mirror the entity hues (alpha-blended overlays in canvas).
  const playerGlowColor = hsla(c.player.h, 100, 60, 0.6);
  const keyGlowColor = hsla(c.key.h, 100, 55, 0.5);
  const goalGlowColor = hsla(c.goal.h, 80, 50, 0.5);

  // Chrome — share baseHue so the page chrome reads as one palette.
  const pageBackgroundColor = hsl(c.baseHue, 22, 9);
  const headerBackgroundColor = hsla(c.baseHue, 28, 14, 0.55);
  const modalOverlayColor = hsla(c.baseHue, 30, 8, 0.7);

  return {
    wallColor,
    pathColor,
    mazeBackgroundColor,
    visitedColor,
    textWallColor,
    textBackgroundColor,
    textVisitedColor,
    zkBackgroundColor,
    zkVisitedColor,
    crownBackgroundColor,
    crownVisitedColor,
    playerColor,
    keyColor,
    goalColor,
    uiAccentColor,
    playerGlowColor,
    keyGlowColor,
    goalGlowColor,
    pageBackgroundColor,
    headerBackgroundColor,
    modalOverlayColor,
  };
}

/**
 * Single source of truth for the "settled" palette of a seed — the colors the
 * live game converges on once the Pedersen mazeHash is known. Used by both
 * the live game's hash-upgrade step and by preview surfaces, so the preview
 * algorithm is identical to the live algorithm: same seed → same colors.
 */
export async function computeHashAlignedPalette(
  seed: string
): Promise<ColorScheme> {
  const layout = layoutBytesForSeed(seed);
  const mazeHash = await computeMazeHash(layout);
  return generateColorScheme(seed, { mazeHash });
}

/**
 * Legacy seed-only palette. Preserved verbatim so existing tests/previews
 * keep their current colors when no maze hash is available yet.
 */
function paletteFromSeedOnly(rng: { next: () => number }): ColorScheme {
  // Generate base hue (0-360) for the color scheme
  const baseHue = rng.next() * 360;

  // Wall color: dark, slightly saturated
  const wallHue = baseHue;
  const wallColor = hsl(wallHue, 20 + rng.next() * 15, 18 + rng.next() * 8);

  // Maze background: soft, muted color that complements text background
  const mazeBgHue = (baseHue + 30 + rng.next() * 30) % 360;
  const mazeBgSaturation = 15 + rng.next() * 20;
  const mazeBgLightness = 75 + rng.next() * 10;
  const mazeBackgroundColor = hsl(mazeBgHue, mazeBgSaturation, mazeBgLightness);

  // Path color: slightly lighter than maze background
  const pathColor = hsl(mazeBgHue, 10 + rng.next() * 15, 82 + rng.next() * 10);

  // Visited color: derived from mazeBackgroundColor - 12% darker, 12% more saturated
  const visitedColor = hsl(
    mazeBgHue,
    Math.min(mazeBgSaturation + 12, 100),
    Math.max(mazeBgLightness - 8, 0)
  );

  // Text wall color: darker, more saturated - stands out
  const textWallHue = (baseHue + 180 + rng.next() * 40 - 20) % 360;
  const textWallColor = hsl(
    textWallHue,
    50 + rng.next() * 25,
    25 + rng.next() * 10
  );

  // Text background: VIBRANT and glowing - contrasts nicely with maze background
  const textBgHue = (baseHue + 180 + rng.next() * 60 - 30) % 360; // Complementary
  const textBackgroundColor = hsl(
    textBgHue,
    70 + rng.next() * 25,
    55 + rng.next() * 15
  );

  // Text visited color: slightly darker/desaturated version of text background
  const textVisitedColor = hsl(
    textBgHue,
    50 + rng.next() * 20,
    42 + rng.next() * 10
  );

  // ZK highlight colors: complementary hue to text background for Z and K letters
  // Use triadic color (120 degrees offset) from text background for nice contrast while staying harmonious
  const zkHue = (textBgHue + 120 + rng.next() * 30 - 15) % 360;
  const zkBackgroundColor = hsl(
    zkHue,
    75 + rng.next() * 20,
    50 + rng.next() * 15
  );
  const zkVisitedColor = hsl(zkHue, 55 + rng.next() * 20, 35 + rng.next() * 10);

  // Crown colors: golden hue (around 45-50 degrees) for crown emoji cells
  // Always use gold tones regardless of seed for consistency with the crown theme
  const crownHue = 48; // Gold hue
  const crownBackgroundColor = hsl(crownHue, 85, 55);
  const crownVisitedColor = hsl(crownHue, 70, 40);

  // Player color: golden crown feel
  const playerHue = 45 + rng.next() * 15; // Gold range
  const playerColor = hsl(
    playerHue,
    90 + rng.next() * 10,
    55 + rng.next() * 10
  );
  const playerGlowColor = hsla(playerHue, 100, 60, 0.6);

  // Key color: golden/yellow tones
  const keyHue = 50 + rng.next() * 15;
  const keyColor = hsl(keyHue, 85 + rng.next() * 15, 50 + rng.next() * 10);
  const keyGlowColor = hsla(keyHue, 100, 55, 0.5);

  // Goal color: distinct, inviting
  const goalHue = (baseHue + 90 + rng.next() * 60 - 30) % 360;
  const goalColor = hsl(goalHue, 60 + rng.next() * 25, 45 + rng.next() * 15);
  const goalGlowColor = hsla(goalHue, 80, 50, 0.5);

  // UI accent: vibrant, distinct from other colors
  const uiHue = (baseHue + 210 + rng.next() * 60 - 30) % 360;
  const uiAccentColor = hsl(uiHue, 75 + rng.next() * 20, 55 + rng.next() * 10);

  // Chrome colors: page background, header tint, and modal overlay all share
  // the wall's hue family so the UI reads as one palette. Computed from
  // baseHue without consuming the rng — keeps every seed's existing colors
  // (wall/path/ui/etc.) stable; only adds new fields.
  const pageBackgroundColor = hsl(baseHue, 22, 9);
  const headerBackgroundColor = hsla(baseHue, 28, 14, 0.55);
  const modalOverlayColor = hsla(baseHue, 30, 8, 0.7);

  return {
    wallColor,
    pathColor,
    mazeBackgroundColor,
    visitedColor,
    textWallColor,
    textBackgroundColor,
    textVisitedColor,
    zkBackgroundColor,
    zkVisitedColor,
    crownBackgroundColor,
    crownVisitedColor,
    playerColor,
    keyColor,
    goalColor,
    uiAccentColor,
    playerGlowColor,
    keyGlowColor,
    goalGlowColor,
    pageBackgroundColor,
    headerBackgroundColor,
    modalOverlayColor,
  };
}
