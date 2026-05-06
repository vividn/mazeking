#!/usr/bin/env bash
# Upgrade the on-chain badge awarder and rehook the NFT contract.
#
# The MazeKingNFT contract delegates badge logic to a pluggable awarder
# (badgeAwarder) called once per verified mint. Whenever badge rules change
# (new tier thresholds, new badge bits, new strategy), the awarder must be
# redeployed AND the NFT contract repointed at the new address.
#
# This is one of the three "exception that proves the rule" upgrade recipes
# for side contracts. The full deploy (just deploy-sepolia) is the only path
# that should redeploy MazeKingNFT itself.
#
# Usage: scripts/upgrade-awarder.sh <env>
#   env: "local"   → anvil chainId 31337
#        "sepolia" → Sepolia testnet chainId 11155111
#
# Required env vars (sepolia only):
#   SEPOLIA_RPC_URL, PRIVATE_KEY (set via scripts/with-sepolia.sh)
#
# See bead ma-e6k for context.

set -euo pipefail

# ---------------------------------------------------------------------------
# Args + configuration
# ---------------------------------------------------------------------------

ENV="${1:-}"
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
        if [ -z "${SEPOLIA_RPC_URL:-}" ]; then
            echo "Error: SEPOLIA_RPC_URL not set (did you run via scripts/with-sepolia.sh?)" >&2
            exit 1
        fi
        if [ -z "${PRIVATE_KEY:-}" ]; then
            echo "Error: PRIVATE_KEY not set (did you run via scripts/with-sepolia.sh?)" >&2
            exit 1
        fi
        RPC_URL="$SEPOLIA_RPC_URL"
        REQUIRE_CONFIRM=1
        ;;
    "")
        cat >&2 <<EOF
Error: missing environment.

Usage: just upgrade-awarder-local       # anvil chainId 31337
       just upgrade-awarder-sepolia     # Sepolia chainId 11155111

The bare 'just upgrade-awarder' recipe is a guard that prints this message —
specify an environment explicitly so the operator can't fat-finger Sepolia
when they meant local.
EOF
        exit 1
        ;;
    *)
        echo "Error: unknown environment '$ENV' (expected 'local' or 'sepolia')" >&2
        exit 1
        ;;
esac

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACTS_DIR="$PROJECT_ROOT/contracts"
DEPLOYMENTS_DIR="$CONTRACTS_DIR/deployments"
DEPLOYMENT_FILE="$DEPLOYMENTS_DIR/$CHAIN_ID.json"
LATEST_FILE="$DEPLOYMENTS_DIR/latest.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
log() { printf "${1}[upgrade-awarder]${NC} %s\n" "$2"; }

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

# Verify chain id matches what the RPC reports.
ACTUAL_CHAIN=$(cast chain-id --rpc-url "$RPC_URL")
if [ "$ACTUAL_CHAIN" != "$CHAIN_ID" ]; then
    log "$RED" "RPC reports chain $ACTUAL_CHAIN but expected $CHAIN_ID. Aborting."
    exit 1
fi

# ---------------------------------------------------------------------------
# Capture current state
# ---------------------------------------------------------------------------

log "$BLUE" "Environment: $ENV (chain $CHAIN_ID)"
log "$BLUE" "NFT contract: $NFT_ADDRESS"

OLD_AWARDER=$(cast call "$NFT_ADDRESS" "badgeAwarder()(address)" --rpc-url "$RPC_URL")
log "$BLUE" "Current awarder: $OLD_AWARDER"

# ---------------------------------------------------------------------------
# Build + deploy the new awarder
#
# DefaultBadgeAwarder takes the NFT address as a constructor arg — it reads
# admin-set state (registrarApproved, optimalMoves, BADGE_* constants) from
# the NFT to compute badge bitfields.
# ---------------------------------------------------------------------------

log "$YELLOW" "Building contracts..."
(cd "$CONTRACTS_DIR" && forge build >/dev/null)

log "$YELLOW" "Deploying DefaultBadgeAwarder..."
# `--constructor-args` is variadic and consumes every following token until
# the next flag, so the <CONTRACT> positional has to come *before* it.
DEPLOY_OUT=$(cd "$CONTRACTS_DIR" && forge create \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --broadcast \
    --json \
    src/DefaultBadgeAwarder.sol:DefaultBadgeAwarder \
    --constructor-args "$NFT_ADDRESS")

