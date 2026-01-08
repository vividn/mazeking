#!/bin/bash
# Sync contract ABIs from forge output to frontend

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONTRACTS_OUT="$PROJECT_ROOT/contracts/out"
FRONTEND_ABI_DIR="$PROJECT_ROOT/frontend/src/lib/abi"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}[sync-abis]${NC} Syncing contract ABIs to frontend..."

mkdir -p "$FRONTEND_ABI_DIR"

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed"
    echo "Install with: brew install jq (macOS) or apt-get install jq (Ubuntu)"
    exit 1
fi

# Extract ABIs from forge output
jq '.abi' "$CONTRACTS_OUT/MazeKingNFT.sol/MazeKingNFT.json" > "$FRONTEND_ABI_DIR/MazeKingNFT.json"
jq '.abi' "$CONTRACTS_OUT/MazeVerifier.sol/HonkVerifier.json" > "$FRONTEND_ABI_DIR/MazeVerifier.json"

echo -e "${GREEN}[sync-abis]${NC} ABIs synced to $FRONTEND_ABI_DIR"
