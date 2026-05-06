#!/usr/bin/env bash
# Self-test for scripts/check-consensus-critical.js.
#
# Confirms the gate fires when:
#   1. A registered file's CONSENSUS-CRITICAL marker is removed.
# (Change-ack mode is exercised live by CI on real branches, since it depends
# on git diff vs origin/main and the actual commit graph. Mocking the diff
# here would require a transient branch + commit churn that's not worth the
# complexity for a regression guard.)
#
# Mutations are applied to a copy on disk; originals are restored via trap.
#
# Bead: ma-5yi.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/frontend/src/lib/mazeGenerator.ts"
CHECK="$ROOT/scripts/check-consensus-critical.js"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ ! -f "$TARGET" ]; then
    echo -e "${RED}[test]${NC} target file not found: $TARGET"
    exit 1
fi

TARGET_BAK=$(mktemp)
cp "$TARGET" "$TARGET_BAK"

restore() {
    cp "$TARGET_BAK" "$TARGET"
    rm -f "$TARGET_BAK"
}
trap restore EXIT

# Disable the change-ack check by faking the base ref to HEAD itself, so the
# diff is empty regardless of what branch we're on. This isolates the test to
# marker-presence behavior.
export CONSENSUS_BASE_REF="HEAD"

fail=0

run_case() {
    local desc="$1"
    local expected_exit="$2"
    echo -e "${YELLOW}[test]${NC} $desc"
    set +e
    node "$CHECK" >/tmp/consensus-out 2>&1
    local actual=$?
    set -e
    if [ "$actual" -ne "$expected_exit" ]; then
        echo -e "${RED}[FAIL]${NC} expected exit $expected_exit, got $actual"
        echo "--- output ---"
        cat /tmp/consensus-out
        echo "--------------"
        fail=1
    else
        echo -e "${GREEN}[PASS]${NC}"
    fi
}

# Baseline: clean tree should pass (marker present, no diff vs HEAD).
run_case "baseline (marker present, no diff vs HEAD)" 0

# Case 1: strip every CONSENSUS-CRITICAL marker from the target file.
sed -i 's/CONSENSUS-CRITICAL/CC-REDACTED/g' "$TARGET"
run_case "marker removed from registered file → gate fires" 1

# Restore for the next case.
cp "$TARGET_BAK" "$TARGET"

# Case 2: clean restore, baseline again.
run_case "after restore, baseline passes" 0

if [ "$fail" -eq 0 ]; then
    echo -e "${GREEN}[test]${NC} all consensus-critical self-tests passed ✓"
    exit 0
else
    echo -e "${RED}[test]${NC} one or more cases failed"
    exit 1
fi
