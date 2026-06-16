# Deploying MazeKing

This document describes how to deploy the MazeKing contracts to Sepolia (the
testnet flow) and to the L2 mainnets — **Polygon zkEVM (1101)** and
**Base (8453)** — then push the matching frontend build to statichost.eu.

The Sepolia sections below are the primary day-to-day flow. The
[L2 mainnet runbook](#l2-mainnet-runbook-polygon-zkevm--base) is the production
deploy; it reuses the same recipes/wrappers pattern with chain-specific env
files and adds one production-only step: **[mint-first ordering](#mint-first-ordering-pre-empt-the-render-spoof)**.

## Contents

- [Secrets](#secrets) — where the deployer key lives, how `with-sepolia.sh`
  feeds it to recipes
- [Decision matrix](#decision-matrix) — pick the right recipe for the change
  you're shipping
- [Recipes](#recipes) — what each command does and how to invoke it
- [Frontend deploy (statichost.eu)](#frontend-deploy-statichosteu) — the
  build env-var dance
- [Smoke tests](#smoke-tests) — what to run after each upgrade
- [L2 mainnet runbook (Polygon zkEVM + Base)](#l2-mainnet-runbook-polygon-zkevm--base)
  — production deploy to the two L2s, including mint-first ordering
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

## L2 mainnet runbook (Polygon zkEVM + Base)

Production lives on two L2s. The deploy machinery is the same shape as Sepolia —
a per-chain secrets wrapper `exec`s a `just deploy-*` recipe — only the env file,
RPC, and chain ID differ. **Both chains pay gas in ETH**, so the deployer key
must hold ETH on whichever chain you're deploying to (bridge first).

| Chain | Chain ID | Gas token | Wrapper | Recipe | Default public RPC |
|---|---|---|---|---|---|
| Polygon zkEVM | `1101` | ETH | `scripts/with-polygon-zkevm.sh` | `just deploy-polygon-zkevm` | `https://zkevm-rpc.com` |
| Base | `8453` | ETH | `scripts/with-base.sh` | `just deploy-base` | `https://mainnet.base.org` |

> **As of this writing, the mainnet deploy is NOT live** — Sepolia is the
> conference fallback. This runbook is the procedure for when it does ship.

### Secrets

Each chain reads its own env file the operator owns (`chmod 600`):

```
~/.config/gt-mazeking/base.env
~/.config/gt-mazeking/polygon-zkevm.env
```

**Required key:** `DEPLOYER_KEY` — hex private key (`0x`-prefixed) that owns
`MazeKingNFT` on that chain. It must hold both `OWNER_ROLE` (for
`setVerifier`/`setRenderer`/`setBadgeAwarder`) and `REGISTRAR_ROLE` (for
`registerMaze`/`setRegistered`). The Deploy script grants both to the deployer.

**Optional key:** `RPC_URL` — override the default public RPC with a dedicated
endpoint (recommended for mainnet — public RPCs rate-limit broadcasts).

```bash
# ~/.config/gt-mazeking/base.env  (chmod 600)
DEPLOYER_KEY=0xYOUR_64_HEX_CHARS
# RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY   # optional override
```

The wrappers mirror `with-sepolia.sh`: they source the env file, assert
`DEPLOYER_KEY` is set (failing loud), export `PRIVATE_KEY` plus the
chain-specific RPC var (`BASE_RPC_URL` / `POLYGON_ZKEVM_RPC_URL`), and `exec`
the command. The recipes only read those exported vars, never the file path.

### Order of operations

Run the chains independently — they share nothing on-chain. For each chain:

1. **Bridge ETH** to the deployer address on the target L2 (gas is ETH).
2. **Deploy contracts:**
   ```bash
   ./scripts/with-base.sh just deploy-base
   # or
   ./scripts/with-polygon-zkevm.sh just deploy-polygon-zkevm
   ```
   Each recipe regenerates the verifier from the circuit first (keeps on-chain
   VK in lockstep — ma-6ff; skip with `SKIP_VERIFIER_GEN=1` only when the
   circuit is unchanged), runs `Deploy.s.sol`, writes
   `contracts/deployments/<chainId>.json`, and merges the new chain into
   `frontend/src/lib/contracts.generated.ts` (preserving the other chains —
   see [Files written](#files-written)).
3. **Mint-first ordering** — see the dedicated section below. **Do this before
   the chain is publicized**, while you are the only party minting.
4. **Smoke-test the pointers** with `cast` (below).
5. **Wire and deploy the frontend** (env vars + wagmi chains, below).

### Mint-first ordering (pre-empt the render-spoof)

**This is the load-bearing production-only step.** `MazeKingNFT.mintWithProof`
stores the maze layout on a **first-mint-wins** basis (`layouts[tokenId]`), and
the stored layout bytes are **not bound to the proof's `mazeHash`** on-chain
(ma-bs5 finding #2, "option-alpha"). The proof guarantees the tokenId and
achievement are correct, but the *picture* can be spoofed: an adversary who
front-runs the first mint of a maze writes garbage layout bytes that render
forever. The proper fix (route canonical layout through the registrar / bind it
to `mazeHash`) is tracked in ma-bs5 and is **not** in this deploy.

The operational mitigation at mainnet launch: **the deployer/registrar registers
and mints the official showcase mazes FIRST**, claiming the first-mint slot for
exactly the mazes that matter before anyone else can.

For each showcase maze, in order, before opening the chain to the public:

```bash
# 1. Register the seed → tokenId mapping (REGISTRAR_ROLE):
cast send <NFT_ADDRESS> "registerMaze(string,uint256)" "<seed>" <tokenId> \
  --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY

# 2. Mint it with a real proof so layouts[tokenId] holds the canonical bytes.
#    Generate proof+layout off-chain (the same solve→prove path the dApp uses),
#    then call mintWithProof so this honest mint wins the first-mint slot.
#    Signature: mintWithProof(bytes proof, bytes32 mazeHash, bytes layout, uint16 moveCount)
cast send <NFT_ADDRESS> "mintWithProof(bytes,bytes32,bytes,uint16)" <proof> <mazeHash> <layout> <moveCount> \
  --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY

# 3. Mark it officially registered (REGISTRAR_ROLE):
cast send <NFT_ADDRESS> "setRegistered(uint256,bool)" <tokenId> true \
  --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY
```

Because the layout slot is now occupied with correct bytes, a later front-run
of those mazes is a no-op (`layouts[tokenId].length != 0`). Only do this once
per chain, immediately post-deploy, before publicizing the chain. Mazes minted
normally by the public after launch remain individually spoofable until ma-bs5
lands — mint-first only protects the official showcase set.

### Frontend (multi-chain)

`frontend/src/lib/contracts.generated.ts` is a `Record<chainId, {...}>` — the
deploy recipes merge one entry per chain and preserve the others. After a
mainnet deploy, commit the updated file (and `frontend/src/lib/abi/*.json` if
the ABI changed) so statichost.eu rebuilds with the new addresses.

Two prerequisites for the dApp to actually use a new chain:

1. **wagmi must define the chain and read its RPC env var.** `src/lib/wagmi.ts`
   currently wires only Anvil + Sepolia. Adding Base / Polygon zkEVM (consuming
   `VITE_BASE_RPC_URL` / `VITE_POLYGON_ZKEVM_RPC_URL`) is **deploy-time work
   tracked in ma-27y** — it is intentionally not pre-shipped, because exposing a
   live mainnet chain in the dApp before its contracts exist would break minting
   for users who switch to it.
2. **statichost.eu build env vars** (Build environment / Env vars — NOT GitHub
   secrets; there is no CI workflow):

   | Var | Why |
   |---|---|
   | `VITE_BASE_RPC_URL` | Dedicated Base RPC with a real key. Public `mainnet.base.org` rate-limits and may block browser CORS under load. |
   | `VITE_POLYGON_ZKEVM_RPC_URL` | Dedicated Polygon zkEVM RPC with a real key, same reasoning. |

### Smoke tests (mainnet)

Same shape as the Sepolia smoke tests — read back each side-contract pointer and
confirm it resolves. Use the chain's RPC (`$BASE_RPC_URL` /
`$POLYGON_ZKEVM_RPC_URL`):

```bash
cast call <NFT_ADDRESS> "verifierContract()(address)"  --rpc-url $BASE_RPC_URL
cast call <NFT_ADDRESS> "renderer()(address)"          --rpc-url $BASE_RPC_URL
cast call <NFT_ADDRESS> "badgeAwarder()(address)"      --rpc-url $BASE_RPC_URL

# Confirm the verifier rejects an empty proof (right shape on-chain):
cast call <NEW_VERIFIER> "verify(bytes,bytes32[])(bool)" 0x "[]" --rpc-url $BASE_RPC_URL
#   → revert ProofLengthWrongWithLogN

# Confirm the awarder is wired back to the NFT:
cast call <NEW_AWARDER> "nft()(address)" --rpc-url $BASE_RPC_URL
#   → <NFT_ADDRESS>

# After mint-first: confirm a showcase maze's layout slot is populated:
cast call <NFT_ADDRESS> "layouts(uint256)(bytes)" <tokenId> --rpc-url $BASE_RPC_URL
#   → non-empty bytes (the canonical layout you minted)
```

Functional smoke: once wagmi is wired and the frontend is deployed, switch the
wallet to the chain, solve a maze, and mint — the proof should verify and the
SVG should render.

## Files written

| Path | Tracked? | Written by |
|---|---|---|
| `contracts/deployments/<chainId>.json` | no (gitignored) | every deploy / upgrade — local operator record only |
| `contracts/deployments/latest.json` | no (gitignored) | every deploy / upgrade (mirror of the active chain) |
| `frontend/src/lib/contracts.generated.ts` | yes | every non-local deploy — **merges** the deployed chain, preserving the others |
| `frontend/src/lib/contracts.local.ts` | no (gitignored) | local deploys only |
| `frontend/src/lib/abi/*.json` | yes | every deploy (only changes if ABI did) |
| `contracts/src/generated/MazeVerifier.sol` | yes | `generate-verifier` (called by `upgrade-verifier-*` and the `deploy-*` recipes) |

The entire `contracts/deployments/` directory is gitignored — the address map
the build actually reads is `frontend/src/lib/contracts.generated.ts`, which the
generator derives from the deployment JSON. After any deploy the only mandatory
commit is `frontend/src/lib/contracts.generated.ts` (plus
`frontend/src/lib/abi/*.json` if the ABI changed). Because the generator merges
rather than overwrites, deploying one chain leaves the other chains' entries
intact in the committed file.
