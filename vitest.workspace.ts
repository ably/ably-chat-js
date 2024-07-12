import { defineWorkspace } from 'vitest/config';

// defineWorkspace provides a nice type hinting DX
export default defineWorkspace([
  {
    root: '.',
    test: {
      globalSetup: './test/helper/testSetup.ts',
      setupFiles: ['./test/helper/expectations.ts'],
      include: ['test/core/**/*.test.{ts,js}'],
      name: 'chat',
      environment: 'node',
      typecheck: {
        tsconfig: './tsconfig.test.json',
      },
    },
  },
  {
    root: '.',
    test: {
      globalSetup: './test/helper/testSetup.ts',
      setupFiles: ['./test/helper/expectations.ts'],
      include: ['test/react/**/*.test.{tsx,jsx}'],
      name: 'react-hooks',
      environment: 'jsdom',
      typecheck: {
        tsconfig: './tsconfig.test.json',
      },
    },
  },
]);
