import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
      include: ['src/**/*'],
      exclude: ['src/core/index.ts', 'src/react/index.ts', 'src/index.ts', 'src/utils/**/*', 'src/**/vite.config.ts'],
      reporter: ['text', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      thresholds: {
        statements: 96,
        branches: 96,
        functions: 98,
        lines: 96,
      },
      provider: 'v8',
      ignoreEmptyLines: true,
    },
    projects: [
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
    ],
  },
});
