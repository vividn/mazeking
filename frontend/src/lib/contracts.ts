/**
 * Contract addresses by chain ID
 * Update these after deploying contracts
 */
export const CONTRACTS = {
  31337: {
    // localhost (Anvil)
    nft: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512', // UPDATE after deployment
    verifier: '0x5FbDB2315678afecb367f032d93F642f64180aa3', // UPDATE after deployment
  },
  11155111: {
    // Sepolia testnet
    nft: '0x0000000000000000000000000000000000000000', // UPDATE after deployment
    verifier: '0x0000000000000000000000000000000000000000', // UPDATE after deployment
  },
} as const;

export type SupportedChainId = keyof typeof CONTRACTS;
export type ContractType = 'nft' | 'verifier';

/**
 * Get contract address for a given chain and contract type
 * @param chainId - Chain ID (31337 for localhost, 11155111 for Sepolia)
 * @param contract - Contract type ('nft' or 'verifier')
 * @returns Contract address or undefined if not found
 */
export function getContractAddress(
  chainId: number,
  contract: ContractType
): `0x${string}` | undefined {
  const addresses = CONTRACTS[chainId as SupportedChainId];
  if (!addresses) return undefined;

  const address = addresses[contract];
  // Check if address is not the zero address
  if (address === '0x0000000000000000000000000000000000000000') {
    console.warn(
      `Contract ${contract} not deployed on chain ${chainId}. Please deploy and update contracts.ts`
    );
    return undefined;
  }

  return address as `0x${string}`;
}

/**
 * Check if contracts are deployed on a given chain
 * @param chainId - Chain ID to check
 * @returns True if both NFT and verifier are deployed
 */
export function areContractsDeployed(chainId: number): boolean {
  const nft = getContractAddress(chainId, 'nft');
  const verifier = getContractAddress(chainId, 'verifier');
  return !!nft && !!verifier;
}
