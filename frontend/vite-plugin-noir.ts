import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import type { Plugin, ViteDevServer } from 'vite';

const execAsync = promisify(exec);

interface NoirPluginOptions {
  projectPath: string;
  outputPath: string;
}

export function noirPlugin(options: NoirPluginOptions): Plugin {
  const { projectPath, outputPath } = options;
  let server: ViteDevServer | null = null;
  let isCompiling = false;

  async function compile(): Promise<void> {
    if (isCompiling) {
      console.log('[noir-plugin] Compilation already in progress, skipping...');
      return;
    }

    isCompiling = true;
    console.log('[noir-plugin] Compiling Noir circuit...');

    try {
      const { stdout, stderr } = await execAsync('nargo compile', {
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
    },
  };
}
