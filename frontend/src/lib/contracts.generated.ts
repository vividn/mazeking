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
    nft: '0xA84AD3BF7D6f86F4d460f667e048296B21da8A16',
    verifier: '0x56Afe31602BFA0A2cFb5e164cF0775F61c0751aE',
  },
};
