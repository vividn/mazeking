#!/usr/bin/env bash
# Inject Multicall3 runtime bytecode at the canonical address on a running
# Anvil node, so wagmi/viem `multicall3`-based reads work locally.
#
# Real chains (Sepolia, mainnet) already have Multicall3 deployed at this
# address; this helper only matters for local Anvil. Anvil 1.6/1.7 does not
# predeploy Multicall3, so we etch our own copy via `anvil_setCode`.
#
# Bytecode source: contracts/script/Multicall3.sol → forge build →
# out/Multicall3.sol/Multicall3.json `.deployedBytecode.object`. To regenerate:
#   cd contracts && forge build script/Multicall3.sol
#   jq -r '.deployedBytecode.object' out/Multicall3.sol/Multicall3.json \
#     > ../scripts/multicall3.bytecode

set -euo pipefail

RPC_URL="${1:-http://127.0.0.1:8545}"
CANONICAL_ADDR="0xcA11bde05977b3631167028862bE2a173976CA11"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BYTECODE_FILE="${SCRIPT_DIR}/multicall3.bytecode"

if [ ! -f "$BYTECODE_FILE" ]; then
    echo "[multicall3] Error: bytecode file missing at $BYTECODE_FILE" >&2
    exit 1
fi

BYTECODE="$(tr -d '[:space:]' < "$BYTECODE_FILE")"

EXISTING="$(cast code "$CANONICAL_ADDR" --rpc-url "$RPC_URL" 2>/dev/null || echo "")"
if [ -n "$EXISTING" ] && [ "$EXISTING" != "0x" ]; then
    echo "[multicall3] Already deployed at $CANONICAL_ADDR"
    exit 0
fi

echo "[multicall3] Etching at $CANONICAL_ADDR via anvil_setCode..."
cast rpc anvil_setCode "$CANONICAL_ADDR" "$BYTECODE" --rpc-url "$RPC_URL" >/dev/null

VERIFY="$(cast code "$CANONICAL_ADDR" --rpc-url "$RPC_URL")"
if [ -z "$VERIFY" ] || [ "$VERIFY" = "0x" ]; then
    echo "[multicall3] Error: code still empty after anvil_setCode" >&2
    exit 1
fi
echo "[multicall3] Verified ($((${#VERIFY} / 2 - 1)) bytes deployed)"
