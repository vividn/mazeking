import { createRng } from './seededRandom';

export interface ColorScheme {
  wallColor: string;
  pathColor: string;
  textWallColor: string;
  textBackgroundColor: string;
  playerColor: string;
  keyColor: string;
  doorColor: string;
  uiAccentColor: string;
}

/**
 * Generates a deterministic color palette based on a seed string.
 * Uses HSL color space for better control over contrast and visual appeal.
 */
export function generateColorScheme(seed: string): ColorScheme {
  const rng = createRng(seed);

  // Helper to generate HSL color
  const hsl = (h: number, s: number, l: number) => `hsl(${h}, ${s}%, ${l}%)`;

  // Generate base hue (0-360) for the color scheme
  const baseHue = rng.next() * 360;

  // Wall color: dark, desaturated
  const wallHue = baseHue;
  const wallColor = hsl(wallHue, 15 + rng.next() * 15, 20 + rng.next() * 10);

  // Path color: very light, low saturation
  const pathHue = (baseHue + 30 + rng.next() * 60) % 360;
  const pathColor = hsl(pathHue, 5 + rng.next() * 10, 85 + rng.next() * 10);

  // Text wall color: complementary to base, medium-dark
  const textWallHue = (baseHue + 180 + rng.next() * 40 - 20) % 360;
  const textWallColor = hsl(textWallHue, 40 + rng.next() * 20, 30 + rng.next() * 15);

  // Text background: VIBRANT and glowing - high saturation, medium-high lightness
  const textBgHue = (baseHue + 120 + rng.next() * 80 - 40) % 360;
  const textBackgroundColor = hsl(textBgHue, 85 + rng.next() * 15, 60 + rng.next() * 15);

  // Player color: bright, saturated (crown/royal feel)
  const playerHue = (baseHue + 270 + rng.next() * 60 - 30) % 360;
  const playerColor = hsl(playerHue, 70 + rng.next() * 25, 50 + rng.next() * 15);

  // Key color: golden/yellow tones (45-65 hue range)
  const keyHue = 45 + rng.next() * 20;
  const keyColor = hsl(keyHue, 85 + rng.next() * 15, 55 + rng.next() * 10);

  // Door color: contrasting, medium saturation
  const doorHue = (baseHue + 90 + rng.next() * 60 - 30) % 360;
  const doorColor = hsl(doorHue, 50 + rng.next() * 25, 45 + rng.next() * 15);

  // UI accent: vibrant, distinct from other colors
  const uiHue = (baseHue + 210 + rng.next() * 60 - 30) % 360;
  const uiAccentColor = hsl(uiHue, 75 + rng.next() * 20, 55 + rng.next() * 10);

  return {
    wallColor,
    pathColor,
    textWallColor,
    textBackgroundColor,
    playerColor,
    keyColor,
    doorColor,
    uiAccentColor,
  };
}
