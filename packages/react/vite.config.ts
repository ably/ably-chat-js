// vite.config.js
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  root: resolve(__dirname, '.'),
  plugins: [dts({ insertTypesEntry: true })],
  build: {
    outDir: './dist/chat',
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AblyChat',
      fileName: 'ably-chat-react',
    },
    rollupOptions: {
      // We currently suggest that ably be installed as a separate dependency, so lets
      // not bundle it.
      external: ['ably', '@ably/chat', 'react', 'react-dom', 'react/jsx-runtime'],
    },
    sourcemap: true,
  },
});
