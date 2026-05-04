/**
 * tokenId computation under the hash-as-public-input architecture (ma-6cr.6).
 *
 *   tokenId = uint256(mazeHash)
 *
 * `mazeHash` is the BN254 Pedersen hash of the canonical maze layout (see
 * `serializeLayoutBytes` below); it is the proof's first public input and
 * also the on-chain token identity. Because a single Pedersen call binds
 * the entire layout, there is no separate keccak-of-publicInputs step.
 *
 * The Pedersen hash itself is computed via bb.js (Barretenberg WASM); that
 * wiring is the responsibility of ma-6cr.8 (frontend Pedersen integration).
 */
import { generateMaze } from './mazeGenerator';
import { isDebugSeedActive } from './debugSeed';
import { serializeForZk } from './zkSerialize';
import {
  LAYOUT_HEADER_BYTES,
  LAYOUT_TOTAL_BYTES,
  MAX_PACKED_BYTES,
} from './mazeConstants.generated';

/// Canonical layout bytes hashed to derive `mazeHash`.
///
/// Layout (1516 bytes total for the default config):
///   bytes[ 0..16] = 8 BE u16: width, height, sx, sy, kx, ky, gx, gy
///   bytes[16..]   = packed_cells, zero-padded to MAX_PACKED_BYTES
///
/// Must mirror the Noir `compute_maze_hash` byte layout exactly.
export function serializeLayoutBytes(
  seedOrZk: string | ReturnType<typeof serializeForZk>
): Uint8Array {
  const zk =
    typeof seedOrZk === 'string'
      ? (() => {
          const { maze, kingPos, keyPos, goalPos } = generateMaze(seedOrZk, {
            debug: isDebugSeedActive(seedOrZk),
          });
          return serializeForZk(maze, kingPos, keyPos, goalPos);
        })()
      : seedOrZk;

  const out = new Uint8Array(LAYOUT_TOTAL_BYTES);
  const header: number[] = [
    zk.width,
    zk.height,
    zk.startX,
    zk.startY,
    zk.keyX,
    zk.keyY,
    zk.goalX,
    zk.goalY,
  ];
  for (let i = 0; i < 8; i++) {
    out[i * 2] = (header[i] >> 8) & 0xff;
    out[i * 2 + 1] = header[i] & 0xff;
  }
  for (let i = 0; i < zk.packedCells.length && i < MAX_PACKED_BYTES; i++) {
    out[LAYOUT_HEADER_BYTES + i] = zk.packedCells[i] & 0xff;
  }
  return out;
}

/// Convert a Pedersen-hash hex string (Field as 0x...32 bytes) to a tokenId.
export function computeTokenIdFromMazeHash(mazeHash: string): bigint {
  if (!mazeHash) throw new Error('mazeHash is required');
  const clean = mazeHash.startsWith('0x') ? mazeHash : `0x${mazeHash}`;
  return BigInt(clean);
}

/// Returns the canonical layout for a seed. The Pedersen hash of these bytes
/// is the maze's tokenId; computing the actual hash lives in ma-6cr.8.
export function layoutBytesForSeed(seed: string): Uint8Array {
  return serializeLayoutBytes(seed);
}
