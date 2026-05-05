/**
 * Regression: production builds must not ship Alchemy's `demo` API key as a
 * fallback. The demo key blocks CORS from non-Alchemy origins, so every
 * eth_call (including viem's pre-tx simulateContract) fails silently and the
 * mint flow never opens a wallet popup. (ma-jr9)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('wagmi config', () => {
  it('does not reference the alchemy demo key as a fallback', () => {
    const source = readFileSync(
      resolve(__dirname, '../wagmi.ts'),
      'utf8'
    );
    // Allow the string to appear inside a comment that explains why we
    // refuse to use it, but never as part of an actual URL literal.
    const literalUse = source.match(/['"`][^'"`]*\/v2\/demo[^'"`]*['"`]/);
    expect(literalUse).toBeNull();
  });
});
