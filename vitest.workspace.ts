import { defineWorkspace } from 'vitest/config';

// defineWorkspace provides a nice type hinting DX
export default defineWorkspace([
  {
    root: '.',
    test: {
      globalSetup: './test/helper/test-setup.ts',
      setupFiles: ['./test/helper/expectations.ts'],
      include: ['test/core/**/*.test.{ts,js}'],
      name: 'chat',
      environment: 'node',
    },
  },
  {
    root: '.',
    test: {
      globalSetup: './test/helper/test-setup.ts',
      setupFiles: ['./test/helper/expectations.ts'],
      include: ['test/react/**/*.test.{tsx,jsx,ts}'],
      name: 'react-hooks',
      environment: 'jsdom',
    },
  },
]);
