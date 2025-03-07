import { defineWorkspace } from 'vitest/config';

// defineWorkspace provides a nice type hinting DX
export default defineWorkspace([
  {
    root: '.',
    test: {
      globalSetup: './test/helper/test-setup.ts',
      setupFiles: ['./test/helper/expectations.ts'],
      include: ['test/core/**/*.integration.test.{ts,js}'],
      name: 'chat-integration',
      environment: 'node',
    },
  },
  {
    root: '.',
    test: {
      globalSetup: './test/helper/test-setup.ts',
      setupFiles: ['./test/helper/expectations.ts'],
      include: ['test/core/**/*.test.{ts,js}'],
      exclude: ['test/core/**/*.integration.test.{ts,js}'],
      name: 'chat-unit',
      environment: 'node',
    },
  },
  {
    root: '.',
    test: {
      globalSetup: './test/helper/test-setup.ts',
      setupFiles: ['./test/helper/expectations.ts'],
      include: ['test/react/**/*.test.{tsx,jsx,ts}'],
      exclude: ['test/react/**/*.integration.test.{tsx,jsx,ts}'],
      name: 'react-unit',
      environment: 'jsdom',
    },
  },
  {
    root: '.',
    test: {
      globalSetup: './test/helper/test-setup.ts',
      setupFiles: ['./test/helper/expectations.ts'],
      include: ['test/react/**/*.integration.test.{tsx,jsx,ts}'],
      name: 'react-integration',
      environment: 'jsdom',
    },
  },
]);
