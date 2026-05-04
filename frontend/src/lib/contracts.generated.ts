/**
 * Public-network contract addresses.
 *
 * Written by `just deploy-sepolia` (and other non-local deploys) via
 * `scripts/generate-contracts-config.js`. Tracked in git so statichost.eu's
 * build picks up the live addresses; commit the diff after redeploying.
 *
 * Local anvil (31337) addresses live in the gitignored sibling
 * `contracts.local.ts`.
 */

export const CONTRACT_ADDRESSES: Record<
  number,
  { nft: `0x${string}`; verifier: `0x${string}` }
> = {
  11155111: {
    nft: '0xa9B0C038ff03d996F57c65dC562F7A30F15ECcDc',
    verifier: '0x520F7Ad9D989cdFA113186d4A40Ab89D135307F4',
  },
};
