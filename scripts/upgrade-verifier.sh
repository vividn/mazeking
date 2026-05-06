#!/usr/bin/env bash
# Upgrade the on-chain Honk verifier and rehook the NFT contract.
#
# The MazeKingNFT contract is read by the verifier via a stored verifier
# pointer (verifierContract). Whenever the circuit ABI changes (new public
# inputs, new constraints, etc.), the verifier must be regenerated AND
# redeployed AND the NFT contract repointed at the new address.
#
# This is one of the three "exception that proves the rule" upgrade recipes
# for side contracts. The full deploy (just deploy-sepolia) is the only path
# that should redeploy MazeKingNFT itself.
#
# Usage: scripts/upgrade-verifier.sh <env>
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

Usage: just upgrade-verifier-local      # anvil chainId 31337
       just upgrade-verifier-sepolia    # Sepolia chainId 11155111

The bare 'just upgrade-verifier' recipe is a guard that prints this message —
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
log() { printf "${1}[upgrade-verifier]${NC} %s\n" "$2"; }

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

OLD_VERIFIER=$(cast call "$NFT_ADDRESS" "verifierContract()(address)" --rpc-url "$RPC_URL")
log "$BLUE" "Current verifier: $OLD_VERIFIER"

# ---------------------------------------------------------------------------
# Regenerate verifier from circuit, then build + deploy
#
# The verifier is auto-generated from the circuit (bb.js writes
# src/generated/MazeVerifier.sol). Regenerating ensures the on-chain VK
# matches the current circuit source — see ma-6ff for the stale-VK incident.
# ---------------------------------------------------------------------------

log "$YELLOW" "Regenerating verifier from circuit..."
(cd "$PROJECT_ROOT" && just generate-verifier)

log "$YELLOW" "Building contracts..."
(cd "$CONTRACTS_DIR" && forge build >/dev/null)

log "$YELLOW" "Deploying HonkVerifier..."
DEPLOY_OUT=$(cd "$CONTRACTS_DIR" && forge create \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --broadcast \
    --json \
    src/generated/MazeVerifier.sol:HonkVerifier)

NEW_VERIFIER=$(echo "$DEPLOY_OUT" | jq -er '.deployedTo')
DEPLOY_TX=$(echo "$DEPLOY_OUT" | jq -er '.transactionHash')
log "$GREEN" "HonkVerifier deployed at $NEW_VERIFIER (tx $DEPLOY_TX)"

# ---------------------------------------------------------------------------
# ABI sanity check before we rehook.
#
# IVerifier.verify(bytes, bytes32[]) is the only function the NFT calls.
# The NFT supplies a 2-element publicInputs array. We probe with empty
# proof + empty publicInputs; HonkVerifier should revert with
# `ProofLengthWrongWithLogN(uint256,uint256,uint256)` (selector 0x59895a53)
# because proof.length != expectedProofSize * 32. Any other failure mode
# (selector miss, no return data, different revert) means the deployed
# contract isn't what we expect.
#
# We match on the selector hex rather than the symbol because cast doesn't
# have the verifier's ABI in scope and only prints the raw selector.
# ---------------------------------------------------------------------------

PROOF_LEN_WRONG_SELECTOR="0x59895a53"

log "$YELLOW" "Verifying verifier ABI matches NFT expectations..."
PROBE_OUT=$(cast call "$NEW_VERIFIER" "verify(bytes,bytes32[])(bool)" 0x "[]" \
    --rpc-url "$RPC_URL" 2>&1 || true)
if ! echo "$PROBE_OUT" | grep -q "$PROOF_LEN_WRONG_SELECTOR"; then
    log "$RED" "Verifier ABI probe failed. Expected revert with selector $PROOF_LEN_WRONG_SELECTOR (ProofLengthWrongWithLogN), got:"
    echo "$PROBE_OUT" >&2
    log "$RED" "Aborting before rehook — the deployed contract does not match"
    log "$RED" "the IVerifier interface the NFT calls into."
    exit 1
fi
log "$GREEN" "Verifier ABI probe OK (revert selector $PROOF_LEN_WRONG_SELECTOR matches ProofLengthWrongWithLogN)."

# ---------------------------------------------------------------------------
# Confirm before rehooking on a non-anvil chain
# ---------------------------------------------------------------------------

if [ "$REQUIRE_CONFIRM" = "1" ]; then
    echo ""
    log "$YELLOW" "About to rehook NFT contract on chain $CHAIN_ID:"
    log "$YELLOW" "  NFT:          $NFT_ADDRESS"
    log "$YELLOW" "  Old verifier: $OLD_VERIFIER"
    log "$YELLOW" "  New verifier: $NEW_VERIFIER"
    echo ""
    read -r -p "Type 'yes' to broadcast setVerifier: " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        log "$RED" "Aborted by operator. New verifier is deployed but NFT still points at $OLD_VERIFIER."
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# Rehook
# ---------------------------------------------------------------------------

log "$YELLOW" "Calling setVerifier on NFT contract..."
REHOOK_JSON=$(cast send "$NFT_ADDRESS" "setVerifier(address)" "$NEW_VERIFIER" \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --json)

REHOOK_TX=$(echo "$REHOOK_JSON" | jq -er '.transactionHash')
GAS_USED=$(echo "$REHOOK_JSON" | jq -er '.gasUsed')
GAS_USED_DEC=$(printf "%d" "$GAS_USED")
log "$GREEN" "Rehook tx: $REHOOK_TX (gas used: $GAS_USED_DEC)"

# Confirm the on-chain pointer actually updated.
ON_CHAIN_AFTER=$(cast call "$NFT_ADDRESS" "verifierContract()(address)" --rpc-url "$RPC_URL")
if [ "${ON_CHAIN_AFTER,,}" != "${NEW_VERIFIER,,}" ]; then
    log "$RED" "Post-rehook check failed: NFT still reports verifierContract=$ON_CHAIN_AFTER"
    exit 1
fi

# ---------------------------------------------------------------------------
# Update deployment file + regenerate frontend config
# ---------------------------------------------------------------------------

log "$YELLOW" "Updating $DEPLOYMENT_FILE with new verifier address..."
TMP_FILE=$(mktemp)
jq --arg v "$NEW_VERIFIER" --argjson ts "$(date +%s)" \
    '.verifier = $v | .timestamp = $ts' \
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
echo "  Old verifier:   $OLD_VERIFIER"
echo "  New verifier:   $NEW_VERIFIER"
echo "  Deploy tx:      $DEPLOY_TX"
echo "  Rehook tx:      $REHOOK_TX"
echo "  Rehook gas:     $GAS_USED_DEC"
echo ""
log "$GREEN" "Done. Frontend config regenerated — commit the diff if running on a public network."
