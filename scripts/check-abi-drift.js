#!/usr/bin/env node
/**
 * ABI-drift gate (ma-3xv).
 *
 * Fails the build when the three sources of truth for the ZK proof's I/O
 * shape disagree:
 *
 *   1. Circuit `main()` parameter list  (maze_prover/src/main.nr)
 *   2. MazeConstants.PUBLIC_INPUTS_LENGTH  (contracts/src/MazeConstants.sol)
 *   3. ProverInput interface keys  (frontend/src/lib/zkSerialize.ts)
 *
 * Drift conditions checked:
 *   - count of `pub` params in main() != PUBLIC_INPUTS_LENGTH
 *   - any name in main() missing from ProverInput
 *   - any name in ProverInput missing from main()
 *
 * Exit 0 on agreement, exit 1 with a diagnostic table otherwise.
 *
 * Why this exists: the deployed verifier's verification key is baked into
 * bytecode at deploy time. Any silent change to the circuit's public-input
 * shape invalidates the on-chain verifier. The regalia-split bug
 * (ma-3rr → ma-6ff) was exactly this class of failure, and only the slow
 * full-tier e2e test caught it. This recipe gives us a fast PR-level gate.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const NOIR_MAIN = path.join(PROJECT_ROOT, 'maze_prover/src/main.nr');
const SOL_CONSTANTS = path.join(PROJECT_ROOT, 'contracts/src/MazeConstants.sol');
const TS_SERIALIZE = path.join(PROJECT_ROOT, 'frontend/src/lib/zkSerialize.ts');

const C = {
  RED: '\x1b[0;31m',
  GREEN: '\x1b[0;32m',
  YELLOW: '\x1b[1;33m',
  BLUE: '\x1b[0;34m',
  DIM: '\x1b[2m',
  NC: '\x1b[0m',
};

function fail(msg) {
  process.stderr.write(`${C.RED}[abi-drift] ${msg}${C.NC}\n`);
  process.exit(1);
}

function readFileOrDie(p, label) {
  if (!fs.existsSync(p)) {
    fail(`${label} not found: ${p}`);
  }
  return fs.readFileSync(p, 'utf8');
}

/**
 * Parse the Noir circuit's `fn main(...)` signature.
 * Returns an array of {name, type, public} in declaration order.
 *
 * Noir parameter syntax we accept:
 *   name: T
 *   name: pub T
 * where T may contain generics like `[u8; MAX_PACKED_BYTES]`.
 */
function parseNoirMain(src) {
  // Match `fn main(` ... `)` (the body brace is the terminator).
  const sigMatch = src.match(/\bfn\s+main\s*\(([^)]*)\)\s*(?:->\s*[^{]+)?\{/s);
  if (!sigMatch) {
    fail(`failed to locate fn main(...) in ${NOIR_MAIN}`);
  }
  const inner = sigMatch[1];

  // Split on commas at depth 0 (so `[u8; MAX_PACKED_BYTES]` stays whole).
  const parts = [];
  let depth = 0;
  let buf = '';
  for (const ch of inner) {
    if (ch === '[' || ch === '(' || ch === '<') depth++;
    else if (ch === ']' || ch === ')' || ch === '>') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim().length > 0) parts.push(buf);

  const params = [];
  for (const raw of parts) {
    const stripped = raw.replace(/\/\/.*$/gm, '').trim();
    if (!stripped) continue;
    const m = stripped.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/s);
    if (!m) {
      fail(`unparseable main() parameter: "${stripped}"`);
    }
    const name = m[1];
    let typeStr = m[2].trim();
    let isPublic = false;
    if (/^pub\b/.test(typeStr)) {
      isPublic = true;
      typeStr = typeStr.replace(/^pub\s*/, '').trim();
    }
    params.push({ name, type: typeStr, public: isPublic });
  }

  if (params.length === 0) {
    fail(`fn main() has no parameters — parser likely broken`);
  }
  return params;
}

/**
 * Parse `PUBLIC_INPUTS_LENGTH = N` from MazeConstants.sol.
 * The constant's declared type is uintNNN — we only need the literal value.
 */
function parseSolPublicInputsLength(src) {
  const m = src.match(
    /PUBLIC_INPUTS_LENGTH\s*=\s*(\d+)\s*;/
  );
  if (!m) {
    fail(`PUBLIC_INPUTS_LENGTH not found in ${SOL_CONSTANTS}`);
  }
  return parseInt(m[1], 10);
}

