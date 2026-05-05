# MazeKing Project Justfile
# Unified build system for Noir circuits, Foundry contracts, and React frontend

set shell := ["bash", "-c"]
set dotenv-load := true

# Project paths
project_root := justfile_directory()
maze_prover_dir := project_root / "maze_prover"
contracts_dir := project_root / "contracts"
frontend_dir := project_root / "frontend"
scripts_dir := project_root / "scripts"

# Generated artifacts paths
circuit_target := maze_prover_dir / "target"
circuit_json := circuit_target / "maze_prover.json"
frontend_circuit_dir := frontend_dir / "public/circuit"
frontend_circuit_json := frontend_circuit_dir / "maze_prover.json"
deployments_dir := contracts_dir / "deployments"
frontend_contracts_config := frontend_dir / "src/lib/contracts.generated.ts"

# Network configuration
anvil_port := "8545"
anvil_rpc := "http://127.0.0.1:" + anvil_port

# Tool paths (use from PATH as user specified)
# nargo is only needed for `nargo test` / `nargo fmt`; circuit *build* uses noir_wasm.
nargo := env_var_or_default("NARGO_PATH", "nargo")
forge := env_var_or_default("FORGE_PATH", "forge")
pnpm := env_var_or_default("PNPM_PATH", "pnpm")
node := env_var_or_default("NODE_PATH", "node")
tools_dir := project_root / "tools"

# Colors for output
RED := '\033[0;31m'
GREEN := '\033[0;32m'
YELLOW := '\033[1;33m'
BLUE := '\033[0;34m'
NC := '\033[0m'

# Default target - show help
default:
    @just --list

# === SETUP ===

# Install all dependencies
setup:
    @echo -e "{{BLUE}}[setup]{{NC}} Installing project dependencies..."
    @just _check-tools
    @echo -e "{{YELLOW}}[setup]{{NC}} Installing pnpm workspace dependencies..."
    cd {{project_root}} && {{pnpm}} install
    @echo -e "{{YELLOW}}[setup]{{NC}} Installing contract dependencies..."
    cd {{contracts_dir}} && {{forge}} install
    @echo -e "{{GREEN}}[setup]{{NC}} Setup complete!"

# Check if required tools are installed
_check-tools:
    #!/usr/bin/env bash
    set -euo pipefail
    echo -e "{{YELLOW}}[check]{{NC}} Checking required tools..."

    # Check node (required: WASM build pipeline runs on Node)
    if ! command -v {{node}} &> /dev/null; then
        echo -e "{{RED}}[check]{{NC}} Error: node not found in PATH"
        echo "Install Node.js >= 20 (https://nodejs.org)"
        exit 1
    fi
    echo -e "{{GREEN}}[check]{{NC}} Found node: $({{node}} --version)"

    # Check nargo (optional: only needed for `nargo test` / `nargo fmt`)
    if ! command -v {{nargo}} &> /dev/null; then
        echo -e "{{YELLOW}}[check]{{NC}} nargo not found — circuit build uses noir_wasm, but `nargo test`/`nargo fmt` will be unavailable."
        echo "Install with: curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash && noirup"
    else
        echo -e "{{GREEN}}[check]{{NC}} Found nargo: $({{nargo}} --version)"
    fi

    # Check forge
    if ! command -v {{forge}} &> /dev/null; then
        echo -e "{{RED}}[check]{{NC}} Error: forge not found in PATH"
        echo "Install with: curl -L https://foundry.paradigm.xyz | bash && foundryup"
        exit 1
    fi
    echo -e "{{GREEN}}[check]{{NC}} Found forge: $({{forge}} --version | head -1)"

    # Check pnpm
    if ! command -v {{pnpm}} &> /dev/null; then
        echo -e "{{RED}}[check]{{NC}} Error: pnpm not found in PATH"
        echo "Install with: npm install -g pnpm"
        exit 1
    fi
    echo -e "{{GREEN}}[check]{{NC}} Found pnpm: $({{pnpm}} --version)"

# === CONSTANTS GENERATION ===

