import { useEffect, useState } from 'react';
import type { ColorScheme } from '../types';
import {
  computeHashAlignedPalette,
  generateColorScheme,
} from '../lib/colorGenerator';

/**
 * Returns the palette for a seed using the same algorithm as the live game:
 *   1. paint immediately with the seed-only palette,
 *   2. upgrade to the hash-aligned palette once Pedersen WASM has computed
 *      `mazeHash` (matches the on-chain SVG byte-for-byte).
 *
 * Previews and the live render both flow through `computeHashAlignedPalette`,
 * so for the same seed they converge on identical colors. See ma-09y.
 */
export function useMazePaletteForSeed(seed: string): ColorScheme {
  const [colors, setColors] = useState<ColorScheme>(() =>
    generateColorScheme(seed)
  );

  useEffect(() => {
    setColors(generateColorScheme(seed));
    let cancelled = false;
    void (async () => {
      try {
        const upgraded = await computeHashAlignedPalette(seed);
        if (!cancelled) setColors(upgraded);
      } catch (err) {
        // Fall back to seed-only colors — proof/mint will surface its own
        // error path if WASM is genuinely broken.
        console.warn('Failed to compute maze hash for color alignment:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seed]);

  return colors;
}
