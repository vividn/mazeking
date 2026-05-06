#!/usr/bin/env node
/**
 * Build-time gate: ensure every consensus-critical source file still bears the
 * CONSENSUS-CRITICAL marker, and that any change to one of these files is
 * acknowledged in commit messages with `consensus-critical-change: <bead-id>`.
 *
 * Why this exists: layout constants (e.g. WORDMARK_MARGIN), the pixel font,
 * the seeded RNG, the cell-encoding bit layout, and the canonical layout-byte
 * stream are all inputs to mazeHash, which IS the on-chain tokenID. Bishop
 * tightened WORDMARK_MARGIN three times (ma-kj9, ma-1mv, ma-kwb) chasing
 * visual balance; each change silently changed mint identity for the same
 * seed. See retro 2026-05-05 Appendix C and bead ma-5yi.
 *
 * Two checks:
 *
 *   1. MARKER PRESENCE — every registered file must contain the literal
 *      string `CONSENSUS-CRITICAL`. If someone deletes the banner, the gate
 *      fires (the markers are how future readers learn this is dangerous).
 *
 *   2. CHANGE ACK — if any registered file differs from origin/main, then at
 *      least one commit message between origin/main and HEAD must contain a
 *      `consensus-critical-change:` line (any value: a bead id, "doc-only",
 *      whatever — the goal is forced acknowledgement, not enforcement of
 *      bead format).
 *
 * Bypass: changes that don't touch any registered file pass automatically.
 *
 * Exits 0 on agreement, 1 with a diagnostic on mismatch.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');

// Registry of consensus-critical files. Paths are relative to project root.
// Keep in sync with the CONSENSUS-CRITICAL banner comments in each file.
const REGISTRY = [
  'frontend/src/lib/mazeGenerator.ts',
  'frontend/src/lib/pixelFont.ts',
  'frontend/src/lib/seededRandom.ts',
  'frontend/src/lib/zkSerialize.ts',
  'frontend/src/lib/tokenId.ts',
];

const MARKER = 'CONSENSUS-CRITICAL';
const ACK_TOKEN = 'consensus-critical-change:';
const BASE_REF = process.env.CONSENSUS_BASE_REF || 'origin/main';

const C = {
  RED: '\x1b[0;31m',
  GREEN: '\x1b[0;32m',
  YELLOW: '\x1b[1;33m',
  BLUE: '\x1b[0;34m',
  NC: '\x1b[0m',
};

function log(prefix, color, msg) {
  console.log(`${color}[${prefix}]${C.NC} ${msg}`);
}

function fail(msg) {
  log('consensus', C.RED, msg);
  process.exit(1);
}

// --- Check 1: marker presence -----------------------------------------------

function checkMarkerPresence() {
  const missing = [];
  for (const rel of REGISTRY) {
    const full = path.join(PROJECT_ROOT, rel);
    if (!fs.existsSync(full)) {
      missing.push(`${rel} (file not found)`);
      continue;
    }
    const src = fs.readFileSync(full, 'utf8');
    if (!src.includes(MARKER)) {
      missing.push(rel);
    }
  }
  if (missing.length > 0) {
    log('consensus', C.RED, 'Files missing CONSENSUS-CRITICAL marker:');
    for (const m of missing) console.error(`    - ${m}`);
    log(
      'consensus',
      C.YELLOW,
      'Each registered file must contain the literal string "CONSENSUS-CRITICAL".'
    );
    log(
      'consensus',
      C.YELLOW,
      'If you intentionally removed the marker, also remove the file from the REGISTRY in scripts/check-consensus-critical.js.'
    );
    process.exit(1);
  }
}

// --- Check 2: change-ack on diff vs base ------------------------------------

function gitCheck(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (_e) {
    return null;
  }
}

function baseRefAvailable() {
  return gitCheck(`rev-parse --verify --quiet ${BASE_REF}`) !== null;
}

function changedFilesVsBase() {
  // --diff-filter=ACMR: added, copied, modified, renamed (skip deletions; if
  // someone deleted a registered file, marker-presence already caught it).
  const out = gitCheck(
    `diff --name-only --diff-filter=ACMR ${BASE_REF}...HEAD --`
  );
  if (out === null) return null;
  return out.split('\n').filter(Boolean);
}

function commitMessagesVsBase() {
  const out = gitCheck(`log ${BASE_REF}..HEAD --pretty=format:%B%n--END--`);
  if (out === null) return null;
  return out;
}

function checkChangeAck() {
  if (!baseRefAvailable()) {
    log(
      'consensus',
      C.YELLOW,
      `${BASE_REF} not available locally — skipping change-ack check (run \`git fetch origin\` to enable).`
    );
    return;
  }

  const changed = changedFilesVsBase();
  if (changed === null) {
    log('consensus', C.YELLOW, 'git diff failed — skipping change-ack check.');
    return;
  }

  const touched = changed.filter((f) => REGISTRY.includes(f));
  if (touched.length === 0) {
    return; // No registered files touched — gate passes.
  }

  const messages = commitMessagesVsBase();
  if (messages === null) {
    fail('git log failed — cannot verify consensus-critical-change ack.');
  }

  if (!messages.includes(ACK_TOKEN)) {
    log(
      'consensus',
      C.RED,
      'Consensus-critical files modified without acknowledgement:'
    );
    for (const f of touched) console.error(`    - ${f}`);
    log(
      'consensus',
      C.YELLOW,
      `Add a line like "${ACK_TOKEN} <bead-id>" to a commit body in this branch.`
    );
    log(
      'consensus',
      C.YELLOW,
      'Why: layout constants, RNG, glyph table, and cell-encoding feed mazeHash → tokenID.'
    );
    log(
      'consensus',
      C.YELLOW,
      '     A silent change re-mints every existing seed under a new identity.'
    );
    log(
      'consensus',
      C.YELLOW,
      '     See retro 2026-05-05 Appendix C and bead ma-5yi.'
    );
    process.exit(1);
  }
}

// --- Main -------------------------------------------------------------------

log('consensus', C.BLUE, 'Checking consensus-critical markers + change ack...');
checkMarkerPresence();
checkChangeAck();
log('consensus', C.GREEN, 'Consensus-critical gate ✓');
