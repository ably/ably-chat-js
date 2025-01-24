import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '.',
  test: {
    globalSetup: '../shared/testhelper/test-setup.ts',
    setupFiles: ['../shared/testhelper/expectations.ts'],
    include: ['test/**/*.test.{ts,js}'],
    name: 'chat',
    environment: 'node',
    coverage: {
      enabled: true,
      include: ['src/**/*'],
      exclude: ['src/index.ts', 'src/utils/**/*'],
      reporter: ['text', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      thresholds: {
        statements: 92,
        branches: 93,
        functions: 92,
        lines: 92,
      },
      provider: 'v8',
      ignoreEmptyLines: true,
    },
  },
});
