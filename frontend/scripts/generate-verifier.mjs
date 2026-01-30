#!/usr/bin/env node
/**
 * Generate Solidity verifier using bb.js (same version as frontend)
 *
 * This ensures the verifier is always compatible with proofs generated
 * by the frontend, eliminating version mismatch issues.
 *
 * Usage: cd frontend && node scripts/generate-verifier.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = join(__dirname, '..');
const PROJECT_ROOT = join(FRONTEND_ROOT, '..');

const CIRCUIT_PATH = join(PROJECT_ROOT, 'maze_prover/target/maze_prover.json');
const OUTPUT_PATH = join(PROJECT_ROOT, 'contracts/src/generated/MazeVerifier.sol');

// Colors for terminal
const C = {
  RED: '\x1b[0;31m',
  GREEN: '\x1b[0;32m',
  YELLOW: '\x1b[1;33m',
  BLUE: '\x1b[0;34m',
  NC: '\x1b[0m',
};

function log(color, tag, msg) {
  console.log(`${color}[${tag}]${C.NC} ${msg}`);
}

async function main() {
  log(C.BLUE, 'verifier', 'Generating Solidity verifier using bb.js...');

  // Dynamic import to handle ESM
  const { UltraHonkBackend } = await import('@aztec/bb.js');

  // Read circuit
  log(C.YELLOW, 'verifier', `Reading circuit from ${CIRCUIT_PATH}`);
  const circuitJson = JSON.parse(readFileSync(CIRCUIT_PATH, 'utf8'));

  // Log circuit info
  log(C.YELLOW, 'verifier', `Circuit hash: ${circuitJson.hash}`);
  log(C.YELLOW, 'verifier', `Noir version: ${circuitJson.noir_version}`);

  // Create backend
  log(C.YELLOW, 'verifier', 'Initializing UltraHonkBackend...');
  const backend = new UltraHonkBackend(circuitJson.bytecode);

  // Generate verifier
  log(C.YELLOW, 'verifier', 'Generating Solidity verifier (this may take a moment)...');
  const solidityCode = await backend.getSolidityVerifier();

  // Ensure output directory exists
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });

  // Write verifier
  writeFileSync(OUTPUT_PATH, solidityCode, 'utf8');
  log(C.GREEN, 'verifier', `Verifier written to ${OUTPUT_PATH}`);

  // Extract and display key info from generated verifier
  const publicInputsMatch = solidityCode.match(/NUMBER_OF_PUBLIC_INPUTS\s*=\s*(\d+)/);
  const logNMatch = solidityCode.match(/LOG_N\s*=\s*(\d+)/);

  if (publicInputsMatch) {
    log(C.GREEN, 'verifier', `Public inputs size: ${publicInputsMatch[1]}`);
  }
  if (logNMatch) {
    log(C.GREEN, 'verifier', `Circuit log_n: ${logNMatch[1]}`);
  }

  // Cleanup
  await backend.destroy();

  log(C.GREEN, 'verifier', 'Done!');
}

main().catch(err => {
  log(C.RED, 'verifier', `Error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