# Generate maze constants for all codebases from maze-config.json
generate-constants:
    @echo -e "{{BLUE}}[constants]{{NC}} Generating constants from maze-config.json..."
    node {{scripts_dir}}/generate-maze-constants.js
    @echo -e "{{GREEN}}[constants]{{NC}} Constants generation complete!"

# === CIRCUIT COMPILATION ===

# Compile Noir circuits via noir_wasm and sync to frontend (no native nargo)
compile-circuits:
    @echo -e "{{BLUE}}[circuits]{{NC}} Compiling maze_prover via noir_wasm..."
    {{node}} {{tools_dir}}/generate-verifier.mjs compile
    @echo -e "{{GREEN}}[circuits]{{NC}} Circuit compilation complete!"

_compile-circuit: compile-circuits

# Generate Solidity verifier (compiles circuit + writes MazeVerifier.sol via bb.js)
generate-verifier:
    @echo -e "{{BLUE}}[verifier]{{NC}} Generating verifier (noir_wasm + bb.js, no native deps)..."
    {{node}} {{tools_dir}}/generate-verifier.mjs all
    @echo -e "{{YELLOW}}[verifier]{{NC}} Normalizing with forge fmt..."
    cd {{contracts_dir}} && {{forge}} fmt src/generated/MazeVerifier.sol
    @echo -e "{{GREEN}}[verifier]{{NC}} Verifier generated!"

# === CONTRACT DEPLOYMENT ===

# Deploy contracts locally (starts Anvil if needed).
# Regenerates the Solidity verifier first so on-chain VK matches the
# current circuit source — see ma-6ff for the stale-verifier incident.
deploy-local: _ensure-anvil generate-verifier
    @echo -e "{{BLUE}}[deploy]{{NC}} Deploying to local network..."
    @just _deploy-contracts {{anvil_rpc}} "local"
    @just _generate-frontend-config 31337
    @echo -e "{{GREEN}}[deploy]{{NC}} Local deployment complete!"

# Deploy contracts to Sepolia testnet.
# Regenerates the Solidity verifier first — circuit and on-chain VK MUST
# stay in lockstep (ma-6ff). Skip with `SKIP_VERIFIER_GEN=1` when
# redeploying the same circuit.
deploy-sepolia:
    #!/usr/bin/env bash
    set -euo pipefail

    if [ -z "${SEPOLIA_RPC_URL:-}" ]; then
        echo -e "{{RED}}[deploy]{{NC}} Error: SEPOLIA_RPC_URL not set"
        echo "Set it in .env or export it"
        exit 1
    fi

    if [ -z "${PRIVATE_KEY:-}" ]; then
        echo -e "{{RED}}[deploy]{{NC}} Error: PRIVATE_KEY not set"
        echo "Set it in .env or export it"
        exit 1
    fi

    if [ "${SKIP_VERIFIER_GEN:-0}" != "1" ]; then
        just generate-verifier
    fi

    echo -e "{{BLUE}}[deploy]{{NC}} Deploying to Sepolia testnet..."
    just _deploy-contracts "$SEPOLIA_RPC_URL" "sepolia"
    just _generate-frontend-config 11155111
    echo -e "{{GREEN}}[deploy]{{NC}} Sepolia deployment complete!"

# Internal: Deploy contracts to specified network
_deploy-contracts rpc_url network:
    #!/usr/bin/env bash
    set -euo pipefail
    echo -e "{{YELLOW}}[forge]{{NC}} Deploying contracts to {{network}}..."
    cd {{contracts_dir}}

    # Set default PRIVATE_KEY if using local Anvil
    if [ "{{network}}" = "local" ]; then
        export PRIVATE_KEY="${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
    fi

    {{forge}} script script/Deploy.s.sol \
        --rpc-url {{rpc_url}} \
        --broadcast \
        --legacy

    echo -e "{{GREEN}}[forge]{{NC}} Deployment successful!"

