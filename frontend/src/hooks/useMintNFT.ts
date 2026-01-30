import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import MazeKingNFTAbi from '../lib/abi/MazeKingNFT.json';
import { getContractAddress } from '../lib/contracts';

/**
 * Hook to mint NFT by proving ZK proof of maze completion
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

  /**
   * Mint NFT with ZK proof
   * @param proof - The ZK proof bytes
   * @param publicInputs - Array of 2509 public inputs as hex strings
   * @param moveCount - Number of moves taken
   */
  const mintWithProof = async (
    proof: Uint8Array,
    publicInputs: string[],
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

    // Validate inputs
    if (publicInputs.length !== 1509) {
      throw new Error(
        `Invalid public inputs length: expected 2509, got ${publicInputs.length}`
      );
    }

    // Format proof as hex string
    const proofHex = `0x${Array.from(proof)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}` as `0x${string}`;

    // Format publicInputs as bytes32[] - ensure each is 64 hex chars (32 bytes)
    const publicInputsBytes32 = publicInputs.map((input) => {
      // Remove 0x prefix if present
      const cleaned = input.startsWith('0x') ? input.slice(2) : input;
      // Pad to 64 chars (32 bytes)
      const padded = cleaned.padStart(64, '0');
      return `0x${padded}` as `0x${string}`;
    });

    console.log('Minting NFT with proof:', {
      nftAddress,
      proofLength: proof.length,
      publicInputsLength: publicInputs.length,
      moveCount,
      chainId: chain.id,
      chainName: chain.name,
    });

    await writeContract({
      address: nftAddress,
      abi: MazeKingNFTAbi,
      functionName: 'mintWithProof',
      args: [proofHex, publicInputsBytes32, moveCount],
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