/**
 * Parse field names from the `ProverInput` TS interface.
 * The fields we care about are simple `name: T;` lines.
 */
function parseProverInputKeys(src) {
  const ifaceMatch = src.match(/export\s+interface\s+ProverInput\s*\{([\s\S]*?)\n\}/);
  if (!ifaceMatch) {
    fail(`ProverInput interface not found in ${TS_SERIALIZE}`);
  }
  const body = ifaceMatch[1];

  // Strip line and block comments, then pick `name:` declarations.
  const cleaned = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  const keys = [];
  for (const line of cleaned.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\??\s*:/);
    if (m) keys.push(m[1]);
  }
  if (keys.length === 0) {
    fail(`ProverInput appears to have no fields — parser likely broken`);
  }
  return keys;
}

function diff(a, b) {
  const setB = new Set(b);
  return a.filter((x) => !setB.has(x));
}

function main() {
  const noirSrc = readFileOrDie(NOIR_MAIN, 'circuit main.nr');
  const solSrc = readFileOrDie(SOL_CONSTANTS, 'MazeConstants.sol');
  const tsSrc = readFileOrDie(TS_SERIALIZE, 'zkSerialize.ts');

  const params = parseNoirMain(noirSrc);
  const publicInputsLen = parseSolPublicInputsLength(solSrc);
  const proverKeys = parseProverInputKeys(tsSrc);

  const circuitNames = params.map((p) => p.name);
  const publicCircuitNames = params.filter((p) => p.public).map((p) => p.name);

  const errors = [];

  // 1. Public-input count.
  if (publicCircuitNames.length !== publicInputsLen) {
    errors.push(
      `PUBLIC_INPUTS_LENGTH mismatch:\n` +
        `    circuit pub params: ${publicCircuitNames.length} ` +
        `[${publicCircuitNames.join(', ')}]\n` +
        `    MazeConstants.sol:  ${publicInputsLen}`
    );
  }

  // 2. Names in circuit missing from ProverInput.
  const missingInTs = diff(circuitNames, proverKeys);
  if (missingInTs.length > 0) {
    errors.push(
      `ProverInput is missing circuit param(s): ${missingInTs.join(', ')}\n` +
        `    Fix: add to InputMap in frontend/src/lib/zkSerialize.ts`
    );
  }

  // 3. Names in ProverInput missing from circuit.
  const missingInCircuit = diff(proverKeys, circuitNames);
  if (missingInCircuit.length > 0) {
    errors.push(
      `ProverInput has key(s) not in circuit main(): ${missingInCircuit.join(', ')}\n` +
        `    Fix: remove from ProverInput, or add to circuit main() params`
    );
  }

  if (errors.length === 0) {
    process.stdout.write(
      `${C.GREEN}[abi-drift]${C.NC} OK — circuit, MazeConstants, and ProverInput agree.\n` +
        `  circuit main() params (${circuitNames.length}): ${circuitNames.join(', ')}\n` +
        `  pub params (${publicCircuitNames.length}): ${publicCircuitNames.join(', ')}\n`
    );
    process.exit(0);
  }

  process.stderr.write(`${C.RED}ABI DRIFT DETECTED:${C.NC}\n`);
  process.stderr.write(
    `  circuit main() params (${circuitNames.length}): ${circuitNames.join(', ')}\n`
  );
  process.stderr.write(
    `  circuit pub params (${publicCircuitNames.length}): ${publicCircuitNames.join(', ')}\n`
  );
  process.stderr.write(`  MazeConstants.PUBLIC_INPUTS_LENGTH: ${publicInputsLen}\n`);
  process.stderr.write(
    `  ProverInput keys (${proverKeys.length}): ${proverKeys.join(', ')}\n\n`
  );
  for (const e of errors) {
    process.stderr.write(`  ${C.RED}✗${C.NC} ${e}\n\n`);
  }
  process.exit(1);
}

process.stderr.write(`DEBUG argv=${JSON.stringify(process.argv)} filename=${__filename}\n`);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.stderr.write('DEBUG running main()\n');
  main();
}

module.exports = {
  parseNoirMain,
  parseSolPublicInputsLength,
  parseProverInputKeys,
};