# Internal: Ensure Anvil is running (start if needed)
_ensure-anvil:
    #!/usr/bin/env bash
    set -euo pipefail

    # Check if Anvil is already running
    if lsof -Pi :{{anvil_port}} -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "{{GREEN}}[anvil]{{NC}} Anvil already running on port {{anvil_port}}"
        {{scripts_dir}}/inject-multicall3.sh {{anvil_rpc}}
        exit 0
    fi

    echo -e "{{YELLOW}}[anvil]{{NC}} Starting Anvil on port {{anvil_port}}..."

    # Start Anvil in background
    anvil --port {{anvil_port}} > /tmp/anvil.log 2>&1 &
    ANVIL_PID=$!
    echo $ANVIL_PID > /tmp/anvil.pid

    # Wait for Anvil to be ready
    for i in {1..30}; do
        if lsof -Pi :{{anvil_port}} -sTCP:LISTEN -t >/dev/null 2>&1; then
            echo -e "{{GREEN}}[anvil]{{NC}} Anvil started successfully (PID: $ANVIL_PID)"
            echo -e "{{BLUE}}[anvil]{{NC}} Logs: /tmp/anvil.log"
            {{scripts_dir}}/inject-multicall3.sh {{anvil_rpc}}
            exit 0
        fi
        sleep 0.5
    done

    echo -e "{{RED}}[anvil]{{NC}} Failed to start Anvil"
    exit 1

# Stop Anvil if running
stop-anvil:
    #!/usr/bin/env bash
    if [ -f /tmp/anvil.pid ]; then
        PID=$(cat /tmp/anvil.pid)
        if kill -0 $PID 2>/dev/null; then
            echo -e "{{YELLOW}}[anvil]{{NC}} Stopping Anvil (PID: $PID)..."
            kill $PID
            rm /tmp/anvil.pid
            echo -e "{{GREEN}}[anvil]{{NC}} Anvil stopped"
        else
            echo -e "{{YELLOW}}[anvil]{{NC}} Anvil not running (stale PID file)"
            rm /tmp/anvil.pid
        fi
    else
        echo -e "{{YELLOW}}[anvil]{{NC}} Anvil not running"
    fi

# Internal: Generate TypeScript config file for frontend
_generate-frontend-config chain_id:
    @echo -e "{{YELLOW}}[config]{{NC}} Generating frontend contracts config..."
    node {{scripts_dir}}/generate-contracts-config.js {{chain_id}}
    @echo -e "{{GREEN}}[config]{{NC}} Frontend config generated!"

# === DEVELOPMENT ===

# Start frontend development server
dev:
    @echo -e "{{BLUE}}[dev]{{NC}} Starting frontend dev server..."
    cd {{frontend_dir}} && {{pnpm}} dev

# Start full development environment (Anvil + Frontend)
dev-full:
    @echo -e "{{BLUE}}[dev-full]{{NC}} Starting full development environment..."
    @just _ensure-anvil
    @echo -e "{{YELLOW}}[dev-full]{{NC}} Starting frontend in 2 seconds..."
    @sleep 2
    @just dev

# === TESTING ===

# Run all tests (circuits, contracts, frontend)
test:
    @echo -e "{{BLUE}}[test]{{NC}} Running all tests..."
    @just test-circuits
    @just test-contracts
    @just test-frontend
    @echo -e "{{GREEN}}[test]{{NC}} All tests passed!"

# Run contract tests
test-contracts:
    @echo -e "{{YELLOW}}[test]{{NC}} Running contract tests..."
    cd {{contracts_dir}} && {{forge}} test -vv

# Run frontend tests
test-frontend:
    @echo -e "{{YELLOW}}[test]{{NC}} Running frontend tests..."
    cd {{frontend_dir}} && {{pnpm}} test:run

# Run circuit tests
test-circuits:
    @echo -e "{{YELLOW}}[test]{{NC}} Running circuit tests..."
    cd {{maze_prover_dir}} && {{nargo}} test

