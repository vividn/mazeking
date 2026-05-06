import { createRng } from './seededRandom';
import { PALETTE_RECIPE, resolveHue } from './paletteRecipe.generated';

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
   * player, key, goal) are derived from `mazeHash` using the SAME formulas
   * as the on-chain SVG renderer (`contracts/src/MazeRenderer.sol`
   * :: `_palette`). The remaining "richer" fields (visited tints, glow,
   * chrome, ui accent) are still seed-derived so the live game keeps its
   * visual variety; they are computed as offsets from the canonical hues so
   * everything still reads as one palette.
   *
   * When omitted, the function preserves the original seed-only behavior.
   */
  mazeHash?: string;
}

// HSL output mirrors `MazePalette._hsl` in Solidity byte-for-byte. The
// no-space form is identical to what the on-chain SVG embeds (see ma-fy3),
// so the canonical-palette golden tests can assert exact string equality.
// Browsers parse both forms identically as CSS.
const hsl = (h: number, s: number, l: number) => `hsl(${h},${s}%,${l}%)`;
const hsla = (h: number, s: number, l: number, a: number) =>
  `hsla(${h},${s}%,${l}%,${a})`;

interface CanonicalPalette {
  baseHue: number; // 0..360
  wall: { h: number; s: number; l: number };
  mazeBg: { h: number; s: number; l: number };
  textBg: { h: number; s: number; l: number };
  zkBg: { h: number; s: number; l: number };
  crownBg: { h: number; s: number; l: number };
  player: { h: number; s: number; l: number };
  key: { h: number; s: number; l: number };
  goal: { h: number; s: number; l: number };
}

/**
 * Canonical palette derived from the maze hash. The structural fields
 * (`wall`, `mazeBg`, `textBg`, `zkBg`, `crownBg`) MUST match
 * `MazePalette.palette()` in contracts/src/MazePalette.sol byte-for-byte —
 * those are the colors the on-chain SVG renders, and the live game render
 * has to agree on them. The entity fields (`player`, `key`, `goal`) are
 * frontend-only: the on-chain SVG no longer draws character/pickup/goal
 * overlays (ma-e7r), so they live in the same recipe but are flagged
 * `onChain: false` and never reach Solidity.
 *
 * The recipe is codegen'd from `palette/paletteRecipe.json` — see ma-fy3.
 */
function canonicalPaletteFromHash(mazeHash: string): CanonicalPalette {
  const baseHue = Number(BigInt(mazeHash) % 360n);
  const out = { baseHue } as CanonicalPalette;
  for (const f of PALETTE_RECIPE) {
    (out as Record<string, unknown>)[f.name] = {
      h: resolveHue(f, baseHue),
      s: f.s,
      l: f.l,
    };
  }
  return out;
}

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
