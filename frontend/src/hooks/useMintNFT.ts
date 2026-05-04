import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
} from 'wagmi';
import MazeKingNFTAbi from '../lib/abi/MazeKingNFT.json';
import { getContractAddress } from '../lib/contracts';

/**
 * Hook to mint an NFT under the hash-as-public-input architecture
 * (ma-6cr.6). The on-chain signature is now:
 *
 *   mintWithProof(bytes proof, bytes32 mazeHash, bytes layout, uint16 moveCount)
 *
 * `mazeHash` is the Pedersen hash of the canonical layout (computed via
 * bb.js — that wiring lives in ma-6cr.8). `layout` is the canonical bytes
 * the same hash is computed over.
 */
export function useMintNFT() {
  const { chain } = useAccount();
  const {
    data: hash,
    writeContract,
    isPending,
    error,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const mintWithProof = async (
    proof: Uint8Array,
    mazeHash: `0x${string}`,
    layout: Uint8Array,
    moveCount: number
  ) => {
    if (!chain) {
      throw new Error('No chain connected');
    }

    const nftAddress = getContractAddress(chain.id, 'nft');
    if (!nftAddress) {
      throw new Error(
        `Contract not deployed on ${chain.name}. Please deploy contracts first.`
      );
    }

    const proofHex = `0x${Array.from(proof)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}` as `0x${string}`;
    const layoutHex = `0x${Array.from(layout)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}` as `0x${string}`;

    console.log('Minting NFT with proof:', {
      nftAddress,
      proofLength: proof.length,
      layoutLength: layout.length,
      mazeHash,
      moveCount,
      chainId: chain.id,
      chainName: chain.name,
    });

    await writeContract({
      address: nftAddress,
      abi: MazeKingNFTAbi,
      functionName: 'mintWithProof',
      args: [proofHex, mazeHash, layoutHex, moveCount],
    });
  };

  return {
    mintWithProof,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}
