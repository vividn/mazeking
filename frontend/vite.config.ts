import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { noirPlugin } from './vite-plugin-noir'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    noirPlugin({
      projectPath: path.resolve(__dirname, '../maze_prover'),
      outputPath: path.resolve(__dirname, 'public/circuit'),
    }),
  ],

  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  resolve: {
    alias: {
      buffer: 'buffer/',
      pino: path.resolve(__dirname, 'src/lib/pino-browser-stub.ts'),
    },
  },

  define: {
    'global': 'globalThis',
  },

  optimizeDeps: {
    exclude: ['@noir-lang/noir_js', '@aztec/bb.js'],
    include: ['buffer'],
  },
})
