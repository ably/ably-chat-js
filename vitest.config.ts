import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      include: ['src/**/*'],
      exclude: ['src/index.ts', 'src/react/src/index.ts'],
      reporter: ['text', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      thresholds: {
        statements: 91,
        branches: 92,
        functions: 92,
        lines: 91,
      },
      provider: 'v8',
      ignoreEmptyLines: true,
    },
  },
});
