import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      include: ['src/**/*'],
      reporter: ['text', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      thresholds: {
        statements: 93,
        branches: 92,
        functions: 92,
        lines: 93,
      },
    },
  },
});
