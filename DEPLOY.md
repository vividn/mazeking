# Deploy Operations

Operator playbook for the MazeKing on-chain stack. Covers Sepolia secrets, the
redeploy decision matrix, and the statichost.eu env-var dance for the frontend.

For the full cold deploy of all contracts, see `just deploy-sepolia`. This
document focuses on the *standing infrastructure* that lets future deploys go
through without ad-hoc ops work — primarily the side-contract upgrade path
(see bead `ma-e6k`).

## Sepolia secrets

All Sepolia recipes read `PRIVATE_KEY` and `SEPOLIA_RPC_URL` from the env. The
canonical loader is `scripts/with-sepolia.sh`, which sources a single env file
out-of-tree:

```
~/.config/gt-mazeking/sepolia.env
```

Required keys:

| Key                     | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `SEPOLIA_DEPLOYER_KEY`  | Private key of the deployer / NFT owner (hex, 0x…).    |
| `ALCHEMY_API_KEY`       | Alchemy API key — combined with the default RPC URL.   |
| `SEPOLIA_RPC_URL`       | (Optional) Override the full RPC URL.                  |

Setup:

```bash
mkdir -p ~/.config/gt-mazeking
cat > ~/.config/gt-mazeking/sepolia.env <<'EOF'
SEPOLIA_DEPLOYER_KEY=0x...
ALCHEMY_API_KEY=...
EOF
chmod 600 ~/.config/gt-mazeking/sepolia.env
```

`chmod 600` is mandatory — the deployer key controls every contract upgrade.

Usage — the wrapper exports the env vars and execs whatever you give it:

```bash
./scripts/with-sepolia.sh just upgrade-renderer-sepolia
./scripts/with-sepolia.sh just deploy-sepolia
./scripts/with-sepolia.sh forge script script/Deploy.s.sol --rpc-url "$SEPOLIA_RPC_URL" --broadcast
```

The wrapper exits non-zero (with a clear message) if the env file is missing
or any required key is unset. Individual just recipes never reference the env
file path directly — `with-sepolia.sh` is the single load-bearing point.

## Redeploy decision matrix

What changed in your branch determines which recipe to run.

| Source change                                | Recipe                              | Notes                                                                  |
| -------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| `maze_prover/` (Noir circuit)                | `just upgrade-verifier-sepolia`     | Regenerates `MazeVerifier.sol` first; circuit + on-chain VK lockstep.  |
| `contracts/src/MazeRenderer.sol`             | `just upgrade-renderer-sepolia`     | SVG/decoder change only — NFT rehooks via `setRenderer`.               |
| `contracts/src/DefaultBadgeAwarder.sol`      | `just upgrade-awarder-sepolia`      | Badge logic only — NFT rehooks via `setBadgeAwarder`.                  |
| `contracts/src/MazeKingNFT.sol` (storage)    | `just deploy-sepolia` *(full deploy)* | Storage-layout changes are irreversible at this address; redeploy all. |
| `contracts/src/MazeKingNFT.sol` (logic only) | `just deploy-sepolia` *(full deploy)* | NFT itself isn't upgradeable in place — the side contracts are.        |
| Multiple of the above                        | Run upgrades in order, or full deploy | Each upgrade-* recipe is independent and idempotent.                   |

`just deploy-sepolia` is the only recipe that should ever redeploy
`MazeKingNFT` itself — the upgrade-* recipes deliberately don't touch it.
After a full deploy, all three side contracts get fresh addresses too;
upgrade-* is for *delta* changes between full deploys.

The `redeploy-svg-*` recipes (predates ma-e6k) are equivalent to
`upgrade-renderer-*`. Either works; new code should prefer `upgrade-renderer-*`
for consistency with the verifier and awarder paths.

### Local anvil dry-run

Every upgrade recipe has a `-local` variant that runs against anvil
(chainId 31337) using its default account #0. Smoke-test the workflow there
before pointing it at Sepolia:

```bash
just deploy-local                    # one-time: full deploy on anvil
just upgrade-renderer-local          # deploys + rehooks
just upgrade-verifier-local          # regenerates verifier first, then deploys + rehooks
just upgrade-awarder-local           # deploys + rehooks
```

Each recipe asserts the on-chain getter (`renderer()`, `verifierContract()`,
`badgeAwarder()`) returns the new address before exiting non-zero on failure.

### Smoke tests after upgrade

After any Sepolia upgrade, check the live frontend at https://mazeking.io
still mints end-to-end. The frontend reads addresses from
`frontend/src/lib/contracts.generated.ts`, which the upgrade recipes regenerate
automatically — commit and push that diff for statichost.eu's build to pick up
the new addresses.

Quick on-chain sanity (Sepolia):

```bash
export NFT=$(jq -er '.nft' contracts/deployments/11155111.json)
cast call "$NFT" "renderer()(address)"          --rpc-url "$SEPOLIA_RPC_URL"
cast call "$NFT" "verifierContract()(address)"  --rpc-url "$SEPOLIA_RPC_URL"
cast call "$NFT" "badgeAwarder()(address)"      --rpc-url "$SEPOLIA_RPC_URL"
```

These should match the addresses in `contracts/deployments/11155111.json`.

For a full mint smoke test (covered by bead `ma-jdq`), solve a maze in the
deployed frontend and confirm `mintWithProof` succeeds — wallet popup opens,
tx broadcasts, NFT appears in the wallet.

## Frontend (statichost.eu)

The frontend is built and served by statichost.eu. Notable env-var quirk
(per bead `ma-jr9`): build-time env vars are set in **statichost.eu's per-site
dashboard** (Build environment / Env vars), not via GitHub secrets — there is
no CI workflow.

Required statichost build-env vars:

| Key                            | Purpose                                      |
| ------------------------------ | -------------------------------------------- |
| `VITE_RPC_URL_SEPOLIA` *(or equivalent)* | Full RPC URL (Alchemy with real key) for production reads. |

Do **not** rely on a `'demo'` fallback — Alchemy's demo key is CORS-blocked
from non-Alchemy origins, which silently breaks `simulateContract` and the
mint flow (see ma-jr9). The build should fail loud if this var isn't set.

After contract upgrades, push the regenerated `contracts.generated.ts` —
statichost rebuilds on push and picks up the new addresses automatically.

## File map

| Path                                  | Role                                                       |
| ------------------------------------- | ---------------------------------------------------------- |
| `scripts/with-sepolia.sh`             | Sepolia secrets wrapper — `exec "$@"` after loading env.   |
| `scripts/upgrade-side-contract.sh`    | Generic upgrade flow (renderer/verifier/awarder).          |
| `scripts/redeploy-svg.sh`             | Predecessor of upgrade-renderer — kept for compatibility.  |
| `contracts/script/Deploy.s.sol`       | Full cold deploy of the entire stack.                      |
| `contracts/deployments/<chainId>.json`| Authoritative address ledger per chain (gitignored).       |
| `frontend/src/lib/contracts.generated.ts` | Public-network address map for the frontend (committed). |
| `frontend/src/lib/contracts.local.ts` | Anvil address map for the frontend (gitignored).           |
