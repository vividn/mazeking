import { createRng } from './seededRandom';

export interface ColorScheme {
  wallColor: string;
  pathColor: string;
  mazeBackgroundColor: string;  // Background for non-text maze areas
  visitedColor: string;         // Slightly different color for visited squares
  textWallColor: string;
  textBackgroundColor: string;
  textVisitedColor: string;     // Visited color for text cells
  playerColor: string;
  keyColor: string;
  doorColor: string;
  uiAccentColor: string;
  // Highlight colors for entities
  playerGlowColor: string;
  keyGlowColor: string;
  doorGlowColor: string;
}

/**
 * Generates a deterministic color palette based on a seed string.
 * Uses HSL color space for better control over contrast and visual appeal.
 */
export function generateColorScheme(seed: string): ColorScheme {
  const rng = createRng(seed);

  // Helper to generate HSL color
  const hsl = (h: number, s: number, l: number) => `hsl(${h}, ${s}%, ${l}%)`;
  const hsla = (h: number, s: number, l: number, a: number) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

  // Generate base hue (0-360) for the color scheme
  const baseHue = rng.next() * 360;

  // Wall color: dark, slightly saturated
  const wallHue = baseHue;
  const wallColor = hsl(wallHue, 20 + rng.next() * 15, 18 + rng.next() * 8);

  // Maze background: soft, muted color that complements text background
  const mazeBgHue = (baseHue + 30 + rng.next() * 30) % 360;
  const mazeBackgroundColor = hsl(mazeBgHue, 15 + rng.next() * 20, 75 + rng.next() * 10);

  // Path color: slightly lighter than maze background
  const pathColor = hsl(mazeBgHue, 10 + rng.next() * 15, 82 + rng.next() * 10);

  // Visited color: slightly darker/different tint than path
  const visitedColor = hsl(mazeBgHue, 20 + rng.next() * 15, 68 + rng.next() * 8);

  // Text wall color: darker, more saturated - stands out
  const textWallHue = (baseHue + 180 + rng.next() * 40 - 20) % 360;
  const textWallColor = hsl(textWallHue, 50 + rng.next() * 25, 25 + rng.next() * 10);

  // Text background: VIBRANT and glowing - contrasts nicely with maze background
  const textBgHue = (baseHue + 180 + rng.next() * 60 - 30) % 360; // Complementary
  const textBackgroundColor = hsl(textBgHue, 70 + rng.next() * 25, 55 + rng.next() * 15);

  // Text visited color: slightly darker/desaturated version of text background
  const textVisitedColor = hsl(textBgHue, 50 + rng.next() * 20, 42 + rng.next() * 10);

  // Player color: golden crown feel
  const playerHue = 45 + rng.next() * 15; // Gold range
  const playerColor = hsl(playerHue, 90 + rng.next() * 10, 55 + rng.next() * 10);
  const playerGlowColor = hsla(playerHue, 100, 60, 0.6);

  // Key color: golden/yellow tones
  const keyHue = 50 + rng.next() * 15;
  const keyColor = hsl(keyHue, 85 + rng.next() * 15, 50 + rng.next() * 10);
  const keyGlowColor = hsla(keyHue, 100, 55, 0.5);

  // Door color: distinct, inviting
  const doorHue = (baseHue + 90 + rng.next() * 60 - 30) % 360;
  const doorColor = hsl(doorHue, 60 + rng.next() * 25, 45 + rng.next() * 15);
  const doorGlowColor = hsla(doorHue, 80, 50, 0.5);

  // UI accent: vibrant, distinct from other colors
  const uiHue = (baseHue + 210 + rng.next() * 60 - 30) % 360;
  const uiAccentColor = hsl(uiHue, 75 + rng.next() * 20, 55 + rng.next() * 10);

  return {
    wallColor,
    pathColor,
    mazeBackgroundColor,
    visitedColor,
    textWallColor,
    textBackgroundColor,
    textVisitedColor,
    playerColor,
    keyColor,
    doorColor,
    uiAccentColor,
    playerGlowColor,
    keyGlowColor,
    doorGlowColor,
  };
}
