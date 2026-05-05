#!/usr/bin/env node
/**
 * Generate the frontend address-map for a deployed chain.
 *
 * Reads `contracts/deployments/<chainId>.json` (written by Deploy.s.sol) and
 * emits a TypeScript module exporting `CONTRACT_ADDRESSES`. ABIs are also
 * mirrored into `frontend/src/lib/abi/*.json`.
 *
 * Routing:
 *   chainId === 31337 → frontend/src/lib/contracts.local.ts     (gitignored)
 *   otherwise         → frontend/src/lib/contracts.generated.ts (committed)
 *
 * Local anvil deploys must NOT dirty the worktree; the loader at
 * `frontend/src/lib/contracts.ts` merges public (committed) + local
 * (optional) maps.
 *
 * Usage: node generate-contracts-config.js <chainId>
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONTRACTS_DIR = path.join(PROJECT_ROOT, 'contracts');
const DEPLOYMENTS_DIR = path.join(CONTRACTS_DIR, 'deployments');
const CONTRACTS_OUT_DIR = path.join(CONTRACTS_DIR, 'out');
const FRONTEND_LIB_DIR = path.join(PROJECT_ROOT, 'frontend', 'src', 'lib');
const ABI_DIR = path.join(FRONTEND_LIB_DIR, 'abi');

const LOCAL_CHAIN_ID = '31337';

const COLORS = {
  RED: '\x1b[0;31m',
  GREEN: '\x1b[0;32m',
  YELLOW: '\x1b[1;33m',
  BLUE: '\x1b[0;34m',
  NC: '\x1b[0m',
};

function log(color, tag, message) {
  console.log(`${color}[${tag}]${COLORS.NC} ${message}`);
}

function error(message) {
  log(COLORS.RED, 'config-gen', `Error: ${message}`);
  process.exit(1);
}

function main() {
  const chainId = process.argv[2];

  if (!chainId) {
    error('Chain ID not provided. Usage: node generate-contracts-config.js <chainId>');
  }

  log(COLORS.BLUE, 'config-gen', `Generating contracts config for chain ${chainId}...`);

  const deploymentFile = path.join(DEPLOYMENTS_DIR, `${chainId}.json`);
  if (!fs.existsSync(deploymentFile)) {
    error(`Deployment file not found: ${deploymentFile}`);
  }

  log(COLORS.YELLOW, 'config-gen', `Reading deployment from ${deploymentFile}`);
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));

  // Extract ABIs from forge output.
  log(COLORS.YELLOW, 'config-gen', 'Extracting ABIs from forge output...');

  const nftForgeOutput = path.join(CONTRACTS_OUT_DIR, 'MazeKingNFT.sol', 'MazeKingNFT.json');
  const verifierForgeOutput = path.join(
    CONTRACTS_OUT_DIR,
    'MazeVerifier.sol',
    'HonkVerifier.json',
  );

  if (!fs.existsSync(nftForgeOutput)) {
    error(`NFT contract output not found: ${nftForgeOutput}. Run 'forge build' first.`);
  }
  if (!fs.existsSync(verifierForgeOutput)) {
    error(`Verifier contract output not found: ${verifierForgeOutput}. Run 'forge build' first.`);
  }

  const nftAbi = JSON.parse(fs.readFileSync(nftForgeOutput, 'utf8')).abi;
  const verifierAbi = JSON.parse(fs.readFileSync(verifierForgeOutput, 'utf8')).abi;

  log(COLORS.YELLOW, 'config-gen', 'Saving ABIs to frontend/src/lib/abi/...');
  fs.mkdirSync(ABI_DIR, { recursive: true });
  writeIfChanged(path.join(ABI_DIR, 'MazeKingNFT.json'), JSON.stringify(nftAbi, null, 2) + '\n');
  writeIfChanged(
    path.join(ABI_DIR, 'MazeVerifier.json'),
    JSON.stringify(verifierAbi, null, 2) + '\n',
  );

  const isLocal = chainId === LOCAL_CHAIN_ID;
  const outputFile = path.join(
    FRONTEND_LIB_DIR,
    isLocal ? 'contracts.local.ts' : 'contracts.generated.ts',
  );

  const content = isLocal
    ? renderLocal(chainId, deployment)
    : renderGenerated(chainId, deployment);

  fs.writeFileSync(outputFile, content, 'utf8');
  log(COLORS.GREEN, 'config-gen', `Generated ${outputFile}`);

  log(COLORS.GREEN, 'config-gen', 'Configuration generation complete!');
  console.log('');
  console.log(`  NFT Address:      ${deployment.nft}`);
  console.log(`  Verifier Address: ${deployment.verifier}`);
  console.log(`  Chain ID:         ${deployment.chainId}`);
}

function writeIfChanged(filepath, content) {
  if (fs.existsSync(filepath) && fs.readFileSync(filepath, 'utf8') === content) return;
  fs.writeFileSync(filepath, content, 'utf8');
}

// `renderer` is optional in the type because pre-existing deploys (and any
// network where the on-chain SVG renderer hasn't been set yet) won't have it.
// The mint flow reads tokenURI through the NFT contract, so frontend code
// only needs the renderer address for direct off-chain calls.
function rendererLine(deployment) {
  return deployment.renderer ? `\n    renderer: '${deployment.renderer}',` : '';
}

function renderLocal(chainId, deployment) {
  // Single-chain local map. Loader merges this into the public map.
  return `/**
 * Local anvil contract addresses (chainId ${chainId}).
 *
 * GITIGNORED — written by \`just deploy-local\`. Do not commit.
 *
 * The loader at \`./contracts.ts\` merges this into the public address map
 * via \`import.meta.glob\` so its absence on fresh clones is a no-op.
 */

export const CONTRACT_ADDRESSES: Record<
  number,
  { nft: \`0x\${string}\`; verifier: \`0x\${string}\`; renderer?: \`0x\${string}\` }
> = {
  ${chainId}: {
    nft: '${deployment.nft}',
    verifier: '${deployment.verifier}',${rendererLine(deployment)}
  },
};
`;
}

function renderGenerated(chainId, deployment) {
  // Public-network map. Committed; statichost.eu's build reads this.
  // Generator-rendered version preserves any additional public chains is
  // out of scope — Sepolia redeploys overwrite the file with this single
  // entry. If multi-chain support is needed, edit by hand.
  return `/**
 * Public-network contract addresses.
 *
 * Written by \`just deploy-sepolia\` (and other non-local deploys) via
 * \`scripts/generate-contracts-config.js\`. Tracked in git so statichost.eu's
 * build picks up the live addresses; commit the diff after redeploying.
 *
 * Local anvil (31337) addresses live in the gitignored sibling
 * \`contracts.local.ts\`.
 */

export const CONTRACT_ADDRESSES: Record<
  number,
  { nft: \`0x\${string}\`; verifier: \`0x\${string}\`; renderer?: \`0x\${string}\` }
> = {
  ${chainId}: {
    nft: '${deployment.nft}',
    verifier: '${deployment.verifier}',${rendererLine(deployment)}
  },
};
`;
}

try {
  main();
} catch (err) {
  error(err.message);
}
