#!/usr/bin/env bash
# Self-test for scripts/check-abi-drift.js.
#
# Confirms the gate fires on each of the three drift conditions by mutating
# each source of truth in turn. Restores all files via trap.
#
# Bead: ma-3xv. Acceptance criterion: "A test that artificially desyncs ...
# confirms the gate fires."

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CIRCUIT="$ROOT/maze_prover/src/main.nr"
CONSTANTS="$ROOT/contracts/src/MazeConstants.sol"
ZKSER="$ROOT/frontend/src/lib/zkSerialize.ts"
CHECK="$ROOT/scripts/check-abi-drift.js"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Backup originals; trap to restore on any exit.
CIRCUIT_BAK=$(mktemp)
CONSTANTS_BAK=$(mktemp)
ZKSER_BAK=$(mktemp)
cp "$CIRCUIT" "$CIRCUIT_BAK"
cp "$CONSTANTS" "$CONSTANTS_BAK"
cp "$ZKSER" "$ZKSER_BAK"

restore() {
    cp "$CIRCUIT_BAK" "$CIRCUIT"
    cp "$CONSTANTS_BAK" "$CONSTANTS"
    cp "$ZKSER_BAK" "$ZKSER"
    rm -f "$CIRCUIT_BAK" "$CONSTANTS_BAK" "$ZKSER_BAK"
}
trap restore EXIT

fail=0

# Each case: (description, mutation-command, expected exit code).
# We expect exit 1 for each desync case and exit 0 for the baseline.

run_case() {
    local desc="$1"
    local expected_exit="$2"
    echo -e "${YELLOW}[test]${NC} $desc"
    set +e
    node "$CHECK" >/tmp/abi-drift-out 2>&1
    local actual=$?
    set -e
    if [ "$actual" -ne "$expected_exit" ]; then
        echo -e "${RED}[FAIL]${NC} expected exit $expected_exit, got $actual"
        echo "--- output ---"
        cat /tmp/abi-drift-out
        echo "--- end ---"
        fail=1
    else
        echo -e "${GREEN}[ok]${NC} exit $actual"
    fi
}

# --- Baseline: clean state should pass ---
run_case "baseline (in-sync) → exit 0" 0

# --- Case 1: rename circuit param → field missing in TS ---
sed -i 's/\bmaze_hash: pub Field\b/maze_hash_renamed: pub Field/' "$CIRCUIT"
run_case "circuit renames maze_hash → exit 1 (missing in TS)" 1
cp "$CIRCUIT_BAK" "$CIRCUIT"

# --- Case 2: drop a TS key → field missing in TS ---
# Remove the line `goal_x: zkMaze.goalX,` from the return object.
sed -i '/^    goal_x: zkMaze\.goalX,$/d' "$ZKSER"
run_case "TS drops goal_x → exit 1 (missing in TS)" 1
cp "$ZKSER_BAK" "$ZKSER"

# --- Case 3: extra TS key not in circuit ---
# Inject a stray field after move_count in the return object.
sed -i 's|^    move_count: solutionMoves\.length,$|    move_count: solutionMoves.length,\n    extra_field: 0,|' "$ZKSER"
run_case "TS adds extra_field → exit 1 (extra in TS)" 1
cp "$ZKSER_BAK" "$ZKSER"

# --- Case 4: bump PUBLIC_INPUTS_LENGTH → public-count mismatch ---
sed -i 's/PUBLIC_INPUTS_LENGTH = 2;/PUBLIC_INPUTS_LENGTH = 3;/' "$CONSTANTS"
run_case "MazeConstants disagrees on PUBLIC_INPUTS_LENGTH → exit 1" 1
cp "$CONSTANTS_BAK" "$CONSTANTS"

# --- Case 5: add `pub` to a private circuit param → public-count mismatch ---
sed -i 's/^    width: u16,$/    width: pub u16,/' "$CIRCUIT"
run_case "circuit promotes width to pub → exit 1 (public count mismatch)" 1
cp "$CIRCUIT_BAK" "$CIRCUIT"

# --- Final: state is restored, baseline should still pass ---
run_case "post-restore baseline → exit 0" 0

if [ $fail -eq 0 ]; then
    echo -e "${GREEN}[test]${NC} all check-abi-drift self-tests passed."
    exit 0
else
    echo -e "${RED}[test]${NC} one or more self-tests failed."
    exit 1
fi
