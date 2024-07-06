import { defineWorkspace } from 'vitest/config';

// defineWorkspace provides a nice type hinting DX
export default defineWorkspace([
  {
    root: '.',
    test: {
      globalSetup: './test/helper/testSetup.ts',
      include: ['test/**/*.test.{ts,js}'],
      name: 'chat',
      environment: 'node',
    },
  },
  {
    root: './src/react',
    test: {
      globalSetup: '../../test/helper/testSetup.ts',
      include: ['test/**/*.test.{tsx,jsx}'],
      name: 'react-hooks',
      environment: 'jsdom',
    },
  },
]);
