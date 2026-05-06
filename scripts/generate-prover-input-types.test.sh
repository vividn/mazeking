#!/usr/bin/env bash
# Self-test for scripts/generate-prover-input-types.js.
#
# Confirms that:
#   1. Regenerating from a clean ABI is idempotent.
#   2. Hand-editing the generated file is reverted by a regen (drift detected).
#   3. Mutating the source ABI changes the generated file (drift detected).
#   4. Restoring everything yields the original byte-identical file.
#
# Bead: ma-7qm. Acceptance criterion: "A test that artificially desyncs the
# generated interface from the circuit ABI confirms the gate fires."
#
# We use raw byte comparison (cmp) rather than git-diff so the test is
# robust to the file's git-tracking state (the verify-prover-input-types
# just-recipe wraps regen in `git diff` for CI; this test exercises the
# underlying detection logic).
#
# Restores all mutated files via trap.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ABI="$ROOT/maze_prover/target/maze_prover.json"
GENERATED="$ROOT/frontend/src/lib/proverInput.generated.ts"
GEN="$ROOT/scripts/generate-prover-input-types.js"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Backup originals; trap to restore on any exit.
ABI_BAK=$(mktemp)
GEN_BAK=$(mktemp)
cp "$ABI" "$ABI_BAK"

# Re-generate once up front to get a reference snapshot, regardless of any
# stale state in the working tree. That snapshot is our "ground truth" for
# all comparisons.
node "$GEN" >/dev/null 2>&1
cp "$GENERATED" "$GEN_BAK"

restore() {
    cp "$ABI_BAK" "$ABI"
    cp "$GEN_BAK" "$GENERATED"
    rm -f "$ABI_BAK" "$GEN_BAK"
}
trap restore EXIT

fail=0

# Returns 0 if regen produces no change vs $GEN_BAK ("in-sync"), 1 otherwise.
# The outer script does not enable `set -e`, so a non-zero return propagates
# back to `run_case` without aborting.
run_detect() {
    node "$GEN" >/dev/null 2>&1 || return $?
    cmp -s "$GENERATED" "$GEN_BAK"
}

run_case() {
    local desc="$1"
    local expected_exit="$2"
    echo -e "${YELLOW}[test]${NC} $desc"
    run_detect
    local actual=$?
    if [ "$actual" -ne "$expected_exit" ]; then
        echo -e "${RED}[FAIL]${NC} expected exit $expected_exit, got $actual"
        fail=1
    else
        echo -e "${GREEN}[ok]${NC} exit $actual"
    fi
}

# --- Baseline: regenerating from clean ABI must match the snapshot. ---
run_case "baseline (in-sync) → exit 0" 0

# --- Case 1: hand-edit the generated file, then run detect. ---
# Detect must regenerate from the ABI (overwriting the hand-edit) and find
# the result matches the snapshot. So this case actually exercises the
# *recovery* path: the next regen wipes the hand-edit, returning to in-sync.
# The CI-side verify-prover-input-types gate catches the hand-edit BEFORE
# regen by running `git diff` after regen — which would see the file
# changing back to its committed (snapshot) form. To exercise *that* logic
# here, we compare the working file to GEN_BAK *before* regen.
echo -e "${YELLOW}[test]${NC} hand-edit generated file → cmp before regen detects drift"
sed -i 's|export interface ProverInputCircuit {|export interface ProverInputCircuit {\n  hand_edited_field: string;|' "$GENERATED"
cmp -s "$GENERATED" "$GEN_BAK"
pre_rc=$?
if [ "$pre_rc" -ne 1 ]; then
    echo -e "${RED}[FAIL]${NC} expected pre-regen cmp to differ (exit 1), got $pre_rc"
    fail=1
else
    echo -e "${GREEN}[ok]${NC} pre-regen cmp differs"
fi
# Now regen and confirm we're back to baseline.
run_case "after regen, hand-edit reverted → exit 0" 0

# --- Case 2: ABI gains a new param. Regen must produce a different file. ---
node -e "
const fs = require('fs');
const j = JSON.parse(fs.readFileSync('$ABI', 'utf8'));
j.abi.parameters.push({
  name: 'extra_field',
  type: { kind: 'integer', sign: 'unsigned', width: 16 },
  visibility: 'private',
});
fs.writeFileSync('$ABI', JSON.stringify(j));
"
run_case "ABI adds extra_field → exit 1 (regenerated file differs)" 1
cp "$ABI_BAK" "$ABI"

# --- Case 3: ABI param renamed; regen must produce a different file. ---
node -e "
const fs = require('fs');
const j = JSON.parse(fs.readFileSync('$ABI', 'utf8'));
const p = j.abi.parameters.find(x => x.name === 'maze_hash');
if (!p) { console.error('expected maze_hash param'); process.exit(2); }
p.name = 'maze_hash_renamed';
fs.writeFileSync('$ABI', JSON.stringify(j));
"
run_case "ABI renames maze_hash → exit 1 (regenerated file differs)" 1
cp "$ABI_BAK" "$ABI"

# --- Case 4: ABI param visibility flipped. ---
node -e "
const fs = require('fs');
const j = JSON.parse(fs.readFileSync('$ABI', 'utf8'));
const p = j.abi.parameters.find(x => x.name === 'width');
if (!p) { console.error('expected width param'); process.exit(2); }
p.visibility = 'public';
fs.writeFileSync('$ABI', JSON.stringify(j));
"
run_case "ABI promotes width to public → exit 1 (regenerated file differs)" 1
cp "$ABI_BAK" "$ABI"

# --- Final: restored ABI yields original snapshot. ---
run_case "post-restore baseline → exit 0" 0

if [ $fail -eq 0 ]; then
    echo -e "${GREEN}[test]${NC} all generate-prover-input-types self-tests passed."
    exit 0
else
    echo -e "${RED}[test]${NC} one or more self-tests failed."
    exit 1
fi
