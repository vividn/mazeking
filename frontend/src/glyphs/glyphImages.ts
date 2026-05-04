import { useEffect, useState } from 'react';
import peasantUrl from './peasant.png?url';
import peasantRegaliaUrl from './peasant_regalia.png?url';
import robeScepterUrl from './robe_scepter.png?url';
import kingUrl from './king.png?url';
import crownUrl from './crown.png?url';

export interface GlyphImages {
  peasant: HTMLImageElement;
  peasantRegalia: HTMLImageElement;
  robeScepter: HTMLImageElement;
  king: HTMLImageElement;
  crown: HTMLImageElement;
}

const URLS = {
  peasant: peasantUrl,
  peasantRegalia: peasantRegaliaUrl,
  robeScepter: robeScepterUrl,
  king: kingUrl,
  crown: crownUrl,
};

let cached: GlyphImages | null = null;
let pending: Promise<GlyphImages> | null = null;

function loadOne(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

function loadGlyphImages(): Promise<GlyphImages> {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;

  pending = Promise.all([
    loadOne(URLS.peasant),
    loadOne(URLS.peasantRegalia),
    loadOne(URLS.robeScepter),
    loadOne(URLS.king),
    loadOne(URLS.crown),
  ]).then(([peasant, peasantRegalia, robeScepter, king, crown]) => {
    cached = { peasant, peasantRegalia, robeScepter, king, crown };
    return cached;
  });

  return pending;
}

/**
 * Load all PNG glyphs once and share the cached HTMLImageElements across
 * mounts. Returns null while images are still loading; callers should fall
 * back to procedural sprites until then so there's no flash of empty cells.
 */
export function useGlyphImages(): GlyphImages | null {
  const [images, setImages] = useState<GlyphImages | null>(cached);

  useEffect(() => {
    if (cached) {
      setImages(cached);
      return;
    }
    let cancelled = false;
    loadGlyphImages()
      .then((loaded) => {
        if (!cancelled) setImages(loaded);
      })
      .catch(() => {
        // Swallow load failures — caller stays on procedural fallback.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return images;
}
