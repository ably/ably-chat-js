// vite.config.js
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  root: resolve(__dirname, '.'),
  plugins: [dts({ insertTypesEntry: true })],
  build: {
    outDir: '../dist/chat',
    lib: {
      entry: resolve(__dirname, 'index.ts'),
      name: 'AblyChat',
      fileName: 'ably-chat',
    },
    rollupOptions: {
      // We currently suggest that ably be installed as a separate dependency, so lets
      // not bundle it.
      external: ['ably', 'react', 'react-dom', 'react/jsx-runtime'],
    },
    sourcemap: true,
  },
});
