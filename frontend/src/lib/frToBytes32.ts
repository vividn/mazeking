/**
 * Fr → bytes32 hex conversion (silent-failure-safe).
 *
 * `Fr.toString()` returns a hex string with leading zeros stripped, which means
 * ~1-in-256 BN254 field elements (those whose high byte is < 0x10) yield fewer
 * than 64 hex chars. viem's bytes32-coerce zero-extends on the WRONG end, so
 * mints fail in production for a small but real fraction of mazes — see retro
 * 2026-05-05 Appendix C and bead ma-dr5.
 *
 * This helper wraps the only correct path: `Fr.toBuffer()` → per-byte hex with
 * `padStart(2, '0')` → `0x`-prefix. Always 66 chars total.
 *
 * Always import and call this. Never call `Fr.toString()` directly when the
 * value will be passed to viem / cast / abi.encode as bytes32. The
 * `just check-no-fr-tostring` grep gate enforces this in CI.
 */

import type { Fr } from '@aztec/bb.js';

/**
 * Encode a BN254 field element as a `0x`-prefixed 64-char lowercase hex string.
 *
 * @param fr - Field element from bb.js (e.g. the output of `pedersenHash`).
 * @returns `0x`-prefixed lowercase hex of exactly 66 characters (`0x` + 64).
 */
export function frToBytes32(fr: Fr): `0x${string}` {
  const buf = fr.toBuffer();
  let hex = '';
  for (let i = 0; i < buf.length; i++) {
    hex += buf[i].toString(16).padStart(2, '0');
  }
  return `0x${hex.padStart(64, '0')}` as `0x${string}`;
}
