import { defineWorkspace } from 'vitest/config';

// defineWorkspace provides a nice type hinting DX
export default defineWorkspace([
  {
    root: '.',
    test: {
      globalSetup: './test/helper/testSetup.ts',
      setupFiles: ['./test/helper/expectations.ts'],
      include: ['test/**/*.test.{ts,js}'],
      name: 'chat-node',
      environment: 'node',
      typecheck: {
        tsconfig: './tsconfig.test.json',
      },
    },
  },
  {
    root: './src/react',
    test: {
      globalSetup: '../../test/helper/testSetup.ts',
      setupFiles: ['../../test/helper/expectations.ts'],
      include: ['test/**/*.test.{tsx,jsx}'],
      name: 'react-hooks-chrome',
      environment: 'jsdom',
      typecheck: {
        tsconfig: './tsconfig.test.json',
      },
      browser: {
        name: 'chromium',
        headless: true,
        enabled: true,
        provider: 'playwright',
      },
    },
  },
  {
    root: './src/react',
    test: {
      globalSetup: '../../test/helper/testSetup.ts',
      setupFiles: ['../../test/helper/expectations.ts'],
      include: ['test/**/*.test.{tsx,jsx}'],
      name: 'react-hooks-firefox',
      environment: 'jsdom',
      typecheck: {
        tsconfig: './tsconfig.test.json',
      },
      browser: {
        name: 'firefox',
        headless: true,
        enabled: true,
        provider: 'playwright',
      },
    },
  },
  {
    root: './src/react',
    test: {
      globalSetup: '../../test/helper/testSetup.ts',
      setupFiles: ['../../test/helper/expectations.ts'],
      include: ['test/**/*.test.{tsx,jsx}'],
      name: 'react-hooks-webkit',
      environment: 'jsdom',
      typecheck: {
        tsconfig: './tsconfig.test.json',
      },
      browser: {
        name: 'webkit',
        enabled: true,
        provider: 'playwright',
      },
    },
  },
]);