# Run the full-tier e2e test (solve → prove → off-chain verify).
# Slow (proof generation): intended for nightly / main-branch CI, not per-PR.
# The fast tier (solve → witness) runs as part of `test-frontend`.
test-e2e-full:
    @echo -e "{{YELLOW}}[test]{{NC}} Running full e2e (solve → prove → verify)..."
    cd {{frontend_dir}} && {{pnpm}} test:e2e-full

# === FORMATTING ===

# Format all code
format:
    @echo -e "{{BLUE}}[format]{{NC}} Formatting all code..."
    @just format-contracts
    @just format-frontend
    @just format-circuits
    @echo -e "{{GREEN}}[format]{{NC}} Formatting complete!"

# Format contract code
format-contracts:
    @echo -e "{{YELLOW}}[format]{{NC}} Formatting Solidity contracts..."
    cd {{contracts_dir}} && {{forge}} fmt

# Format frontend code
format-frontend:
    @echo -e "{{YELLOW}}[format]{{NC}} Formatting TypeScript/React code..."
    cd {{frontend_dir}} && {{pnpm}} exec prettier --write "src/**/*.{ts,tsx,js,jsx,json,css}"

# Format circuit code
format-circuits:
    @echo -e "{{YELLOW}}[format]{{NC}} Formatting Noir circuits..."
    cd {{maze_prover_dir}} && {{nargo}} fmt

# === LINTING ===

# Lint all code
lint:
    @echo -e "{{BLUE}}[lint]{{NC}} Linting all code..."
    @just lint-contracts
    @just lint-frontend
    @echo -e "{{GREEN}}[lint]{{NC}} Linting complete!"

# Lint contract code
lint-contracts:
    @echo -e "{{YELLOW}}[lint]{{NC}} Linting Solidity contracts..."
    cd {{contracts_dir}} && {{forge}} fmt --check

# Lint frontend code
lint-frontend:
    @echo -e "{{YELLOW}}[lint]{{NC}} Linting TypeScript/React code..."
    cd {{frontend_dir}} && {{pnpm}} exec eslint "src/**/*.{ts,tsx}"

# === CLEANING ===

# Clean all build artifacts
clean:
    @echo -e "{{BLUE}}[clean]{{NC}} Cleaning build artifacts..."
    @just clean-circuits
    @just clean-contracts
    @just clean-frontend
    @echo -e "{{GREEN}}[clean]{{NC}} Clean complete!"

# Clean circuit artifacts
clean-circuits:
    @echo -e "{{YELLOW}}[clean]{{NC}} Cleaning circuit artifacts..."
    rm -rf {{circuit_target}}
    rm -rf {{frontend_circuit_dir}}
    @echo -e "{{GREEN}}[clean]{{NC}} Circuit artifacts cleaned"

# Clean contract artifacts
clean-contracts:
    @echo -e "{{YELLOW}}[clean]{{NC}} Cleaning contract artifacts..."
    cd {{contracts_dir}} && {{forge}} clean
    rm -rf {{deployments_dir}}
    @echo -e "{{GREEN}}[clean]{{NC}} Contract artifacts cleaned"

# Clean frontend artifacts
clean-frontend:
    @echo -e "{{YELLOW}}[clean]{{NC}} Cleaning frontend artifacts..."
    rm -rf {{frontend_dir}}/dist
    rm -rf {{frontend_dir}}/node_modules/.vite
    @echo -e "{{GREEN}}[clean]{{NC}} Frontend artifacts cleaned"

# === RESET ===

# Full reset: clean + reinstall dependencies
reset: clean
    @echo -e "{{BLUE}}[reset]{{NC}} Performing full reset..."
    @echo -e "{{YELLOW}}[reset]{{NC}} Removing node_modules..."
    rm -rf {{frontend_dir}}/node_modules
    @echo -e "{{YELLOW}}[reset]{{NC}} Removing contract cache..."
    rm -rf {{contracts_dir}}/cache
    rm -rf {{contracts_dir}}/out
    @just setup
    @echo -e "{{GREEN}}[reset]{{NC}} Reset complete!"

# === LOGS & MONITORING ===

