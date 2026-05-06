#!/usr/bin/env bash
# Upgrade one of the side contracts (renderer, verifier, or awarder) by
# deploying it fresh and rewiring MazeKingNFT to point at the new address.
#
# Modeled on scripts/redeploy-svg.sh (ma-96n). The NFT itself is never
# redeployed by this script — only side contracts. To redeploy MazeKingNFT,
# use `just deploy-sepolia` / `just deploy-local`.
#
# Usage: scripts/upgrade-side-contract.sh <contract> <env>
#   contract: "renderer" | "verifier" | "awarder"
#   env:      "local"   → anvil chainId 31337
#             "sepolia" → Sepolia testnet chainId 11155111
#
# Required env vars (sepolia only):
#   SEPOLIA_RPC_URL, PRIVATE_KEY  (set via scripts/with-sepolia.sh)
#
# Idempotent: each run deploys a fresh contract instance. Re-running just
# overwrites the previous upgrade with another fresh deploy.
#
# See bead ma-e6k.

set -euo pipefail

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------

CONTRACT="${1:-}"
ENV="${2:-}"

usage() {
    cat >&2 <<EOF
Usage: scripts/upgrade-side-contract.sh <contract> <env>

  contract: renderer | verifier | awarder
  env:      local | sepolia

Examples:
  just upgrade-renderer-local
  just upgrade-verifier-sepolia
  ./scripts/with-sepolia.sh just upgrade-awarder-sepolia
EOF
    exit 1
}

case "$CONTRACT" in
    renderer|verifier|awarder) ;;
    *) usage ;;
esac

case "$ENV" in
    local)
        CHAIN_ID="31337"
        RPC_URL="http://127.0.0.1:8545"
        # Anvil's default account #0 — owns the local NFT deploy.
        PRIVATE_KEY="${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
        REQUIRE_CONFIRM=0
        ;;
    sepolia)
        CHAIN_ID="11155111"
        : "${SEPOLIA_RPC_URL:?SEPOLIA_RPC_URL not set (use scripts/with-sepolia.sh)}"
        : "${PRIVATE_KEY:?PRIVATE_KEY not set (use scripts/with-sepolia.sh)}"
        RPC_URL="$SEPOLIA_RPC_URL"
        REQUIRE_CONFIRM=1
        ;;
    *) usage ;;
esac

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACTS_DIR="$PROJECT_ROOT/contracts"
DEPLOYMENTS_DIR="$CONTRACTS_DIR/deployments"
DEPLOYMENT_FILE="$DEPLOYMENTS_DIR/$CHAIN_ID.json"
LATEST_FILE="$DEPLOYMENTS_DIR/latest.json"

# Per-contract knobs. Keep in lockstep with MazeKingNFT.sol setters/getters
# and the deployment-file schema written by Deploy.s.sol.
case "$CONTRACT" in
    renderer)
        CONTRACT_PATH="src/MazeRenderer.sol:MazeRenderer"
        SETTER_SIG="setRenderer(address)"
        GETTER_SIG="renderer()(address)"
        DEPLOY_KEY="renderer"
        CONSTRUCTOR_ARGS=()
        ;;
    verifier)
        CONTRACT_PATH="src/generated/MazeVerifier.sol:HonkVerifier"
        SETTER_SIG="setVerifier(address)"
        # NFT stores it as `verifierContract` (name shadowing avoided).
        GETTER_SIG="verifierContract()(address)"
        DEPLOY_KEY="verifier"
        CONSTRUCTOR_ARGS=()
        ;;
    awarder)
        CONTRACT_PATH="src/DefaultBadgeAwarder.sol:DefaultBadgeAwarder"
        SETTER_SIG="setBadgeAwarder(address)"
        GETTER_SIG="badgeAwarder()(address)"
        DEPLOY_KEY="badgeAwarder"
        # Constructor takes the NFT address; filled in below once we read it.
        CONSTRUCTOR_ARGS=("__NFT_ADDRESS__")
        ;;
esac

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
log() { printf "${1}[upgrade-${CONTRACT}]${NC} %s\n" "$2"; }

# ---------------------------------------------------------------------------
# Preconditions
# ---------------------------------------------------------------------------

if [ ! -f "$DEPLOYMENT_FILE" ]; then
    log "$RED" "No existing deployment for chain $CHAIN_ID at $DEPLOYMENT_FILE"
    log "$RED" "Run 'just deploy-$ENV' first to deploy the full contract set."
    exit 1
fi

NFT_ADDRESS=$(jq -er '.nft' "$DEPLOYMENT_FILE")
if [ -z "$NFT_ADDRESS" ] || [ "$NFT_ADDRESS" = "0x0000000000000000000000000000000000000000" ]; then
    log "$RED" "NFT contract address missing or zero in $DEPLOYMENT_FILE — refusing to proceed."
    exit 1
fi

# Verify chain id matches what the RPC reports — paranoia against pointing
# the wrong PRIVATE_KEY at the wrong network.
ACTUAL_CHAIN=$(cast chain-id --rpc-url "$RPC_URL")
if [ "$ACTUAL_CHAIN" != "$CHAIN_ID" ]; then
    log "$RED" "RPC reports chain $ACTUAL_CHAIN but expected $CHAIN_ID. Aborting."
    exit 1
fi

# Substitute __NFT_ADDRESS__ placeholder (awarder constructor).
for i in "${!CONSTRUCTOR_ARGS[@]}"; do
    if [ "${CONSTRUCTOR_ARGS[$i]}" = "__NFT_ADDRESS__" ]; then
        CONSTRUCTOR_ARGS[$i]="$NFT_ADDRESS"
    fi
done

