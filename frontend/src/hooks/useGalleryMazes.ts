import { useEffect, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import type { Address, PublicClient } from 'viem';
import { parseAbiItem } from 'viem';
import MazeKingNFTAbi from '../lib/abi/MazeKingNFT.json';
import { getContractAddress } from '../lib/contracts';
import { rememberMany } from '../lib/mintRegistry';

/**
 * How far back from the current block to scan event logs. Mirrors
 * useOwnedMazes — Sepolia public RPCs typically cap eth_getLogs at ~10k
 * blocks per call, so we walk in 9k slices.
 */
const LOOKBACK_BLOCKS = 100_000n;
const CHUNK_SIZE = 9_000n;

const MAZE_REGISTERED = parseAbiItem(
  'event MazeRegistered(bytes32 indexed seedHash, string seed, uint256 indexed tokenId)'
);
const PROOF_VERIFIED = parseAbiItem(
  'event ProofVerified(address indexed solver, uint256 indexed tokenId, uint16 moveCount)'
);

export interface GalleryMaze {
  tokenId: bigint;
  seed: string;
  imageUrl: string | null;
  timesSolved: number;
  minMoves: number | null;
}

interface State {
  loading: boolean;
  error: string | null;
  mazes: GalleryMaze[];
}

interface MazeAggregate {
  timesSolved: number;
  minMoves: number | null;
}

async function scanRegisteredMazes(
  client: PublicClient,
  contract: Address
): Promise<Array<{ tokenId: bigint; seed: string }>> {
  const head = await client.getBlockNumber();
  const oldest = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n;
  const seen = new Map<string, { tokenId: bigint; seed: string }>();

  let to = head;
  while (to >= oldest) {
    const from =
      to >= CHUNK_SIZE && to - CHUNK_SIZE > oldest ? to - CHUNK_SIZE : oldest;
    const logs = await client.getLogs({
      address: contract,
      event: MAZE_REGISTERED,
      fromBlock: from,
      toBlock: to,
    });
    for (const log of logs) {
      const tokenId = log.args.tokenId;
      const seed = log.args.seed;
      if (tokenId !== undefined && typeof seed === 'string') {
        seen.set(tokenId.toString(), { tokenId, seed });
      }
    }
    if (from === oldest) break;
    to = from - 1n;
  }

  return Array.from(seen.values());
}

async function scanProofStats(
  client: PublicClient,
  contract: Address
): Promise<Map<string, MazeAggregate>> {
  const head = await client.getBlockNumber();
  const oldest = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n;
  const stats = new Map<string, MazeAggregate>();

  let to = head;
  while (to >= oldest) {
    const from =
      to >= CHUNK_SIZE && to - CHUNK_SIZE > oldest ? to - CHUNK_SIZE : oldest;
    const logs = await client.getLogs({
      address: contract,
      event: PROOF_VERIFIED,
      fromBlock: from,
      toBlock: to,
    });
    for (const log of logs) {
      const tokenId = log.args.tokenId;
      const moveCount = log.args.moveCount;
      if (tokenId === undefined || moveCount === undefined) continue;
      const key = tokenId.toString();
      const cur = stats.get(key);
      const moves = Number(moveCount);
      if (cur) {
        cur.timesSolved += 1;
        cur.minMoves =
          cur.minMoves === null ? moves : Math.min(cur.minMoves, moves);
      } else {
        stats.set(key, { timesSolved: 1, minMoves: moves });
      }
    }
    if (from === oldest) break;
    to = from - 1n;
  }

  return stats;
}

function decodeImageFromTokenUri(tokenUri: string): string | null {
  if (!tokenUri.startsWith('data:application/json;base64,')) {
    return tokenUri || null;
  }
  try {
    const b64 = tokenUri.slice('data:application/json;base64,'.length);
    const json = atob(b64);
    const meta = JSON.parse(json);
    return typeof meta.image === 'string' ? meta.image : null;
  } catch {
    return null;
  }
}

export function useGalleryMazes(
  enabled: boolean
): State & { refresh: () => void } {
  const { chain } = useAccount();
  const publicClient = usePublicClient();
  const [state, setState] = useState<State>({
    loading: false,
    error: null,
    mazes: [],
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function run() {
      if (!chain || !publicClient) {
        setState({ loading: false, error: null, mazes: [] });
        return;
      }
      const contractAddress = getContractAddress(chain.id, 'nft');
      if (!contractAddress) {
        setState({
          loading: false,
          error: `Contracts not deployed on ${chain.name}`,
          mazes: [],
        });
        return;
      }

      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const [registered, proofStats] = await Promise.all([
          scanRegisteredMazes(publicClient, contractAddress),
          scanProofStats(publicClient, contractAddress),
        ]);
        if (cancelled) return;

        if (registered.length === 0) {
          setState({ loading: false, error: null, mazes: [] });
          return;
        }

        // Hydrate the local seed registry so other views (My Mazes) can
        // recover replay seeds for tokens minted on a different device.
        rememberMany(registered);

        const tokenIds = registered.map((r) => r.tokenId);

        const [disqResults, uriResults] = await Promise.all([
          publicClient.multicall({
            contracts: tokenIds.map((id) => ({
              address: contractAddress,
              abi: MazeKingNFTAbi as never,
              functionName: 'disqualified',
              args: [id],
            })),
            allowFailure: true,
          }),
          publicClient.multicall({
            contracts: tokenIds.map((id) => ({
              address: contractAddress,
              abi: MazeKingNFTAbi as never,
              functionName: 'uri',
              args: [id],
            })),
            allowFailure: true,
          }),
        ]);
        if (cancelled) return;

        const mazes: GalleryMaze[] = [];
        for (let i = 0; i < registered.length; i++) {
          const dq = disqResults[i];
          if (dq && dq.status === 'success' && dq.result === true) continue;

          const u = uriResults[i];
          const tokenUri =
            u && u.status === 'success' ? (u.result as string) : '';
          const agg = proofStats.get(tokenIds[i].toString());
          mazes.push({
            tokenId: tokenIds[i],
            seed: registered[i].seed,
            imageUrl: decodeImageFromTokenUri(tokenUri),
            timesSolved: agg?.timesSolved ?? 0,
            minMoves: agg?.minMoves ?? null,
          });
        }

        setState({ loading: false, error: null, mazes });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load gallery',
          mazes: [],
        });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [enabled, chain, publicClient, tick]);

  return { ...state, refresh: () => setTick((t) => t + 1) };
}
