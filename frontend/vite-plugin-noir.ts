import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import type { Plugin, ViteDevServer } from 'vite';

const execAsync = promisify(exec);

interface NoirPluginOptions {
  projectPath: string;
  outputPath: string;
  /** Path to contracts directory for Solidity verifier generation */
  contractsPath?: string;
  /** Enable Solidity verifier generation (requires bb CLI) */
  generateVerifier?: boolean;
}

export function noirPlugin(options: NoirPluginOptions): Plugin {
  const {
    projectPath,
    outputPath,
    contractsPath,
    generateVerifier = false
  } = options;

  let server: ViteDevServer | null = null;
  let isCompiling = false;

  // Find executable path, checking common locations
  function findExecutable(name: string, defaultPath: string): string | null {
    if (fs.existsSync(defaultPath)) {
      return defaultPath;
    }
    // Try PATH
    try {
      const { stdout } = require('child_process').execSync(`which ${name}`, { encoding: 'utf-8' });
      const trimmed = stdout.trim();
      if (trimmed && fs.existsSync(trimmed)) {
        return trimmed;
      }
    } catch {
      // Not in PATH
    }
    return null;
  }

  async function generateSolidityVerifier(): Promise<void> {
    if (!generateVerifier || !contractsPath) {
      return;
    }

    const bbPath = findExecutable('bb', path.join(process.env.HOME || '', '.bb', 'bb'));
    if (!bbPath) {
      console.warn('[noir-plugin] bb CLI not found, skipping Solidity verifier generation');
      console.warn('[noir-plugin] Install bb: curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/install | bash');
      return;
    }

    console.log('[noir-plugin] Generating Solidity verifier...');

    try {
      const circuitPath = path.join(projectPath, 'target', 'maze_prover.json');
      const vkPath = path.join(projectPath, 'target', 'vk');
      const verifierDir = path.join(contractsPath, 'src', 'generated');
      const verifierPath = path.join(verifierDir, 'MazeVerifier.sol');

      // Ensure output directory exists
      fs.mkdirSync(verifierDir, { recursive: true });

      // Generate verification key
      console.log('[noir-plugin] Generating verification key...');
      await execAsync(`"${bbPath}" write_vk -b "${circuitPath}" -o "${vkPath}"`, {
        cwd: projectPath,
      });

      // Generate Solidity verifier
      console.log('[noir-plugin] Generating Solidity contract...');
      await execAsync(`"${bbPath}" contract -k "${vkPath}" -o "${verifierPath}"`, {
        cwd: projectPath,
      });

      // Add SPDX identifier if missing
      if (fs.existsSync(verifierPath)) {
        let content = fs.readFileSync(verifierPath, 'utf-8');
        if (!content.includes('SPDX-License-Identifier')) {
          content = '// SPDX-License-Identifier: MIT\n' + content;
          fs.writeFileSync(verifierPath, content);
        }
        console.log('[noir-plugin] Solidity verifier generated:', verifierPath);
      }
    } catch (error) {
      console.error('[noir-plugin] Solidity verifier generation failed:', error);
      // Don't throw - verifier generation is optional
    }
  }

  async function compile(): Promise<void> {
    if (isCompiling) {
      console.log('[noir-plugin] Compilation already in progress, skipping...');
      return;
    }

    isCompiling = true;
    console.log('[noir-plugin] Compiling Noir circuit...');

    try {
      // Find nargo
      const nargoPath = findExecutable('nargo', path.join(process.env.HOME || '', '.nargo', 'bin', 'nargo'));
      const nargoCmd = nargoPath ? `"${nargoPath}"` : 'nargo';

      const { stdout, stderr } = await execAsync(`${nargoCmd} compile`, {
        cwd: projectPath,
      });

      if (stderr && !stderr.includes('Compiling')) {
        console.warn('[noir-plugin] Compiler warnings:', stderr);
      }

      console.log('[noir-plugin] Compilation successful');

      const artifactPath = path.join(projectPath, 'target', 'maze_prover.json');
      const destPath = path.join(outputPath, 'maze_prover.json');

      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(artifactPath, destPath);

      console.log('[noir-plugin] Copied artifact to', destPath);

      // Generate Solidity verifier after successful compilation
      await generateSolidityVerifier();

      if (server) {
        server.ws.send({ type: 'full-reload' });
      }
    } catch (error) {
      console.error('[noir-plugin] Compilation failed:', error);
    } finally {
      isCompiling = false;
    }
  }

  return {
    name: 'vite-plugin-noir',

    async buildStart() {
      const artifactPath = path.join(projectPath, 'target', 'maze_prover.json');
      const destPath = path.join(outputPath, 'maze_prover.json');

      if (fs.existsSync(artifactPath)) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(artifactPath, destPath);
        console.log('[noir-plugin] Copied existing circuit artifact');

        // Also generate verifier if enabled
        await generateSolidityVerifier();
      } else {
        console.log('[noir-plugin] No existing artifact, running initial compile...');
        await compile();
      }
    },

    configureServer(devServer) {
      server = devServer;

      const srcPath = path.join(projectPath, 'src');
      const watcher = devServer.watcher;

      watcher.add(srcPath);

      watcher.on('change', async (changedPath) => {
        if (changedPath.endsWith('.nr')) {
          console.log('[noir-plugin] Detected change in', path.basename(changedPath));
          await compile();
        }
      });

      console.log('[noir-plugin] Watching', srcPath, 'for .nr file changes');
      if (generateVerifier && contractsPath) {
        console.log('[noir-plugin] Solidity verifier generation enabled');
      }
    },
  };
}
