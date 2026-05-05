#!/usr/bin/env bash
# Redeploy the on-chain SVG renderer and rehook the NFT contract.
#
# The MazeRenderer contract is read by MazeKingNFT via a stored renderer
# pointer. Whenever the SVG generation algo changes (see ma-e7r), the renderer
# must be redeployed AND the NFT contract repointed at the new address.
#
# Usage: scripts/redeploy-svg.sh <env>
#   env: "local"   → anvil chainId 31337
#        "sepolia" → Sepolia testnet chainId 11155111
#
# Required env vars (sepolia only):
#   SEPOLIA_RPC_URL, PRIVATE_KEY
#
# See bead ma-96n for context.

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
            echo "Error: SEPOLIA_RPC_URL not set" >&2
            exit 1
        fi
        if [ -z "${PRIVATE_KEY:-}" ]; then
            echo "Error: PRIVATE_KEY not set" >&2
            exit 1
        fi
        RPC_URL="$SEPOLIA_RPC_URL"
        REQUIRE_CONFIRM=1
        ;;
    "")
        cat >&2 <<EOF
Error: missing environment.

Usage: just redeploy-svg-local      # anvil chainId 31337
       just redeploy-svg-sepolia    # Sepolia chainId 11155111

The bare 'just redeploy-svg' recipe is a guard that prints this message —
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
log() { printf "${1}[redeploy-svg]${NC} %s\n" "$2"; }

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

# ---------------------------------------------------------------------------
# Capture current state
# ---------------------------------------------------------------------------

log "$BLUE" "Environment: $ENV (chain $CHAIN_ID)"
log "$BLUE" "NFT contract: $NFT_ADDRESS"

OLD_RENDERER=$(cast call "$NFT_ADDRESS" "renderer()(address)" --rpc-url "$RPC_URL")
log "$BLUE" "Current renderer: $OLD_RENDERER"

# ---------------------------------------------------------------------------
# Build + deploy the new renderer
# ---------------------------------------------------------------------------

log "$YELLOW" "Building contracts..."
(cd "$CONTRACTS_DIR" && forge build >/dev/null)

log "$YELLOW" "Deploying MazeRenderer..."
DEPLOY_OUT=$(cd "$CONTRACTS_DIR" && forge create \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --broadcast \
    --json \
    src/MazeRenderer.sol:MazeRenderer)

NEW_RENDERER=$(echo "$DEPLOY_OUT" | jq -er '.deployedTo')
DEPLOY_TX=$(echo "$DEPLOY_OUT" | jq -er '.transactionHash')
log "$GREEN" "MazeRenderer deployed at $NEW_RENDERER (tx $DEPLOY_TX)"

# ---------------------------------------------------------------------------
# ABI sanity check before we rehook.
#
# IMazeRenderer.tokenURI(uint256, bytes) is the only function the NFT calls.
# We probe it with empty bytes; the renderer's _decodeHeader requires
# layout.length >= 20 so a correctly-deployed contract should revert with
# "Layout too short". Any other failure mode (selector miss, no return data,
# different revert reason) means the deployed contract isn't what we expect.
# ---------------------------------------------------------------------------

log "$YELLOW" "Verifying renderer ABI matches NFT expectations..."
PROBE_OUT=$(cast call "$NEW_RENDERER" "tokenURI(uint256,bytes)(string)" 0 0x \
    --rpc-url "$RPC_URL" 2>&1 || true)
if ! echo "$PROBE_OUT" | grep -q "Layout too short"; then
    log "$RED" "Renderer ABI probe failed. Expected revert 'Layout too short', got:"
    echo "$PROBE_OUT" >&2
    log "$RED" "Aborting before rehook — the deployed contract does not match"
    log "$RED" "the IMazeRenderer interface the NFT calls into."
    exit 1
fi
log "$GREEN" "Renderer ABI probe OK (revert reason matches)."

# ---------------------------------------------------------------------------
# Confirm before rehooking on a non-anvil chain
# ---------------------------------------------------------------------------

if [ "$REQUIRE_CONFIRM" = "1" ]; then
    echo ""
    log "$YELLOW" "About to rehook NFT contract on chain $CHAIN_ID:"
    log "$YELLOW" "  NFT:          $NFT_ADDRESS"
    log "$YELLOW" "  Old renderer: $OLD_RENDERER"
    log "$YELLOW" "  New renderer: $NEW_RENDERER"
    echo ""
    read -r -p "Type 'yes' to broadcast setRenderer: " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        log "$RED" "Aborted by operator. New renderer is deployed but NFT still points at $OLD_RENDERER."
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# Rehook
# ---------------------------------------------------------------------------

log "$YELLOW" "Calling setRenderer on NFT contract..."
REHOOK_JSON=$(cast send "$NFT_ADDRESS" "setRenderer(address)" "$NEW_RENDERER" \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --json)

REHOOK_TX=$(echo "$REHOOK_JSON" | jq -er '.transactionHash')
GAS_USED=$(echo "$REHOOK_JSON" | jq -er '.gasUsed')
# gasUsed is hex-encoded in cast --json output; normalise to decimal.
GAS_USED_DEC=$(printf "%d" "$GAS_USED")
log "$GREEN" "Rehook tx: $REHOOK_TX (gas used: $GAS_USED_DEC)"

# Confirm the on-chain pointer actually updated.
ON_CHAIN_AFTER=$(cast call "$NFT_ADDRESS" "renderer()(address)" --rpc-url "$RPC_URL")
if [ "${ON_CHAIN_AFTER,,}" != "${NEW_RENDERER,,}" ]; then
    log "$RED" "Post-rehook check failed: NFT still reports renderer=$ON_CHAIN_AFTER"
    exit 1
fi

# ---------------------------------------------------------------------------
# Update deployment file + regenerate frontend config
# ---------------------------------------------------------------------------

log "$YELLOW" "Updating $DEPLOYMENT_FILE with new renderer address..."
TMP_FILE=$(mktemp)
jq --arg r "$NEW_RENDERER" --argjson ts "$(date +%s)" \
    '.renderer = $r | .timestamp = $ts' \
    "$DEPLOYMENT_FILE" > "$TMP_FILE"
mv "$TMP_FILE" "$DEPLOYMENT_FILE"

# Mirror to latest.json if it currently tracks this chain (Deploy.s.sol writes
# both files in lockstep; we preserve that invariant here).
if [ -f "$LATEST_FILE" ] && \
   [ "$(jq -er '.chainId' "$LATEST_FILE" 2>/dev/null || echo)" = "$CHAIN_ID" ]; then
    cp "$DEPLOYMENT_FILE" "$LATEST_FILE"
fi

log "$YELLOW" "Regenerating frontend contracts config..."
node "$PROJECT_ROOT/scripts/generate-contracts-config.js" "$CHAIN_ID"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
log "$GREEN" "=== Redeploy summary ==="
echo "  Environment:    $ENV (chain $CHAIN_ID)"
echo "  NFT contract:   $NFT_ADDRESS"
echo "  Old renderer:   $OLD_RENDERER"
echo "  New renderer:   $NEW_RENDERER"
echo "  Deploy tx:      $DEPLOY_TX"
echo "  Rehook tx:      $REHOOK_TX"
echo "  Rehook gas:     $GAS_USED_DEC"
echo ""
log "$GREEN" "Done. Frontend config regenerated — commit the diff if running on a public network."
