#!/usr/bin/env node
/**
 * Build-time gate: ensure circuit ↔ Solidity ↔ TypeScript public-input shape
 * agrees. The deployed verifier bakes the circuit's verification key into its
 * bytecode, so any silent ABI drift between the three sides invalidates the
 * verifier without warning. The regalia-split bug (ma-3rr → ma-6ff) was an
 * instance of this class.
 *
 * Sources of truth:
 *   1. maze_prover/src/main.nr          — fn main(...) parameter list (with `pub`)
 *   2. contracts/src/MazeConstants.sol  — PUBLIC_INPUTS_LENGTH constant
 *   3. frontend/src/lib/zkSerialize.ts  — generateProverInput return-object keys
 *
 * Drift conditions (any one fails the gate):
 *   - Field name in circuit main() not present in generateProverInput.
 *   - Field present in generateProverInput not in circuit main().
 *   - Count of `pub` params in circuit ≠ MazeConstants.PUBLIC_INPUTS_LENGTH.
 *
 * Exits 0 on agreement, 1 with a diagnostic table on mismatch.
 *
 * See bead ma-3xv. Wire into CI before `forge test`.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const CIRCUIT_FILE = path.join(PROJECT_ROOT, 'maze_prover/src/main.nr');
const CONSTANTS_FILE = path.join(PROJECT_ROOT, 'contracts/src/MazeConstants.sol');
const ZK_SERIALIZE_FILE = path.join(PROJECT_ROOT, 'frontend/src/lib/zkSerialize.ts');

const C = {
  RED: '\x1b[0;31m',
  GREEN: '\x1b[0;32m',
  YELLOW: '\x1b[1;33m',
  BLUE: '\x1b[0;34m',
  BOLD: '\x1b[1m',
  NC: '\x1b[0m',
};

function abort(msg) {
  console.error(`${C.RED}[abi-drift]${C.NC} ${msg}`);
  process.exit(1);
}

// --- Source 1: circuit main() parameters --------------------------------

function parseCircuitMainParams() {
  if (!fs.existsSync(CIRCUIT_FILE)) abort(`circuit file not found: ${CIRCUIT_FILE}`);
  const src = fs.readFileSync(CIRCUIT_FILE, 'utf8');

  // Match `fn main(` at the start of a line (top-level entry point only).
  const mainRe = /^fn\s+main\s*\(/m;
  const m = mainRe.exec(src);
  if (!m) abort(`cannot locate "fn main(" in ${CIRCUIT_FILE}`);

  // Walk paren depth from the opening `(` to find the matching `)`.
  const openIdx = m.index + m[0].length - 1; // index of the `(`
  let depth = 1;
  let i = openIdx + 1;
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') depth--;
  }
  if (depth !== 0) abort(`unterminated paren list in fn main()`);
  const paramSrc = src.substring(openIdx + 1, i - 1);

  // Strip line comments (Noir is C-style).
  const cleaned = paramSrc.replace(/\/\/[^\n]*/g, '').trim();
  if (cleaned.length === 0) return [];

  // Split top-level commas. Honor `[...]`, `<...>`, `(...)` nesting so that
  // `packed_cells: [u8; MAX_PACKED_BYTES]` stays as one parameter.
  const params = splitTopLevelCommas(cleaned, { angle: true });

  return params.map((p) => {
    const colonIdx = p.indexOf(':');
    if (colonIdx === -1) abort(`malformed circuit param (no colon): "${p}"`);
    const name = p.substring(0, colonIdx).trim();
    const tail = p.substring(colonIdx + 1).trim();
    // `pub` modifier in Noir appears between the colon and the type:
    //   `maze_hash: pub Field`
    const isPub = /^pub\b/.test(tail);
    const type = tail.replace(/^pub\s+/, '').trim();
    return { name, type, isPub };
  });
}

// --- Source 2: MazeConstants.PUBLIC_INPUTS_LENGTH ----------------------

function parsePublicInputsLength() {
  if (!fs.existsSync(CONSTANTS_FILE)) abort(`constants file not found: ${CONSTANTS_FILE}`);
  const src = fs.readFileSync(CONSTANTS_FILE, 'utf8');
  const re = /uint256\s+internal\s+constant\s+PUBLIC_INPUTS_LENGTH\s*=\s*(\d+)\s*;/;
  const m = re.exec(src);
  if (!m) abort(`cannot find PUBLIC_INPUTS_LENGTH in ${CONSTANTS_FILE}`);
  return parseInt(m[1], 10);
}

// --- Source 3: generateProverInput return keys -------------------------

