/**
 * Public-network contract addresses (Sepolia, mainnet, etc.).
 *
 * This file is intentionally tracked in git so that statichost.eu's build
 * picks up the live addresses. `just deploy-sepolia` overwrites it via
 * `scripts/generate-contracts-config.js`; commit the diff after redeploying.
 *
 * Local anvil (chainId 31337) addresses live in the gitignored sibling file
 * `contracts.local.ts`, written by `just deploy-local`. The loader in
 * `contracts.ts` merges both so consumers see a single map.
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