# ---------------------------------------------------------------------------
# Capture current state
# ---------------------------------------------------------------------------

log "$BLUE" "Environment: $ENV (chain $CHAIN_ID)"
log "$BLUE" "NFT contract: $NFT_ADDRESS"

OLD_ADDRESS=$(cast call "$NFT_ADDRESS" "$GETTER_SIG" --rpc-url "$RPC_URL")
log "$BLUE" "Current $CONTRACT: $OLD_ADDRESS"

# ---------------------------------------------------------------------------
# Build + deploy the new contract
# ---------------------------------------------------------------------------

log "$YELLOW" "Building contracts..."
(cd "$CONTRACTS_DIR" && forge build >/dev/null)

log "$YELLOW" "Deploying $CONTRACT_PATH..."
DEPLOY_CMD=(forge create --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --broadcast --json "$CONTRACT_PATH")
if [ "${#CONSTRUCTOR_ARGS[@]}" -gt 0 ]; then
    DEPLOY_CMD+=(--constructor-args "${CONSTRUCTOR_ARGS[@]}")
fi
DEPLOY_OUT=$(cd "$CONTRACTS_DIR" && "${DEPLOY_CMD[@]}")

NEW_ADDRESS=$(echo "$DEPLOY_OUT" | jq -er '.deployedTo')
DEPLOY_TX=$(echo "$DEPLOY_OUT" | jq -er '.transactionHash')
log "$GREEN" "$CONTRACT deployed at $NEW_ADDRESS (tx $DEPLOY_TX)"

# Sanity: bytecode must exist at the deployed address.
NEW_CODE=$(cast code "$NEW_ADDRESS" --rpc-url "$RPC_URL")
if [ "$NEW_CODE" = "0x" ] || [ -z "$NEW_CODE" ]; then
    log "$RED" "No bytecode at $NEW_ADDRESS after deploy — aborting."
    exit 1
fi

# ---------------------------------------------------------------------------
# Confirm before rewiring on a non-anvil chain
# ---------------------------------------------------------------------------

if [ "$REQUIRE_CONFIRM" = "1" ]; then
    echo ""
    log "$YELLOW" "About to call $SETTER_SIG on chain $CHAIN_ID:"
    log "$YELLOW" "  NFT:           $NFT_ADDRESS"
    log "$YELLOW" "  Old $CONTRACT: $OLD_ADDRESS"
    log "$YELLOW" "  New $CONTRACT: $NEW_ADDRESS"
    echo ""
    read -r -p "Type 'yes' to broadcast: " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        log "$RED" "Aborted by operator. New $CONTRACT is deployed but NFT still points at $OLD_ADDRESS."
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# Rewire
# ---------------------------------------------------------------------------

log "$YELLOW" "Calling $SETTER_SIG on NFT contract..."
REHOOK_JSON=$(cast send "$NFT_ADDRESS" "$SETTER_SIG" "$NEW_ADDRESS" \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --json)

REHOOK_TX=$(echo "$REHOOK_JSON" | jq -er '.transactionHash')
GAS_USED=$(echo "$REHOOK_JSON" | jq -er '.gasUsed')
GAS_USED_DEC=$(printf "%d" "$GAS_USED")
log "$GREEN" "Rehook tx: $REHOOK_TX (gas used: $GAS_USED_DEC)"

# Confirm the on-chain pointer actually updated.
ON_CHAIN_AFTER=$(cast call "$NFT_ADDRESS" "$GETTER_SIG" --rpc-url "$RPC_URL")
if [ "${ON_CHAIN_AFTER,,}" != "${NEW_ADDRESS,,}" ]; then
    log "$RED" "Post-rehook check failed: NFT reports $CONTRACT=$ON_CHAIN_AFTER, expected $NEW_ADDRESS"
    exit 1
fi
log "$GREEN" "On-chain getter confirms: $CONTRACT = $NEW_ADDRESS"

# ---------------------------------------------------------------------------
# Update deployment file + regenerate frontend config
# ---------------------------------------------------------------------------

log "$YELLOW" "Updating $DEPLOYMENT_FILE with new $CONTRACT address..."
TMP_FILE=$(mktemp)
jq --arg key "$DEPLOY_KEY" --arg addr "$NEW_ADDRESS" --argjson ts "$(date +%s)" \
    '.[$key] = $addr | .timestamp = $ts' \
    "$DEPLOYMENT_FILE" > "$TMP_FILE"
mv "$TMP_FILE" "$DEPLOYMENT_FILE"

# Mirror to latest.json if it currently tracks this chain (Deploy.s.sol writes
# both files in lockstep; we preserve that invariant here).
if [ -f "$LATEST_FILE" ] && \
   [ "$(jq -er '.chainId' "$LATEST_FILE" 2>/dev/null || echo)" = "$CHAIN_ID" ]; then
    cp -f "$DEPLOYMENT_FILE" "$LATEST_FILE"
fi

log "$YELLOW" "Regenerating frontend contracts config..."
node "$PROJECT_ROOT/scripts/generate-contracts-config.js" "$CHAIN_ID"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
log "$GREEN" "=== Upgrade summary ($CONTRACT) ==="
echo "  Environment:      $ENV (chain $CHAIN_ID)"
echo "  NFT contract:     $NFT_ADDRESS"
echo "  Old $CONTRACT:    $OLD_ADDRESS"
echo "  New $CONTRACT:    $NEW_ADDRESS"
echo "  Deploy tx:        $DEPLOY_TX"
echo "  Rehook tx:        $REHOOK_TX"
echo "  Rehook gas:       $GAS_USED_DEC"
echo ""
log "$GREEN" "Done. Frontend config regenerated — commit the diff if running on a public network."
