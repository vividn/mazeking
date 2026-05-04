/**
 * Cross-layer hash test. The bedrock invariant under the
 * hash-as-public-input architecture (ma-6cr.6/ma-6cr.8) is that
 *
 *   pedersenHash(canonical_layout_bytes)  ==  mazeHash
 *
 * agrees byte-for-byte between the Noir circuit (maze_prover/src/hash.nr)
 * and the TS frontend (lib/mazeIdentity.ts). The pinned values below
 * come from the Noir test `pin_cross_layer_hashes` — running that test
 * alongside this one is the canary that the canonical encoding stays
 * synchronized.
 */
import { describe, expect, it } from 'vitest';
import {
  computeMazeHash,
  deriveColors,
  tokenIdFromMazeHash,
} from '../mazeIdentity';
import {
  LAYOUT_HEADER_BYTES,
  LAYOUT_TOTAL_BYTES,
} from '../mazeConstants.generated';
import { layoutBytesForSeed } from '../tokenId';

const ZERO_LAYOUT_HASH =
  '0x09d86f2a6cdfa27e445f9514e3763cf6a9bd25a0e21378dd48e49fd32b8b0405';
const DEMO_LAYOUT_HASH =
  '0x091e8caf209848caf2aed2456ed92f71100b37745f66411bbb1108118217ffdc';

describe('computeMazeHash (cross-layer pin)', () => {
  it('matches the Noir circuit hash for an all-zero layout', async () => {
    const layout = new Uint8Array(LAYOUT_TOTAL_BYTES);
    const hash = await computeMazeHash(layout);
    expect(hash).toBe(ZERO_LAYOUT_HASH);
  });

  it('matches the Noir circuit hash for the pinned demo layout', async () => {
    // Mirrors the Noir test inputs: width=20, height=20, start=(1,2),
    // key=(3,4), goal=(18,19); packed[0]=0xAB, packed[1]=0xCD, packed[7]=0x12.
    const layout = new Uint8Array(LAYOUT_TOTAL_BYTES);
    const writeU16 = (off: number, v: number) => {
      layout[off] = (v >> 8) & 0xff;
      layout[off + 1] = v & 0xff;
    };
    writeU16(0, 20); // width
    writeU16(2, 20); // height
    writeU16(4, 1); // start_x
    writeU16(6, 2); // start_y
    writeU16(8, 3); // key_x
    writeU16(10, 4); // key_y
    writeU16(12, 18); // goal_x
    writeU16(14, 19); // goal_y
    layout[LAYOUT_HEADER_BYTES + 0] = 0xab;
    layout[LAYOUT_HEADER_BYTES + 1] = 0xcd;
    layout[LAYOUT_HEADER_BYTES + 7] = 0x12;

    const hash = await computeMazeHash(layout);
    expect(hash).toBe(DEMO_LAYOUT_HASH);
  });

  it('is deterministic for the same input', async () => {
    const layout = layoutBytesForSeed('stable');
    const h1 = await computeMazeHash(layout);
    const h2 = await computeMazeHash(layout);
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different seeds', async () => {
    const a = await computeMazeHash(layoutBytesForSeed('alpha'));
    const b = await computeMazeHash(layoutBytesForSeed('bravo'));
    expect(a).not.toBe(b);
  });
});

describe('deriveColors', () => {
  it('produces the same eight on-chain palette fields as Solidity', () => {
    // Pin baseHue = uint256(mazeHash) % 360. The Solidity renderer
    // (MazeRenderer.sol `_palette`) uses these exact formulas; if the
    // frontend drifts, the live render and on-chain SVG no longer match.
    const colors = deriveColors(ZERO_LAYOUT_HASH);
    const baseHue =
      Number(tokenIdFromMazeHash(ZERO_LAYOUT_HASH) % 360n) % 360;
    expect(colors.wallColor).toBe(`hsl(${baseHue}, 25%, 22%)`);
    expect(colors.mazeBackgroundColor).toBe(
      `hsl(${(baseHue + 30) % 360}, 22%, 80%)`
    );
    const textBgHue = (baseHue + 200) % 360;
    expect(colors.textBackgroundColor).toBe(`hsl(${textBgHue}, 80%, 60%)`);
    expect(colors.zkBackgroundColor).toBe(
      `hsl(${(textBgHue + 120) % 360}, 80%, 55%)`
    );
    expect(colors.crownBackgroundColor).toBe('hsl(48, 85%, 55%)');
    expect(colors.playerColor).toBe('hsl(45, 90%, 60%)');
    expect(colors.keyColor).toBe('hsl(55, 85%, 55%)');
    expect(colors.goalColor).toBe(`hsl(${(baseHue + 90) % 360}, 65%, 50%)`);
  });

  it('is deterministic across calls', () => {
    const a = deriveColors(DEMO_LAYOUT_HASH);
    const b = deriveColors(DEMO_LAYOUT_HASH);
    expect(a).toEqual(b);
  });
});
