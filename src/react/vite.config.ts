// vite.config.js
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  root: resolve(__dirname, 'hooks'),
  plugins: [react(), dts({ insertTypesEntry: true })],
  build: {
    outDir: resolve(__dirname, '../../dist/react'),
    lib: {
      entry: resolve(__dirname, 'index.ts'),
      name: 'AblyChatReact',
      fileName: 'ably-chat-react',
    },
    rollupOptions: {
      // We currently suggest that ably be installed as a separate dependency, so lets
      // not bundle it.
      external: ['ably', '@ably/chat', 'react'],
    },
    sourcemap: true,
  },
});
