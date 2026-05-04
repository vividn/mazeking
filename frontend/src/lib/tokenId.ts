/**
 * tokenId computation matching MazeKingNFT.mintWithProof on-chain logic:
 *
 *   tokenId = keccak256( concat( padBE32(publicInputs[0..MAZE_DATA_LENGTH-1]) ) )
 *
 * MAZE_DATA_LENGTH = 8 scalars (width, height, startX, startY, keyX, keyY,
 * goalX, goalY) + MAX_PACKED_BYTES packed-cell scalars. The contract excludes
 * move_count from the hash so the same maze produces the same tokenId for any
 * solution.
 */
import { keccak256 } from 'viem';
import { generateMaze } from './mazeGenerator';
import { isDebugSeedActive } from './debugSeed';
import { serializeForZk } from './zkSerialize';
import { MAX_PACKED_BYTES, MAZE_DATA_LENGTH } from './mazeConstants.generated';

function toBE32(value: number | bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = typeof value === 'bigint' ? value : BigInt(value);
  for (let i = 31; i >= 0 && v !== 0n; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function hexToBE32(hex: string): Uint8Array {
  const clean = (hex.startsWith('0x') ? hex.slice(2) : hex).padStart(64, '0');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function concatToHex(chunks: Uint8Array[]): `0x${string}` {
  let hex = '0x';
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) {
      hex += c[i].toString(16).padStart(2, '0');
    }
  }
  return hex as `0x${string}`;
}

/**
 * Compute the tokenId from prover-output public inputs. Mirrors the contract:
 * the first MAZE_DATA_LENGTH entries are hashed; move_count (the last entry)
 * is excluded.
 */
export function computeTokenIdFromPublicInputs(publicInputs: string[]): bigint {
  if (publicInputs.length < MAZE_DATA_LENGTH) {
    throw new Error(
      `publicInputs too short: ${publicInputs.length} < MAZE_DATA_LENGTH=${MAZE_DATA_LENGTH}`
    );
  }
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < MAZE_DATA_LENGTH; i++) {
    chunks.push(hexToBE32(publicInputs[i]));
  }
  const hash = keccak256(concatToHex(chunks));
  return BigInt(hash);
}

/**
 * Compute the tokenId for a seed by regenerating its maze and re-deriving the
 * same maze-data layout the prover would emit. Used to hydrate the local
 * tokenId↔seed registry from seedHistory so we can replay owned NFTs.
 */
export function computeTokenIdFromSeed(seed: string): bigint {
  const { maze, kingPos, keyPos, goalPos } = generateMaze(seed, {
    debug: isDebugSeedActive(seed),
  });
  const zk = serializeForZk(maze, kingPos, keyPos, goalPos);

  const padded = [...zk.packedCells];
  while (padded.length < MAX_PACKED_BYTES) padded.push(0);

  const chunks: Uint8Array[] = [
    toBE32(zk.width),
    toBE32(zk.height),
    toBE32(zk.startX),
    toBE32(zk.startY),
    toBE32(zk.keyX),
    toBE32(zk.keyY),
    toBE32(zk.goalX),
    toBE32(zk.goalY),
  ];
  for (const b of padded) chunks.push(toBE32(b));

  const hash = keccak256(concatToHex(chunks));
  return BigInt(hash);
}
