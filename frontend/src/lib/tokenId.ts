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
 * The layout encodes 4 entity positions in the header (king, robe, scepter,
 * goal) — see `serializeLayoutBytes` for the canonical byte order.
 *
 * ⚠️ CONSENSUS-CRITICAL FILE — see ma-5yi
 *
 * `serializeLayoutBytes` writes the exact byte stream that gets hashed.
 * The header field order (width, height, sx, sy, robe_x, robe_y, scepter_x,
 * scepter_y, gx, gy), big-endian u16 encoding, header offset, and packed-cell
 * placement must mirror the Noir `compute_maze_hash` byte layout exactly.
 * Any drift changes mazeHash → tokenID for every existing seed.
 *
 * Post-mainnet edits require a coordinated migration plan AND a
 * `consensus-critical-change: <bead-id>` line in the commit body.
 * The lint gate `just check-consensus-critical` enforces this.
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
/// Layout (1520 bytes total for the default config):
///   bytes[ 0..20] = 10 BE u16: width, height, sx, sy, robe_x, robe_y,
///                              scepter_x, scepter_y, gx, gy
///   bytes[20..]   = packed_cells, zero-padded to MAX_PACKED_BYTES
///
/// Must mirror the Noir `compute_maze_hash` byte layout exactly.
export function serializeLayoutBytes(
  seedOrZk: string | ReturnType<typeof serializeForZk>
): Uint8Array {
  const zk =
    typeof seedOrZk === 'string'
      ? (() => {
          const { maze, kingPos, robePos, scepterPos, goalPos } = generateMaze(
            seedOrZk,
            {
              debug: isDebugSeedActive(seedOrZk),
            }
          );
          return serializeForZk(maze, kingPos, robePos, scepterPos, goalPos);
        })()
      : seedOrZk;

  const out = new Uint8Array(LAYOUT_TOTAL_BYTES);
  const header: number[] = [
    zk.width,
    zk.height,
    zk.startX,
    zk.startY,
    zk.robeX,
    zk.robeY,
    zk.scepterX,
    zk.scepterY,
    zk.goalX,
    zk.goalY,
  ];
  for (let i = 0; i < 10; i++) {
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
