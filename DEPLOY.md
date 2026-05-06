# Deploying MazeKing

This document describes how to deploy the MazeKing contracts to Sepolia and
push the matching frontend build to statichost.eu.

## Contents

- [Secrets](#secrets) — where the deployer key lives, how `with-sepolia.sh`
  feeds it to recipes
- [Decision matrix](#decision-matrix) — pick the right recipe for the change
  you're shipping
- [Recipes](#recipes) — what each command does and how to invoke it
- [Frontend deploy (statichost.eu)](#frontend-deploy-statichosteu) — the
  build env-var dance
- [Smoke tests](#smoke-tests) — what to run after each upgrade
- [Files written](#files-written) — what to commit, what's gitignored

## Secrets

All Sepolia deploys read secrets from a single env file the operator owns:

```
~/.config/gt-mazeking/sepolia.env
```

**Required permissions:** `chmod 600 ~/.config/gt-mazeking/sepolia.env`.
The wrapper script does NOT enforce mode bits — that's on the operator.

**Required keys:**

| Key | Purpose |
|---|---|
| `SEPOLIA_DEPLOYER_KEY` | Hex private key (with `0x` prefix) that owns MazeKingNFT on Sepolia. Must hold the `OWNER_ROLE` so it can call `setVerifier`/`setRenderer`/`setBadgeAwarder`. |
| `ALCHEMY_API_KEY` | Alchemy API key. Used to compose `SEPOLIA_RPC_URL` if not already set. |

**Optional keys:**

| Key | Purpose |
|---|---|
| `SEPOLIA_RPC_URL` | Override the Alchemy URL composed from `ALCHEMY_API_KEY`. Useful for Infura / self-hosted endpoints. |

**Example file:**

```bash
# ~/.config/gt-mazeking/sepolia.env  (chmod 600)
SEPOLIA_DEPLOYER_KEY=0xYOUR_64_HEX_CHARS
ALCHEMY_API_KEY=YOUR_ALCHEMY_KEY
# SEPOLIA_RPC_URL=https://...    # optional override
```

### The wrapper

`scripts/with-sepolia.sh` is the single load-bearing entry point for any
recipe that should hit Sepolia. It reads the env file, asserts the required
keys exist (failing loud if they don't), exports `PRIVATE_KEY` and
`SEPOLIA_RPC_URL` into the child env, and `exec`s the command you pass.

Recipes never reference the env file path directly — they only read
`PRIVATE_KEY` and `SEPOLIA_RPC_URL` from the env. This means:

- The wrapper can be replaced with any other secrets loader (1Password, AWS
  KMS, GitHub Actions secrets) without touching the recipes.
- Local testing against anvil uses the same recipes with neither env var set
  (the `*-local` variants supply Anvil's well-known account 0 key inline).

**Usage:**

```bash
./scripts/with-sepolia.sh just upgrade-renderer-sepolia
./scripts/with-sepolia.sh just upgrade-verifier-sepolia
./scripts/with-sepolia.sh just upgrade-awarder-sepolia
./scripts/with-sepolia.sh just deploy-sepolia
```

## Decision matrix

Pick the smallest recipe that covers your change. Full re-deploys reset
on-chain state (badges, optimal-moves registrations, registrar approvals);
side-contract upgrades preserve it.

| What changed in your code | Recipe |
|---|---|
| Circuit ABI / public inputs (`maze_prover/src/main.nr`) | `upgrade-verifier-sepolia` |
| New circuit constants (proof size, log-N, etc.) — i.e. `bb.js` writes a different VK | `upgrade-verifier-sepolia` |
| SVG decoder / on-chain renderer (`MazeRenderer.sol`) | `upgrade-renderer-sepolia` |
| Badge thresholds / new badge bits / new awarder strategy (`DefaultBadgeAwarder.sol`, `IBadgeAwarder.sol`) | `upgrade-awarder-sepolia` |
| MazeKingNFT itself (storage layout, mint flow, role model) | `deploy-sepolia` (full) |
| `MazeConstants.sol` library values | depends on which contracts inline them — usually `deploy-sepolia` (safest) |
| Frontend only (no `.sol` / `.nr` change) | None — just push the frontend (see [statichost](#frontend-deploy-statichosteu)) |

**When in doubt, do a full `deploy-sepolia`.** The upgrade recipes are the
exception that proves the rule — only use them when you're sure no other
contract's storage or interface depends on the changed file.

## Recipes

All side-contract upgrades follow the same pattern:

1. Read the existing deployment from `contracts/deployments/<chainId>.json`.
2. Verify chain ID matches the RPC.
3. Build (and for verifier, regenerate from circuit).
4. Deploy the side contract.
5. Run an ABI sanity probe against the new deployment.
6. Confirm with the operator (Sepolia only).
7. Call the matching `setX(newAddress)` on MazeKingNFT.
8. Read back the on-chain pointer to confirm the rehook.
9. Update the deployment JSON and regenerate the frontend address map.

### `just upgrade-renderer-{local,sepolia}`

Deploys `MazeRenderer.sol`, calls `setRenderer(newAddress)`, probes the new
contract via `tokenURI(0, 0x)` (expects revert `Layout too short`).

Aliased from `redeploy-svg-{local,sepolia}` for backwards compatibility.

### `just upgrade-verifier-{local,sepolia}`

Regenerates `src/generated/MazeVerifier.sol` from the circuit (via
`just generate-verifier`), deploys it, calls `setVerifier(newAddress)`,
probes via `verify(0x, [])` (expects revert `ProofLengthWrongWithLogN`).

The regenerate step keeps on-chain VK in lockstep with circuit source —
forgetting it was the root cause of the ma-6ff stale-verifier incident.

### `just upgrade-awarder-{local,sepolia}`

Deploys `DefaultBadgeAwarder.sol` (constructor takes the existing NFT
address), calls `setBadgeAwarder(newAddress)`, probes via `nft()` getter
(expects the existing NFT address, confirming the constructor wired correctly).

## Frontend deploy (statichost.eu)

The frontend is hosted at https://mazeking.io via statichost.eu. It builds
from `main` on push.

### Required env vars

Set these in the **statichost.eu dashboard** (Build environment / Env vars) —
NOT as GitHub secrets. There is no CI workflow involved.

| Var | Why |
|---|---|
| `VITE_SEPOLIA_RPC_URL` | A dedicated Sepolia RPC URL with a real API key. **Do not** rely on the default fallback — the public endpoint at `ethereum-sepolia-rpc.publicnode.com` is rate-limited and Alchemy's `demo` key blocks browser CORS (this caused the ma-jr9 outage). |

The build will boot without `VITE_SEPOLIA_RPC_URL` and log a console error
in production — gameplay still works against the public RPC, but mints get
flaky under load. Always set it.

### After a contract change

After `just upgrade-*-sepolia` (or `just deploy-sepolia`), the frontend's
`src/lib/contracts.generated.ts` will have new addresses. **Commit it:**

```bash
git add frontend/src/lib/contracts.generated.ts
git add frontend/src/lib/abi/*.json   # if the ABI changed
git add contracts/deployments/11155111.json
git commit -m "deploy: <what changed>"
git push
```

statichost.eu will pick up the push and rebuild the frontend with the new
addresses.

## Smoke tests

After every upgrade, before declaring it shipped:

### After `upgrade-renderer-sepolia`

```bash
# Read the new pointer:
cast call <NFT_ADDRESS> "renderer()(address)" --rpc-url $SEPOLIA_RPC_URL

# Decode an existing token URI (replace tokenId with one that's already minted):
cast call <NFT_ADDRESS> "uri(uint256)(string)" <tokenId> --rpc-url $SEPOLIA_RPC_URL
# Should return a `data:application/json;base64,...` URI; pipe through:
#   | sed 's/.*base64,//' | base64 -d
# to inspect the JSON payload.
```

Visual smoke: open https://mazeking.io, navigate to a minted token's gallery
view — the SVG should render.

### After `upgrade-verifier-sepolia`

```bash
# Read the new pointer:
cast call <NFT_ADDRESS> "verifierContract()(address)" --rpc-url $SEPOLIA_RPC_URL

# Verify the new contract has the right shape:
cast call <NEW_VERIFIER> "verify(bytes,bytes32[])(bool)" 0x "[]" --rpc-url $SEPOLIA_RPC_URL
# Expected: revert with ProofLengthWrongWithLogN
```

Functional smoke: solve a maze on https://mazeking.io and click mint. The
proof should verify and the token should mint. If it reverts at the
verifier, the on-chain VK doesn't match the circuit your local prover
produced — re-run `upgrade-verifier-sepolia` (which regenerates from
circuit source).

### After `upgrade-awarder-sepolia`

```bash
# Read the new pointer:
cast call <NFT_ADDRESS> "badgeAwarder()(address)" --rpc-url $SEPOLIA_RPC_URL

# Confirm it points back at the NFT:
cast call <NEW_AWARDER> "nft()(address)" --rpc-url $SEPOLIA_RPC_URL
# Should return <NFT_ADDRESS>.
```

Functional smoke: mint a maze that should earn a registered/medal badge,
then read the user's stats and confirm the bitfield is non-zero.

### After full `deploy-sepolia`

Everything above, plus: confirm `frontend/src/lib/contracts.generated.ts`
was rewritten with the new NFT and verifier addresses, and commit + push so
statichost.eu rebuilds.

## Files written

| Path | Tracked? | Written by |
|---|---|---|
| `contracts/deployments/<chainId>.json` | yes | every deploy / upgrade |
| `contracts/deployments/latest.json` | yes | every deploy / upgrade (mirror of the active chain) |
| `contracts/deployments/31337.json` | no (gitignored) | `deploy-local` and `*-local` upgrades |
| `frontend/src/lib/contracts.generated.ts` | yes | every non-local deploy |
| `frontend/src/lib/contracts.local.ts` | no (gitignored) | local deploys only |
| `frontend/src/lib/abi/*.json` | yes | every deploy (only changes if ABI did) |
| `contracts/src/generated/MazeVerifier.sol` | yes | `generate-verifier` (called by `upgrade-verifier-*` and `deploy-sepolia`) |

After a Sepolia deploy the only mandatory commits are
`contracts/deployments/11155111.json` and
`frontend/src/lib/contracts.generated.ts`. Everything else changes only when
the ABI / circuit / verifier source changed too.
