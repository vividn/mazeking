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
  { nft: `0x${string}`; verifier: `0x${string}`; renderer?: `0x${string}`; badgeAwarder?: `0x${string}` }
> = {
  11155111: {
    nft: '0xB67910B9B686f69b57260ADe0B143d51a2880320',
    verifier: '0x72F953D926232cFA0CDa25ea62630dAf4BDe4225',
    renderer: '0x557359E8790c8Bb7162fE7A6B93afb1a8da3Ae39',
    badgeAwarder: '0xa7e9aD9bF6708B43329D39e0D0127E127426674C',
  },
};
