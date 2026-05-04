/**
 * Pedersen-hash wiring for maze layout identity.
 *
 * Under the hash-as-public-input architecture (ma-6cr.6) the proof's first
 * public input is `mazeHash = pedersen(canonicalLayoutBytes)`. This module
 * is the TS counterpart to Noir's `compute_maze_hash` (maze_prover/src/hash.nr).
 * Both implementations MUST produce byte-identical hashes for the same layout
 * bytes — that is the cross-layer invariant the on-chain verifier relies on.
 *
 * Byte → field packing (must mirror Noir):
 *   - Layout buffer is exactly LAYOUT_TOTAL_BYTES (1516) bytes.
 *   - We pack into 49 fields × 31 bytes each, big-endian within each chunk.
 *   - 1516 = 48 * 31 + 28, so the last field's high 3 bytes are zero-padded.
 *   - Hash index is 0 (matches Noir's `std::hash::pedersen_hash(fields)`).
 */

import { BarretenbergSync, Fr } from '@aztec/bb.js';
import {
  LAYOUT_HEADER_BYTES,
  LAYOUT_TOTAL_BYTES,
  MAX_PACKED_BYTES,
} from './mazeConstants.generated';

const PEDERSEN_FIELD_BYTES = 31;
const LAYOUT_FIELD_COUNT = Math.ceil(LAYOUT_TOTAL_BYTES / PEDERSEN_FIELD_BYTES);

let initPromise: Promise<BarretenbergSync> | null = null;

async function getApi(): Promise<BarretenbergSync> {
  if (!initPromise) {
    initPromise = BarretenbergSync.initSingleton();
  }
  return initPromise;
}

/**
 * Pre-warm the Barretenberg WASM. Optional but recommended at app startup
 * so the user does not eat the ~hundreds-of-ms init cost on the first hash.
 */
export async function preloadMazeIdentity(): Promise<void> {
  await getApi();
}

/**
 * Pack a layout buffer into the 49 BN254 field elements that the Pedersen
 * call expects. Big-endian within each 31-byte chunk; trailing bytes past
 * LAYOUT_TOTAL_BYTES are treated as zero (matches Noir).
 */
function layoutToFields(layout: Uint8Array): Fr[] {
  if (layout.length !== LAYOUT_TOTAL_BYTES) {
    throw new Error(
      `mazeIdentity: layout must be ${LAYOUT_TOTAL_BYTES} bytes, got ${layout.length}`
    );
  }
  const fields: Fr[] = new Array(LAYOUT_FIELD_COUNT);
  for (let f = 0; f < LAYOUT_FIELD_COUNT; f++) {
    let acc = 0n;
    for (let j = 0; j < PEDERSEN_FIELD_BYTES; j++) {
      const idx = f * PEDERSEN_FIELD_BYTES + j;
      const byte = idx < LAYOUT_TOTAL_BYTES ? layout[idx] : 0;
      acc = acc * 256n + BigInt(byte);
    }
    fields[f] = new Fr(acc);
  }
  return fields;
}

function frToHex(fr: Fr): `0x${string}` {
  // Fr.toBuffer() returns the 32-byte big-endian field element. Encode it as
  // a `0x`-prefixed lowercase hex string so the result is contract-friendly
  // (bytes32) regardless of any leading-zero stripping in `Fr.toString()`.
  const buf = fr.toBuffer();
  let hex = '';
  for (let i = 0; i < buf.length; i++) {
    hex += buf[i].toString(16).padStart(2, '0');
  }
  return `0x${hex.padStart(64, '0')}` as `0x${string}`;
}

/**
 * Compute the canonical Pedersen hash of a 1516-byte maze layout.
 *
 * @returns 32-byte field element as a `0x`-prefixed lowercase hex string.
 *          This is the value the proof commits to as `maze_hash` and the
 *          NFT contract uses as the `tokenId`.
 */
export async function computeMazeHash(
  layout: Uint8Array
): Promise<`0x${string}`> {
  const api = await getApi();
  const fields = layoutToFields(layout);
  const hash = api.pedersenHash(fields, 0);
  return frToHex(hash);
}

/**
 * Convenience: compute the mazeHash for the given canonical layout and also
 * return it as a `bigint` for callers that want to consume it as a number.
 */
export async function computeMazeHashBigInt(
  layout: Uint8Array
): Promise<{ hex: `0x${string}`; value: bigint }> {
  const hex = await computeMazeHash(layout);
  return { hex, value: BigInt(hex) };
}

// Re-export constants for callers that want to validate layout sizing
// without importing from two places.
export { LAYOUT_HEADER_BYTES, LAYOUT_TOTAL_BYTES, MAX_PACKED_BYTES };
