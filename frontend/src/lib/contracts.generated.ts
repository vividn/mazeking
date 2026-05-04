/**
 * Contract configuration (manually maintained for now).
 *
 * NOTE: this file is intentionally tracked in git so that statichost.eu's
 * build can find it. The `scripts/generate-contracts-config.js` generator
 * may overwrite this file during local `just deploy-local` / `just deploy-sepolia`
 * runs; commit the result if you redeploy.
 *
 * ABIs are NOT inlined here — they live in `frontend/src/lib/abi/*.json` and
 * are imported directly by the consumers that need them.
 */

export const CONTRACT_ADDRESSES: Record<
  number,
  { nft: `0x${string}`; verifier: `0x${string}` }
> = {
  // Sepolia
  11155111: {
    nft: '0xe60b6d8a04a45a34210835830c4cd2dbd6500824',
    verifier: '0xa09528e41b638dfdbd9daa1d1bfe5f34712d39b6',
  },
};

export type ContractType = 'nft' | 'verifier';

/**
 * Get contract address for a given chain and contract type.
 */
export function getContractAddress(
  chainId: number,
  contract: ContractType
): `0x${string}` | undefined {
  return CONTRACT_ADDRESSES[chainId]?.[contract];
}

/**
 * True iff both NFT and verifier are deployed on the given chain.
 */
export function areContractsDeployed(chainId: number): boolean {
  const addrs = CONTRACT_ADDRESSES[chainId];
  return !!addrs?.nft && !!addrs?.verifier;
}
