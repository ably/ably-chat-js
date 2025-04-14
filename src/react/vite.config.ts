// vite.config.js
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  root: resolve(__dirname, '.'),
  plugins: [
    dts({
      // tsconfigPath: resolve(__dirname, '../../tsconfig.json'),
      entryRoot: resolve(__dirname, '.'),
      // rollupTypes: true,
      insertTypesEntry: true,
      exclude: ['src/core/**/*'],
      include: ['**/*.ts', '**/*.tsx'],
    }),
  ],
  build: {
    outDir: '../../dist/react',
    lib: {
      entry: resolve(__dirname, 'index.ts'),
      name: 'AblyChat',
      fileName: 'ably-chat-react',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: ['ably', 'react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          ably: 'Ably',
        },
      },
    },
    sourcemap: true,
  },
});
