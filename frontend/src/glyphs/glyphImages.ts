import { useEffect, useState } from 'react';
import peasantUrl from './peasant.png?url';
import peasantRobeUrl from './peasant_robe.png?url';
import peasantScepterUrl from './peasant_scepter.png?url';
import peasantRegaliaUrl from './peasant_regalia.png?url';
import robeUrl from './robe.png?url';
import scepterUrl from './scepter.png?url';
import kingUrl from './king.png?url';
import crownUrl from './crown.png?url';

export interface GlyphImages {
  peasant: HTMLImageElement;
  peasantRobe: HTMLImageElement;
  peasantScepter: HTMLImageElement;
  peasantRegalia: HTMLImageElement;
  robe: HTMLImageElement;
  scepter: HTMLImageElement;
  king: HTMLImageElement;
  crown: HTMLImageElement;
}

const URLS = {
  peasant: peasantUrl,
  peasantRobe: peasantRobeUrl,
  peasantScepter: peasantScepterUrl,
  peasantRegalia: peasantRegaliaUrl,
  robe: robeUrl,
  scepter: scepterUrl,
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
    loadOne(URLS.peasantRobe),
    loadOne(URLS.peasantScepter),
    loadOne(URLS.peasantRegalia),
    loadOne(URLS.robe),
    loadOne(URLS.scepter),
    loadOne(URLS.king),
    loadOne(URLS.crown),
  ]).then(
    ([
      peasant,
      peasantRobe,
      peasantScepter,
      peasantRegalia,
      robe,
      scepter,
      king,
      crown,
    ]) => {
      cached = {
        peasant,
        peasantRobe,
        peasantScepter,
        peasantRegalia,
        robe,
        scepter,
        king,
        crown,
      };
      return cached;
    }
  );

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
