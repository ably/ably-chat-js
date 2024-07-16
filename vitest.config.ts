import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      include: ['src/**/*'],
      exclude: ['src/core/index.ts', 'src/react/index.ts', 'src/utils/**/*'],
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