function parseGenerateProverInputKeys() {
  if (!fs.existsSync(ZK_SERIALIZE_FILE)) abort(`zkSerialize file not found: ${ZK_SERIALIZE_FILE}`);
  const src = fs.readFileSync(ZK_SERIALIZE_FILE, 'utf8');

  // Locate `export function generateProverInput(`
  const fnRe = /export\s+function\s+generateProverInput\s*\(/;
  const fnMatch = fnRe.exec(src);
  if (!fnMatch) abort(`cannot find generateProverInput in ${ZK_SERIALIZE_FILE}`);

  // From there, find the first `return {` and capture the object literal.
  const returnRe = /\breturn\s*\{/g;
  returnRe.lastIndex = fnMatch.index + fnMatch[0].length;
  const ret = returnRe.exec(src);
  if (!ret) abort(`cannot find "return {" in generateProverInput`);

  const objStart = ret.index + ret[0].length;
  let depth = 1;
  let k = objStart;
  for (; k < src.length && depth > 0; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') depth--;
  }
  if (depth !== 0) abort(`unterminated return-object braces in generateProverInput`);
  const objSrc = src.substring(objStart, k - 1);

  // Strip line comments and split top-level commas.
  const cleaned = objSrc.replace(/\/\/[^\n]*/g, '');
  const parts = splitTopLevelCommas(cleaned, { angle: false });

  return parts.map((p) => {
    // Property is either `key: value` or shorthand `key`.
    const colonIdx = p.indexOf(':');
    return colonIdx === -1 ? p.trim() : p.substring(0, colonIdx).trim();
  });
}

// --- Helpers -----------------------------------------------------------

function splitTopLevelCommas(s, { angle }) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let j = 0; j <= s.length; j++) {
    const ch = s[j];
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    else if (angle && ch === '<') depth++;
    else if (angle && ch === '>') depth--;
    else if ((ch === ',' || j === s.length) && depth === 0) {
      const part = s.substring(start, j).trim();
      if (part) out.push(part);
      start = j + 1;
    }
  }
  return out;
}

// --- Diff and report ---------------------------------------------------

function main() {
  const circuitParams = parseCircuitMainParams();
  const publicInputsLength = parsePublicInputsLength();
  const tsKeys = parseGenerateProverInputKeys();

  const circuitNames = circuitParams.map((p) => p.name);
  const publicNames = circuitParams.filter((p) => p.isPub).map((p) => p.name);
  const circuitSet = new Set(circuitNames);
  const tsSet = new Set(tsKeys);

  const missingFromTs = circuitNames.filter((n) => !tsSet.has(n));
  const extraInTs = tsKeys.filter((k) => !circuitSet.has(k));
  const publicCountMismatch = publicNames.length !== publicInputsLength;

  const ok = missingFromTs.length === 0 && extraInTs.length === 0 && !publicCountMismatch;

  if (ok) {
    console.log(`${C.GREEN}[abi-drift]${C.NC} OK — circuit, MazeConstants, and zkSerialize agree.`);
    console.log(`  circuit main() params (${circuitNames.length}): ${circuitNames.join(', ')}`);
    console.log(`  public inputs (${publicNames.length}): ${publicNames.join(', ')}`);
    console.log(`  MazeConstants.PUBLIC_INPUTS_LENGTH = ${publicInputsLength} ✓`);
    console.log(`  generateProverInput keys (${tsKeys.length}) match.`);
    return;
  }

  // Mismatch — emit a diagnostic table and exit 1.
  console.error(`${C.RED}${C.BOLD}ABI DRIFT DETECTED:${C.NC}`);
  console.error(`  circuit main() params: ${circuitNames.join(', ')}`);
  console.error(
    `  MazeConstants.PUBLIC_INPUTS_LENGTH: ${publicInputsLength} ${publicCountMismatch ? `${C.RED}✗${C.NC}` : '✓'}`
  );
  console.error(`  generateProverInput keys: ${tsKeys.join(', ')}`);
  console.error('');

  if (missingFromTs.length > 0) {
    console.error(
      `${C.YELLOW}  ✗ missing from generateProverInput:${C.NC} ${missingFromTs.join(', ')}`
    );
    console.error(
      `      Fix: add ${missingFromTs.map((n) => `\`${n}\``).join(', ')} to the return object in zkSerialize.ts`
    );
  }
  if (extraInTs.length > 0) {
    console.error(
      `${C.YELLOW}  ✗ extra in generateProverInput (not in circuit main()):${C.NC} ${extraInTs.join(', ')}`
    );
    console.error(
      `      Fix: remove ${extraInTs.join(', ')} from generateProverInput, or add to circuit main()`
    );
  }
  if (publicCountMismatch) {
    console.error(
      `${C.YELLOW}  ✗ public input count mismatch:${C.NC} circuit has ${publicNames.length} \`pub\` param(s) (${publicNames.join(', ') || '<none>'}), MazeConstants.PUBLIC_INPUTS_LENGTH = ${publicInputsLength}`
    );
    console.error(
      `      Fix: regenerate constants (\`just generate-constants\`) OR adjust \`pub\` modifiers in circuit main()`
    );
  }
  process.exit(1);
}

main();
