/**
 * Maze identity: the cross-layer hash of the canonical layout, plus
 * helpers to derive a token id and the on-chain SVG palette from it.
 *
 * Under the hash-as-public-input architecture (ma-6cr.6) the proof's
 * first public input IS `mazeHash = pedersen(layout)`, where the layout
 * bytes are produced by `serializeLayoutBytes` in tokenId.ts. The Noir
 * circuit (maze_prover/src/hash.nr) and this module must agree byte-for-
 * byte on:
 *
 *   1. The 1516-byte canonical buffer (header u16s BE + zero-padded
 *      packed cells).
 *   2. The chunking into 49 BN254 fields, 31 bytes BE per chunk.
 *   3. `pedersen_hash(fields)` with hash_index = 0.
 *
 * The MazeKingNFT contract takes that hash as `tokenId`; the on-chain
 * SVG renderer (MazeRenderer.sol) then derives its palette from
 * `uint256(mazeHash) % 360`. We mirror that formula in `deriveColors`
 * so the live game render matches the on-chain image.
 */

import { BarretenbergSync, Fr } from '@aztec/bb.js';
import {
  LAYOUT_TOTAL_BYTES,
  LAYOUT_HEADER_BYTES,
  MAX_PACKED_BYTES,
} from './mazeConstants.generated';
import type { ColorScheme } from './colorGenerator';

const PEDERSEN_FIELD_BYTES = 31;
const LAYOUT_FIELD_COUNT = Math.ceil(LAYOUT_TOTAL_BYTES / PEDERSEN_FIELD_BYTES);
const PEDERSEN_HASH_INDEX = 0;

// Sanity: the Noir side hardcodes 49 fields; mirror it as a static check.
if (LAYOUT_FIELD_COUNT !== 49) {
  // Layout size changed → circuit and this module must re-pin.
  throw new Error(
    `mazeIdentity: expected 49 layout fields, got ${LAYOUT_FIELD_COUNT}. ` +
      'Circuit (hash.nr) and this module must agree.'
  );
}

let bbReady: Promise<BarretenbergSync> | null = null;

/// Initialize the Barretenberg WASM singleton used by `pedersenHash`.
/// First call triggers a (heavy) WASM init; subsequent calls reuse it.
export function ensureBarretenberg(): Promise<BarretenbergSync> {
  if (!bbReady) {
    bbReady = BarretenbergSync.initSingleton();
  }
  return bbReady;
}

/// Pack a 31-byte big-endian chunk into a bigint, mirroring `bytes_to_field`.
function chunkToBigInt(buf: Uint8Array, offset: number): bigint {
  let f = 0n;
  for (let i = 0; i < PEDERSEN_FIELD_BYTES; i++) {
    const byte = offset + i < buf.length ? buf[offset + i] : 0;
    f = (f << 8n) + BigInt(byte);
  }
  return f;
}

/// Compute mazeHash = Pedersen(canonical layout bytes), as a 0x-prefixed
/// 32-byte hex string. Matches `compute_maze_hash` in maze_prover/src/hash.nr.
export async function computeMazeHash(
  layoutBytes: Uint8Array
): Promise<`0x${string}`> {
  if (layoutBytes.length !== LAYOUT_TOTAL_BYTES) {
    throw new Error(
      `computeMazeHash: expected ${LAYOUT_TOTAL_BYTES} layout bytes, got ${layoutBytes.length}`
    );
  }
  const api = await ensureBarretenberg();

  const fields: Fr[] = new Array(LAYOUT_FIELD_COUNT);
  for (let f = 0; f < LAYOUT_FIELD_COUNT; f++) {
    fields[f] = new Fr(chunkToBigInt(layoutBytes, f * PEDERSEN_FIELD_BYTES));
  }

  const hash = api.pedersenHash(fields, PEDERSEN_HASH_INDEX);
  return hash.toString() as `0x${string}`;
}

/// `tokenId = uint256(mazeHash)`. Identical to computeTokenIdFromMazeHash
/// in tokenId.ts but kept here too so callers don't have to import both.
export function tokenIdFromMazeHash(mazeHash: string): bigint {
  const clean = mazeHash.startsWith('0x') ? mazeHash : `0x${mazeHash}`;
  return BigInt(clean);
}

/// Solidity-mirroring palette derivation. The on-chain SVG (MazeRenderer.sol
/// `_palette`) computes:
///
///   baseHue   = tokenId % 360
///   wall      = hsl(baseHue,            25, 22)
///   mazeBg    = hsl(baseHue + 30,       22, 80)
///   textBg    = hsl(baseHue + 200,      80, 60)
///   zkBg      = hsl(baseHue + 320,      80, 55)   // (200 + 120) % 360
///   crownBg   = hsl(48,                 85, 55)
///   player    = hsl(45,                 90, 60)
///   key       = hsl(55,                 85, 55)
///   goal      = hsl(baseHue + 90,       65, 50)
///
/// We reproduce those eight fields exactly so the live render matches
/// what's stored on chain. The remaining ColorScheme fields (visited
/// variants, text walls, page chrome) are derived from those eight via
/// HSL offsets — they don't appear in the on-chain SVG, so the canvas
/// is free to embellish.
export function deriveColors(mazeHash: string): ColorScheme {
  const baseHue = Number(tokenIdFromMazeHash(mazeHash) % 360n);

  const hsl = (h: number, s: number, l: number) =>
    `hsl(${((h % 360) + 360) % 360}, ${s}%, ${l}%)`;
  const hsla = (h: number, s: number, l: number, a: number) =>
    `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a})`;

  // Eight canonical fields — must match MazeRenderer.sol byte-for-byte.
  const wallColor = hsl(baseHue, 25, 22);
  const mazeBackgroundColor = hsl(baseHue + 30, 22, 80);
  const textBgHue = (baseHue + 200) % 360;
  const textBackgroundColor = hsl(textBgHue, 80, 60);
  const zkBackgroundColor = hsl(textBgHue + 120, 80, 55);
  const crownBackgroundColor = hsl(48, 85, 55);
  const playerColor = hsl(45, 90, 60);
  const keyColor = hsl(55, 85, 55);
  const goalColor = hsl(baseHue + 90, 65, 50);

  // Derived UX fields — purely client-side, not part of the on-chain palette.
  const pathColor = hsl(baseHue + 30, 12, 90);
  const visitedColor = hsl(baseHue + 30, 34, 72);
  const textWallColor = hsl(textBgHue, 55, 28);
  const textVisitedColor = hsl(textBgHue, 55, 47);
  const zkVisitedColor = hsl(textBgHue + 120, 55, 38);
  const crownVisitedColor = hsl(48, 70, 40);
  const playerGlowColor = hsla(45, 100, 60, 0.6);
  const keyGlowColor = hsla(55, 100, 55, 0.5);
  const goalGlowColor = hsla(baseHue + 90, 80, 50, 0.5);
  const uiAccentColor = hsl(baseHue + 210, 75, 60);
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

// Re-export for callers that only want the constants.
export {
  LAYOUT_TOTAL_BYTES,
  LAYOUT_HEADER_BYTES,
  MAX_PACKED_BYTES,
  PEDERSEN_FIELD_BYTES,
  LAYOUT_FIELD_COUNT,
};
