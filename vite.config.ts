// vite.config.js
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ insertTypesEntry: true })],
  build: {
    outDir: 'dist/chat',
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ably-chat-js',
      fileName: 'ably-chat',
    },
    rollupOptions: {
      // We currently suggest that ably be installed as a separate dependency, so lets
      // not bundle it.
      external: ['ably'],
    },
    sourcemap: true,
  },
});
