#!/bin/bash
# Generate Solidity verifier from Noir circuit using Barretenberg (bb)
#
# IMPORTANT: bb CLI version must match @aztec/bb.js version in frontend!
# Check frontend/package.json for the bb.js version and install matching bb CLI.
#
# Prerequisites:
# - nargo 1.0.0-beta.17+ (https://noir-lang.org/docs/getting_started/installation)
# - bb CLI 2.x (must match @aztec/bb.js version in frontend)
#   Install: curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/install | bash && bbup
#
# Usage: ./scripts/generate-verifier.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$CONTRACTS_DIR")"
MAZE_PROVER_DIR="$PROJECT_ROOT/maze_prover"
OUTPUT_DIR="$CONTRACTS_DIR/src/generated"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}[verifier-gen]${NC} Starting Solidity verifier generation..."

# Check for required tools
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}[verifier-gen]${NC} Error: $1 is not installed or not in PATH"
        echo "Please install $1 first."
        exit 1
    fi
}

# Check for nargo
NARGO_PATH="${NARGO_PATH:-$HOME/.nargo/bin/nargo}"
if [ ! -f "$NARGO_PATH" ]; then
    NARGO_PATH=$(which nargo 2>/dev/null || true)
fi
if [ -z "$NARGO_PATH" ] || [ ! -f "$NARGO_PATH" ]; then
    echo -e "${RED}[verifier-gen]${NC} Error: nargo not found"
    echo "Install with: curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash && noirup"
    exit 1
fi
echo -e "${GREEN}[verifier-gen]${NC} Found nargo at: $NARGO_PATH"

# Check for bb
BB_PATH="${BB_PATH:-$HOME/.bb/bb}"
if [ ! -f "$BB_PATH" ]; then
    BB_PATH=$(which bb 2>/dev/null || true)
fi
if [ -z "$BB_PATH" ] || [ ! -f "$BB_PATH" ]; then
    echo -e "${RED}[verifier-gen]${NC} Error: bb not found"
    echo "Install with: curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/install | bash && bbup"
    echo "IMPORTANT: bb CLI version must match @aztec/bb.js version in frontend/package.json"
    exit 1
fi
echo -e "${GREEN}[verifier-gen]${NC} Found bb at: $BB_PATH"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Step 1: Compile Noir circuit (if not already compiled)
echo -e "${YELLOW}[verifier-gen]${NC} Compiling Noir circuit..."
cd "$MAZE_PROVER_DIR"
"$NARGO_PATH" compile
echo -e "${GREEN}[verifier-gen]${NC} Compilation complete"

# Step 2: Generate verification key
CIRCUIT_JSON="$MAZE_PROVER_DIR/target/maze_prover.json"
TARGET_PATH="$MAZE_PROVER_DIR/target"
VK_PATH="$TARGET_PATH/vk"

if [ ! -f "$CIRCUIT_JSON" ]; then
    echo -e "${RED}[verifier-gen]${NC} Error: Circuit JSON not found at $CIRCUIT_JSON"
    exit 1
fi

echo -e "${YELLOW}[verifier-gen]${NC} Generating verification key..."
"$BB_PATH" write_vk -b "$CIRCUIT_JSON" -o "$TARGET_PATH" --oracle_hash keccak --scheme ultra_honk
echo -e "${GREEN}[verifier-gen]${NC} Verification key generated"

# Step 3: Generate Solidity verifier
VERIFIER_SOL="$OUTPUT_DIR/MazeVerifier.sol"

echo -e "${YELLOW}[verifier-gen]${NC} Generating Solidity verifier..."
"$BB_PATH" write_solidity_verifier -k "$VK_PATH" -o "$VERIFIER_SOL"
echo -e "${GREEN}[verifier-gen]${NC} Solidity verifier generated at: $VERIFIER_SOL"

# Step 4: Fix up the generated contract (if needed)
# The generated contract might need license identifier and pragma adjustments
if [ -f "$VERIFIER_SOL" ]; then
    # Check if SPDX identifier exists, add if missing
    if ! grep -q "SPDX-License-Identifier" "$VERIFIER_SOL"; then
        sed -i '1s/^/\/\/ SPDX-License-Identifier: MIT\n/' "$VERIFIER_SOL"
    fi
    echo -e "${GREEN}[verifier-gen]${NC} Verifier contract ready"
fi

echo -e "${GREEN}[verifier-gen]${NC} Done! Generated files:"
echo "  - $VK_PATH (verification key)"
echo "  - $VERIFIER_SOL (Solidity verifier)"
