#!/usr/bin/env node
/**
 * Tests for the ABI-drift gate (ma-3xv).
 *
 * Uses node:test (Node ≥18 built-in, no vitest dependency since the gate
 * lives outside frontend/). Two layers of coverage:
 *
 *   1. Unit tests for each parser against synthetic inputs.
 *   2. End-to-end: run the real script as a subprocess against a temp dir
 *      with intentionally-desynced source files and assert exit code 1.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  parseNoirMain,
  parseSolPublicInputsLength,
  parseProverInputKeys,
} = require('./check-abi-drift');

const SCRIPT_PATH = path.join(__dirname, 'check-abi-drift.js');

// ---------------------------------------------------------------------------
// Parser unit tests
// ---------------------------------------------------------------------------

test('parseNoirMain extracts names, types, and pub flags', () => {
  const src = `
    fn main(
      maze_hash: pub Field,
      move_count: pub u32,
      width: u16,
      packed_cells: [u8; MAX_PACKED_BYTES],
      moves: [u8; MAX_MOVES],
    ) {
      // body
    }
  `;
  const params = parseNoirMain(src);
  assert.deepEqual(
    params.map((p) => p.name),
    ['maze_hash', 'move_count', 'width', 'packed_cells', 'moves']
  );
  assert.equal(params[0].public, true);
  assert.equal(params[1].public, true);
  assert.equal(params[2].public, false);
  assert.equal(params[3].type, '[u8; MAX_PACKED_BYTES]');
});

test('parseSolPublicInputsLength reads the constant', () => {
  const src = `
    library MazeConstants {
      uint256 internal constant PUBLIC_INPUTS_LENGTH = 7;
    }
  `;
  assert.equal(parseSolPublicInputsLength(src), 7);
});

test('parseProverInputKeys extracts interface fields, ignoring comments', () => {
  const src = `
    export interface ProverInput {
      // Public
      maze_hash: \`0x\${string}\`;
      move_count: number;
      /* Private */
      width: number;
      packed_cells: number[];
    }
  `;
  assert.deepEqual(parseProverInputKeys(src), [
    'maze_hash',
    'move_count',
    'width',
    'packed_cells',
  ]);
});

// ---------------------------------------------------------------------------
// End-to-end: stage a fake project tree and run the script against it.
// ---------------------------------------------------------------------------

/**
 * The real script reads files at hard-coded paths relative to its own
 * location. To exercise it without mutating the real source tree, we copy
 * the script into a temp dir and recreate the expected layout next to it.
 */
function stageFakeProject({ mainNr, mazeConstantsSol, zkSerializeTs }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'abi-drift-'));
  const scriptsDir = path.join(root, 'scripts');
  fs.mkdirSync(scriptsDir);
  fs.copyFileSync(SCRIPT_PATH, path.join(scriptsDir, 'check-abi-drift.js'));

  fs.mkdirSync(path.join(root, 'maze_prover/src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'maze_prover/src/main.nr'), mainNr);

  fs.mkdirSync(path.join(root, 'contracts/src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'contracts/src/MazeConstants.sol'),
    mazeConstantsSol
  );

  fs.mkdirSync(path.join(root, 'frontend/src/lib'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'frontend/src/lib/zkSerialize.ts'),
    zkSerializeTs
  );

  return path.join(scriptsDir, 'check-abi-drift.js');
}

const GOOD_MAIN_NR = `
fn main(
  maze_hash: pub Field,
  move_count: pub u32,
  width: u16,
  packed_cells: [u8; MAX_PACKED_BYTES],
  moves: [u8; MAX_MOVES],
) {}
`;

const GOOD_SOL = `
library MazeConstants {
  uint256 internal constant PUBLIC_INPUTS_LENGTH = 2;
}
`;

const GOOD_TS = `
export interface ProverInput {
  maze_hash: \`0x\${string}\`;
  move_count: number;
  width: number;
  packed_cells: number[];
  moves: number[];
}
`;

function runScript(scriptPath) {
  try {
    const stdout = execFileSync('node', [scriptPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      code: err.status ?? -1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

test('e2e: passes when all three sources agree', () => {
  const scriptPath = stageFakeProject({
    mainNr: GOOD_MAIN_NR,
    mazeConstantsSol: GOOD_SOL,
    zkSerializeTs: GOOD_TS,
  });
  const r = runScript(scriptPath);
  assert.equal(r.code, 0, `expected pass, got code=${r.code}\n${r.stderr}`);
});

test('e2e: fails when ProverInput drops a circuit param (rename in main)', () => {
  // Circuit renames `width` → `wid`, but ProverInput still has `width`.
  const scriptPath = stageFakeProject({
    mainNr: GOOD_MAIN_NR.replace('width: u16,', 'wid: u16,'),
    mazeConstantsSol: GOOD_SOL,
    zkSerializeTs: GOOD_TS,
  });
  const r = runScript(scriptPath);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /missing circuit param.*wid/);
  assert.match(r.stderr, /not in circuit main\(\).*width/);
});

test('e2e: fails when PUBLIC_INPUTS_LENGTH disagrees with circuit', () => {
  const scriptPath = stageFakeProject({
    mainNr: GOOD_MAIN_NR,
    mazeConstantsSol: GOOD_SOL.replace('= 2', '= 3'),
    zkSerializeTs: GOOD_TS,
  });
  const r = runScript(scriptPath);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /PUBLIC_INPUTS_LENGTH mismatch/);
});

test('e2e: fails when ProverInput has an extra key not in circuit', () => {
  const scriptPath = stageFakeProject({
    mainNr: GOOD_MAIN_NR,
    mazeConstantsSol: GOOD_SOL,
    zkSerializeTs: GOOD_TS.replace(
      'moves: number[];',
      'moves: number[];\n  ghost: number;'
    ),
  });
  const r = runScript(scriptPath);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /not in circuit main\(\).*ghost/);
});

test('e2e: passes against the real repo files', () => {
  // Sanity: the actual checked-in tree must satisfy the gate.
  const r = runScript(SCRIPT_PATH);
  assert.equal(r.code, 0, `real-tree drift detected:\n${r.stderr}`);
});