NEW_AWARDER=$(echo "$DEPLOY_OUT" | jq -er '.deployedTo')
DEPLOY_TX=$(echo "$DEPLOY_OUT" | jq -er '.transactionHash')
log "$GREEN" "DefaultBadgeAwarder deployed at $NEW_AWARDER (tx $DEPLOY_TX)"

# ---------------------------------------------------------------------------
# ABI sanity check before we rehook.
#
# DefaultBadgeAwarder exposes a public immutable `nft` pointer set in its
# constructor. We read it back and confirm it equals the NFT we just
# deployed against — anything else means the deployed contract isn't a
# DefaultBadgeAwarder, or it was deployed against the wrong NFT.
# ---------------------------------------------------------------------------

log "$YELLOW" "Verifying awarder ABI matches NFT expectations..."
AWARDER_NFT=$(cast call "$NEW_AWARDER" "nft()(address)" --rpc-url "$RPC_URL" 2>&1 || true)
if [ "${AWARDER_NFT,,}" != "${NFT_ADDRESS,,}" ]; then
    log "$RED" "Awarder ABI probe failed: awarder.nft() = $AWARDER_NFT, expected $NFT_ADDRESS"
    log "$RED" "Aborting before rehook — the deployed contract does not match"
    log "$RED" "the IBadgeAwarder shape the NFT calls into, or it was wired to the wrong NFT."
    exit 1
fi
log "$GREEN" "Awarder ABI probe OK (nft pointer matches)."

# ---------------------------------------------------------------------------
# Confirm before rehooking on a non-anvil chain
# ---------------------------------------------------------------------------

if [ "$REQUIRE_CONFIRM" = "1" ]; then
    echo ""
    log "$YELLOW" "About to rehook NFT contract on chain $CHAIN_ID:"
    log "$YELLOW" "  NFT:         $NFT_ADDRESS"
    log "$YELLOW" "  Old awarder: $OLD_AWARDER"
    log "$YELLOW" "  New awarder: $NEW_AWARDER"
    echo ""
    read -r -p "Type 'yes' to broadcast setBadgeAwarder: " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        log "$RED" "Aborted by operator. New awarder is deployed but NFT still points at $OLD_AWARDER."
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# Rehook
# ---------------------------------------------------------------------------

log "$YELLOW" "Calling setBadgeAwarder on NFT contract..."
REHOOK_JSON=$(cast send "$NFT_ADDRESS" "setBadgeAwarder(address)" "$NEW_AWARDER" \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --json)

REHOOK_TX=$(echo "$REHOOK_JSON" | jq -er '.transactionHash')
GAS_USED=$(echo "$REHOOK_JSON" | jq -er '.gasUsed')
GAS_USED_DEC=$(printf "%d" "$GAS_USED")
log "$GREEN" "Rehook tx: $REHOOK_TX (gas used: $GAS_USED_DEC)"

# Confirm the on-chain pointer actually updated.
ON_CHAIN_AFTER=$(cast call "$NFT_ADDRESS" "badgeAwarder()(address)" --rpc-url "$RPC_URL")
if [ "${ON_CHAIN_AFTER,,}" != "${NEW_AWARDER,,}" ]; then
    log "$RED" "Post-rehook check failed: NFT still reports badgeAwarder=$ON_CHAIN_AFTER"
    exit 1
fi

# ---------------------------------------------------------------------------
# Update deployment file + regenerate frontend config
#
# The awarder address isn't currently consumed by the frontend — only the
# NFT, verifier, and renderer addresses are. But we still update the
# deployment JSON for parity with the other side-contract upgrades and so
# operators can audit the live awarder pointer post-deploy.
# ---------------------------------------------------------------------------

log "$YELLOW" "Updating $DEPLOYMENT_FILE with new awarder address..."
TMP_FILE=$(mktemp)
jq --arg a "$NEW_AWARDER" --argjson ts "$(date +%s)" \
    '.badgeAwarder = $a | .timestamp = $ts' \
    "$DEPLOYMENT_FILE" > "$TMP_FILE"
mv -f "$TMP_FILE" "$DEPLOYMENT_FILE"

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
log "$GREEN" "=== Upgrade summary ==="
echo "  Environment:    $ENV (chain $CHAIN_ID)"
echo "  NFT contract:   $NFT_ADDRESS"
echo "  Old awarder:    $OLD_AWARDER"
echo "  New awarder:    $NEW_AWARDER"
echo "  Deploy tx:      $DEPLOY_TX"
echo "  Rehook tx:      $REHOOK_TX"
echo "  Rehook gas:     $GAS_USED_DEC"
echo ""
log "$GREEN" "Done. Frontend config regenerated — commit the diff if running on a public network."
