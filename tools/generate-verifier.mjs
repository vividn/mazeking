#!/usr/bin/env node
// Build artifacts for the maze_prover circuit using only WASM packages.
//
// Replaces native `nargo compile` and `bb write_solidity_verifier` with
// `@noir-lang/noir_wasm` and `@aztec/bb.js`. One pnpm install is the only
// prerequisite — no -march tuning, no nargoup, no bbup.
//
// Usage:
//   node tools/generate-verifier.mjs [compile|verifier|all]
//     compile  — compile circuit, write target JSON + frontend public copy
//     verifier — compile + write contracts/src/generated/MazeVerifier.sol
//     all      — same as `verifier` (default)

import { compile_program, createFileManager } from '@noir-lang/noir_wasm';
import { UltraHonkBackend } from '@aztec/bb.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const CIRCUIT_DIR = join(ROOT, 'maze_prover');
const CIRCUIT_TARGET = join(CIRCUIT_DIR, 'target', 'maze_prover.json');
const FRONTEND_CIRCUIT = join(ROOT, 'frontend/public/circuit/maze_prover.json');
const VERIFIER_OUT = join(ROOT, 'contracts/src/generated/MazeVerifier.sol');

const C = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
  reset: '\x1b[0m',
};
const log = (color, tag, msg) => console.log(`${color}[${tag}]${C.reset} ${msg}`);

async function compileCircuit() {
  log(C.blue, 'compile', `noir_wasm: ${CIRCUIT_DIR}`);
  const fm = createFileManager(CIRCUIT_DIR);
  const result = await compile_program(fm);
  for (const w of result.warnings ?? []) log(C.yellow, 'compile', `warning: ${JSON.stringify(w)}`);
  const artifact = result.program;

  log(C.green, 'compile', `noir ${artifact.noir_version}, hash ${artifact.hash}`);

  await mkdir(dirname(CIRCUIT_TARGET), { recursive: true });
  await writeFile(CIRCUIT_TARGET, JSON.stringify(artifact), 'utf8');
  log(C.green, 'compile', `wrote ${CIRCUIT_TARGET}`);

  await mkdir(dirname(FRONTEND_CIRCUIT), { recursive: true });
  await writeFile(FRONTEND_CIRCUIT, JSON.stringify(artifact), 'utf8');
  log(C.green, 'compile', `wrote ${FRONTEND_CIRCUIT}`);

  return artifact;
}

async function generateVerifier(artifact) {
  log(C.blue, 'verifier', 'bb.js: UltraHonkBackend.getSolidityVerifier()');
  const backend = new UltraHonkBackend(artifact.bytecode);
  try {
    const sol = await backend.getSolidityVerifier();
    const withSpdx = /SPDX-License-Identifier/.test(sol)
      ? sol
      : `// SPDX-License-Identifier: MIT\n${sol}`;
    await mkdir(dirname(VERIFIER_OUT), { recursive: true });
    await writeFile(VERIFIER_OUT, withSpdx, 'utf8');
    log(C.green, 'verifier', `wrote ${VERIFIER_OUT}`);
  } finally {
    await backend.destroy();
  }
}

const cmd = process.argv[2] ?? 'all';
if (!['compile', 'verifier', 'all'].includes(cmd)) {
  console.error(`Usage: generate-verifier.mjs [compile|verifier|all]`);
  process.exit(2);
}

const artifact = await compileCircuit();
if (cmd !== 'compile') await generateVerifier(artifact);
