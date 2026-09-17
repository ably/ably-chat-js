// vite.config.js
import { resolve } from 'path';
import { defineConfig } from 'vite';

// Builds the bundles published to the CDN.
export default defineConfig({
  root: resolve(__dirname, '.'),
  build: {
    outDir: '../../dist/cdn',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'index.ts'),
      name: 'AblyChat',
      fileName: 'ably-chat',
    },
    sourcemap: true,
  },
});