# Show Anvil logs
logs-anvil:
    @if [ -f /tmp/anvil.log ]; then tail -f /tmp/anvil.log; else echo "No Anvil logs found. Start Anvil with: just _ensure-anvil"; fi

# === INTEGRATION TESTING ===

# Run full integration test flow
integration-test: _ensure-anvil
    @echo -e "{{BLUE}}[integration]{{NC}} Running integration test..."
    @just compile-circuits
    @just deploy-local
    @echo -e "{{YELLOW}}[integration]{{NC}} Running end-to-end tests..."
    {{scripts_dir}}/integration-test.sh
    @echo -e "{{GREEN}}[integration]{{NC}} Integration test complete!"

# === BUILD ===

# Build everything for production
build:
    @echo -e "{{BLUE}}[build]{{NC}} Building for production..."
    @just compile-circuits
    @just _build-contracts
    @just _build-frontend
    @echo -e "{{GREEN}}[build]{{NC}} Build complete!"

# Build contracts
_build-contracts:
    @echo -e "{{YELLOW}}[build]{{NC}} Building contracts..."
    cd {{contracts_dir}} && {{forge}} build

# Build frontend
_build-frontend:
    @echo -e "{{YELLOW}}[build]{{NC}} Building frontend..."
    cd {{frontend_dir}} && {{pnpm}} build

# === STATUS ===

# Show project status
status:
    @echo -e "{{BLUE}}[status]{{NC}} Project Status"
    @echo ""
    @just _status-tools
    @echo ""
    @just _status-anvil
    @echo ""
    @just _status-artifacts

# Check tool versions
_status-tools:
    #!/usr/bin/env bash
    echo -e "{{YELLOW}}Tools:{{NC}}"
    echo "  node:   $({{node}} --version 2>/dev/null || echo 'not found')"
    echo "  nargo:  $({{nargo}} --version 2>/dev/null || echo 'not found (optional — only for nargo test/fmt)')"
    echo "  forge:  $({{forge}} --version 2>/dev/null | head -1 || echo 'not found')"
    echo "  pnpm:   $({{pnpm}} --version 2>/dev/null || echo 'not found')"

# Check Anvil status
_status-anvil:
    #!/usr/bin/env bash
    echo -e "{{YELLOW}}Anvil:{{NC}}"
    if lsof -Pi :{{anvil_port}} -sTCP:LISTEN -t >/dev/null 2>&1; then
        if [ -f /tmp/anvil.pid ]; then
            PID=$(cat /tmp/anvil.pid)
            echo -e "  {{GREEN}}Running{{NC}} (PID: $PID, Port: {{anvil_port}})"
        else
            echo -e "  {{GREEN}}Running{{NC}} (Port: {{anvil_port}})"
        fi
    else
        echo -e "  {{RED}}Not running{{NC}}"
    fi

# Check artifact status
_status-artifacts:
    #!/usr/bin/env bash
    echo -e "{{YELLOW}}Artifacts:{{NC}}"

    # Circuit
    if [ -f "{{circuit_json}}" ]; then
        echo -e "  Circuit:    {{GREEN}}✓{{NC}} compiled"
    else
        echo -e "  Circuit:    {{RED}}✗{{NC}} not compiled"
    fi

    # Frontend circuit
    if [ -f "{{frontend_circuit_json}}" ]; then
        echo -e "  Frontend:   {{GREEN}}✓{{NC}} circuit synced"
    else
        echo -e "  Frontend:   {{RED}}✗{{NC}} circuit not synced"
    fi

    # Deployments
    local_deploy="{{deployments_dir}}/31337.json"
    if [ -f "$local_deploy" ]; then
        echo -e "  Local:      {{GREEN}}✓{{NC}} deployed"
    else
        echo -e "  Local:      {{RED}}✗{{NC}} not deployed"
    fi

    sepolia_deploy="{{deployments_dir}}/11155111.json"
    if [ -f "$sepolia_deploy" ]; then
        echo -e "  Sepolia:    {{GREEN}}✓{{NC}} deployed"
    else
        echo -e "  Sepolia:    {{RED}}✗{{NC}} not deployed"
    fi
