/**
 * Tests for the frToBytes32 helper.
 *
 * The whole point of the helper is to survive the silent-failure case where
 * a field element's high byte is < 0x10 (which happens for ~1-in-256 random
 * Pedersen outputs). These tests pin that behavior so a future refactor
 * can't regress it without lighting up CI.
 */
import { describe, expect, it } from 'vitest';
import { Fr } from '@aztec/bb.js';
import { frToBytes32 } from '../frToBytes32';

describe('frToBytes32', () => {
  it('produces a `0x`-prefixed 66-char string for a typical large value', () => {
    const fr = new Fr(
      0xdeadbeefcafef00d1234567890abcdef1234567890abcdef1234567890abcden
    );
    const out = frToBytes32(fr);
    expect(out).toHaveLength(66);
    expect(out).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('zero-pads when the high byte is < 0x10 (the silent-failure case)', () => {
    // High byte = 0x0a, exactly the case where Fr.toString() can drop a
    // leading zero (depending on bb.js version) and viem zero-extends on
    // the wrong end → bytes32 misalignment → mint failure.
    const fr = new Fr(
      0x0abcdef0_12345678_9abcdef0_12345678_9abcdef0_12345678_9abcdef0_12345678n
    );
    const out = frToBytes32(fr);
    expect(out).toHaveLength(66);
    expect(out).toBe(
      '0x0abcdef0123456789abcdef0123456789abcdef0123456789abcdef012345678'
    );
  });

  it('handles the most extreme low-byte case (single-bit high byte)', () => {
    // High byte = 0x01: would render as "1..." (63 chars) without the
    // helper's per-byte padStart.
    const fr = new Fr(
      0x0100000000000000000000000000000000000000000000000000000000000000n
    );
    const out = frToBytes32(fr);
    expect(out).toHaveLength(66);
    expect(out).toBe(
      '0x0100000000000000000000000000000000000000000000000000000000000000'
    );
  });

  it('encodes the zero field element as 64 hex zeros', () => {
    const out = frToBytes32(new Fr(0n));
    expect(out).toBe(
      '0x0000000000000000000000000000000000000000000000000000000000000000'
    );
  });

  it('lower-cases hex digits', () => {
    const fr = new Fr(0xabcdefn);
    const out = frToBytes32(fr);
    expect(out).toMatch(/^0x[0-9a-f]{64}$/);
    expect(out).not.toMatch(/[A-F]/);
  });
});
