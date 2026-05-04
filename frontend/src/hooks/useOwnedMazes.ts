import { useEffect, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import type { Address, PublicClient } from 'viem';
import { parseAbiItem } from 'viem';
import MazeKingNFTAbi from '../lib/abi/MazeKingNFT.json';
import { getContractAddress } from '../lib/contracts';
import { lookupSeed } from '../lib/mintRegistry';

/**
 * How far back from the current block to scan for ERC1155 transfer logs.
 * Sepolia public RPCs typically cap eth_getLogs at ~10k blocks per call; we
 * chunk in 9_000-block slices and walk backwards. With ~12s blocks, 100k
 * blocks is roughly 14 days of history — comfortably covers the demo window
 * for a recently-deployed contract without paginating to genesis.
 */
const LOOKBACK_BLOCKS = 100_000n;
const CHUNK_SIZE = 9_000n;

const TRANSFER_SINGLE = parseAbiItem(
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)'
);
const TRANSFER_BATCH = parseAbiItem(
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)'
);

export interface OwnedMaze {
  tokenId: bigint;
  imageUrl: string | null;
  seed: string | null;
}

interface State {
  loading: boolean;
  error: string | null;
  mazes: OwnedMaze[];
}

async function scanIncomingTokenIds(
  client: PublicClient,
  contract: Address,
  owner: Address
): Promise<bigint[]> {
  const head = await client.getBlockNumber();
  const oldest = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n;

  const ids = new Set<string>();
  let to = head;
  while (to >= oldest) {
    const from =
      to >= CHUNK_SIZE && to - CHUNK_SIZE > oldest ? to - CHUNK_SIZE : oldest;

    const [singles, batches] = await Promise.all([
      client.getLogs({
        address: contract,
        event: TRANSFER_SINGLE,
        args: { to: owner },
        fromBlock: from,
        toBlock: to,
      }),
      client.getLogs({
        address: contract,
        event: TRANSFER_BATCH,
        args: { to: owner },
        fromBlock: from,
        toBlock: to,
      }),
    ]);

    for (const log of singles) {
      const id = log.args.id;
      if (id !== undefined) ids.add(id.toString());
    }
    for (const log of batches) {
      for (const id of log.args.ids ?? []) ids.add(id.toString());
    }

    if (from === oldest) break;
    to = from - 1n;
  }

  return Array.from(ids, (s) => BigInt(s));
}

/**
 * Decode a `data:application/json;base64,...` token URI into the SVG image
 * URL referenced inside it. The renderer emits `image` as a
 * `data:image/svg+xml;base64,...` URI which can be set directly as <img src>.
 */
function decodeImageFromTokenUri(tokenUri: string): string | null {
  if (!tokenUri.startsWith('data:application/json;base64,')) {
    // Fallback: assume it's already an image URL (e.g. ipfs gateway).
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

export function useOwnedMazes(): State & { refresh: () => void } {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const [state, setState] = useState<State>({
    loading: false,
    error: null,
    mazes: [],
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!address || !chain || !publicClient) {
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
        // Seed→tokenId hydration is paused under the hash-as-public-input
        // architecture (ma-6cr.6): tokenId now comes from a Pedersen hash of
        // the canonical layout, computed via bb.js. ma-6cr.8 will restore
        // this path once the bb.js Pedersen wiring lands.

        const tokenIds = await scanIncomingTokenIds(
          publicClient,
          contractAddress,
          address
        );
        if (cancelled) return;

        if (tokenIds.length === 0) {
          setState({ loading: false, error: null, mazes: [] });
          return;
        }

        // Filter to actually-held tokens (could've been transferred away),
        // and fetch each tokenURI in parallel.
        const balances = await publicClient.multicall({
          contracts: tokenIds.map((id) => ({
            address: contractAddress,
            abi: MazeKingNFTAbi as never,
            functionName: 'balanceOf',
            args: [address, id],
          })),
          allowFailure: true,
        });
        if (cancelled) return;

        const heldIds = tokenIds.filter((_, i) => {
          const r = balances[i];
          return r && r.status === 'success' && (r.result as bigint) > 0n;
        });

        if (heldIds.length === 0) {
          setState({ loading: false, error: null, mazes: [] });
          return;
        }

        const uris = await publicClient.multicall({
          contracts: heldIds.map((id) => ({
            address: contractAddress,
            abi: MazeKingNFTAbi as never,
            functionName: 'uri',
            args: [id],
          })),
          allowFailure: true,
        });
        if (cancelled) return;

        const mazes: OwnedMaze[] = heldIds.map((tokenId, i) => {
          const r = uris[i];
          const tokenUri =
            r && r.status === 'success' ? (r.result as string) : '';
          return {
            tokenId,
            imageUrl: decodeImageFromTokenUri(tokenUri),
            seed: lookupSeed(tokenId) ?? null,
          };
        });

        setState({ loading: false, error: null, mazes });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load mazes',
          mazes: [],
        });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [address, chain, publicClient, tick]);

  return { ...state, refresh: () => setTick((t) => t + 1) };
}
