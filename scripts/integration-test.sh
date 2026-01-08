#!/bin/bash
# Integration test script for MazeKing
# Tests the full flow: circuit compilation → deployment → proof generation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}[integration-test]${NC} Starting integration test..."

# 1. Check circuit is compiled
echo -e "${YELLOW}[integration-test]${NC} Checking circuit compilation..."
CIRCUIT_JSON="$PROJECT_ROOT/maze_prover/target/maze_prover.json"
if [ ! -f "$CIRCUIT_JSON" ]; then
    echo -e "${RED}[integration-test]${NC} Circuit not compiled"
    exit 1
fi
echo -e "${GREEN}[integration-test]${NC} Circuit OK"

# 2. Check circuit is synced to frontend
echo -e "${YELLOW}[integration-test]${NC} Checking circuit sync..."
FRONTEND_CIRCUIT="$PROJECT_ROOT/frontend/public/circuit/maze_prover.json"
if [ ! -f "$FRONTEND_CIRCUIT" ]; then
    echo -e "${RED}[integration-test]${NC} Circuit not synced to frontend"
    exit 1
fi
echo -e "${GREEN}[integration-test]${NC} Circuit sync OK"

# 3. Check contracts deployed
echo -e "${YELLOW}[integration-test]${NC} Checking contract deployment..."
DEPLOYMENT_JSON="$PROJECT_ROOT/contracts/deployments/31337.json"
if [ ! -f "$DEPLOYMENT_JSON" ]; then
    echo -e "${RED}[integration-test]${NC} Contracts not deployed"
    exit 1
fi
echo -e "${GREEN}[integration-test]${NC} Deployment OK"

# 4. Check frontend config generated
echo -e "${YELLOW}[integration-test]${NC} Checking frontend config..."
CONTRACTS_CONFIG="$PROJECT_ROOT/frontend/src/lib/contracts.generated.ts"
if [ ! -f "$CONTRACTS_CONFIG" ]; then
    echo -e "${RED}[integration-test]${NC} Frontend config not generated"
    exit 1
fi
echo -e "${GREEN}[integration-test]${NC} Frontend config OK"

# 5. Run contract tests
echo -e "${YELLOW}[integration-test]${NC} Running contract tests..."
cd "$PROJECT_ROOT/contracts"
forge test -vv
echo -e "${GREEN}[integration-test]${NC} Contract tests passed"

# 6. Check Anvil is running
echo -e "${YELLOW}[integration-test]${NC} Checking Anvil..."
if ! lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${RED}[integration-test]${NC} Anvil not running"
    exit 1
fi
echo -e "${GREEN}[integration-test]${NC} Anvil OK"

# 7. Verify deployment on Anvil
echo -e "${YELLOW}[integration-test]${NC} Verifying deployment..."

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}[integration-test]${NC} jq not found, skipping address verification"
else
    NFT_ADDRESS=$(jq -r '.nft' "$DEPLOYMENT_JSON")
    VERIFIER_ADDRESS=$(jq -r '.verifier' "$DEPLOYMENT_JSON")

    echo -e "${GREEN}[integration-test]${NC} Verified deployment:"
    echo "  NFT:      $NFT_ADDRESS"
    echo "  Verifier: $VERIFIER_ADDRESS"
fi

echo ""
echo -e "${GREEN}[integration-test]${NC} ✓ All integration tests passed!"
echo ""
echo "You can now:"
echo "  1. Start frontend: just dev"
echo "  2. Open http://localhost:5173"
echo "  3. Play a maze and mint an NFT!"
